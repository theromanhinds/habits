import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { DEFAULT_CATEGORY } from '../constants/categories';
import { db } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';
import { doc, getDoc, onSnapshot, setDoc, serverTimestamp, updateDoc, deleteField } from 'firebase/firestore';
import { todayLocalIso } from '../utils/dates';

type Habit = {
  id: string;
  name: string;
  morning_evening: boolean;
  category?: string;
  start_date?: string; // ISO date string YYYY-MM-DD
};

type ContextValue = {
  habits: Habit[];
  addHabit: (h: Omit<Habit, 'id'>) => void;
  removeHabit: (id: string) => void;
  toggleMorningEvening: (id: string) => void;
  updateHabit: (id: string, data: Partial<Omit<Habit, 'id'>>) => void;
  reorderHabit: (fromIndex: number, toIndex: number) => void;
  // note: when and date are optional — when omitted, defaults to today
  cycleCompletion: (id: string, when: 'morning' | 'evening' | 'single', date?: string) => void;
  getCompletion: (id: string, when: 'morning' | 'evening' | 'single', date?: string) => number;
  // calendar helpers
  cycleCompletionDate: (id: string, date: string) => void;
  getDayState: (id: string, date: string) => number;
  // force an immediate sync of current local data to Firestore (returns promise)
  syncNow: () => Promise<void>;
  // sync only today's completions to Firestore (does not alter habits array)
  syncTodayCompletions: () => Promise<void>;
};

const STORAGE_KEY = 'habits.v1';

const HabitsContext = createContext<ContextValue | undefined>(undefined);

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

export const HabitsProvider: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const [habits, setHabits] = useState<Habit[]>([]);
  // completions: habitId -> dateISO -> { morning?: number; evening?: number; single?: number }
  const [completions, setCompletions] = useState<Record<string, Record<string, { morning?: number; evening?: number; single?: number }>>>({});
  const userRef = useRef<any>(null);
  const unsubscribeRef = useRef<() => void | null>(null);
  const writeTimer = useRef<any>(null);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as any[];
        const migrated: Habit[] = parsed.map(p => {
          if (typeof p.morning_evening === 'boolean') return p as Habit;
          const morning = !!p.morning;
          const evening = !!p.evening;
          return { id: p.id || uid(), name: p.name || '', morning_evening: morning && evening };
        });
        // If there are existing habits, use them and also try to load completions.
        if (migrated && migrated.length > 0) {
          setHabits(migrated);
          try {
            const rawComp = localStorage.getItem(STORAGE_KEY + '.completions');
            if (rawComp) {
              const parsedComp = JSON.parse(rawComp) as any;
              // Migration: handle both flat (habitId -> status) and per-date shapes
              const today = todayLocalIso();
              const migrated: Record<string, Record<string, { morning?: number; evening?: number; single?: number }>> = {};
              Object.keys(parsedComp || {}).forEach(hid => {
                const val = parsedComp[hid];
                const isFlat = typeof val?.morning === 'number' || typeof val?.evening === 'number' || typeof val?.single === 'number';
                if (isFlat) migrated[hid] = { [today]: val };
                else migrated[hid] = val || {};
              });
              setCompletions(migrated || {});
            }
          } catch (e) {
            // ignore
          }
          return;
        }
      } catch (e) {
        // ignore
      }
    }
    // start with no habits by default; user will add habits via UI
    setHabits([]);
    setCompletions({});
  }, []);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(habits)); } catch {}
  }, [habits]);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY + '.completions', JSON.stringify(completions)); } catch {}
  }, [completions]);

  // listen to auth state and sync with Firestore per-user data
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (u) => {
      // clear any previous listener
      if (unsubscribeRef.current) {
        try { unsubscribeRef.current(); } catch {}
        unsubscribeRef.current = null;
      }

      if (!u) {
        userRef.current = null;
        return;
      }

      userRef.current = u;

      // read server-side record and merge with local (single fetch only)
      try {
        const userDoc = doc(db, 'users', u.uid);
        const snap = await getDoc(userDoc);
        if (snap.exists()) {
          const data = snap.data() as any;
          // merge strategy: server wins for newer updatedAt, otherwise local wins
          // support Firestore Timestamp or numeric
          let serverUpdated = 0;
          if (data.updatedAt && typeof data.updatedAt === 'object' && typeof data.updatedAt.toMillis === 'function') {
            serverUpdated = data.updatedAt.toMillis();
          } else if (typeof data.updatedAt === 'number') {
            serverUpdated = data.updatedAt;
          }
          const localRaw = localStorage.getItem(STORAGE_KEY + '.meta');
          let localUpdated = 0;
          try { const meta = localRaw ? JSON.parse(localRaw) : null; localUpdated = meta?.updatedAt || 0; } catch {}

          if (serverUpdated >= localUpdated) {
            // trust server
            const sHabits = data.habits || [];
            const sCompletions = data.completions || {};
            setHabits(sHabits);
            setCompletions(sCompletions);
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify(sHabits)); } catch {}
            try { localStorage.setItem(STORAGE_KEY + '.completions', JSON.stringify(sCompletions)); } catch {}
            try { localStorage.setItem(STORAGE_KEY + '.meta', JSON.stringify({ updatedAt: serverUpdated })); } catch {}
          } else {
            // local is newer: push local to server
            scheduleWriteToUserDoc(true);
          }
        } else {
          // no server record - create one from local
          scheduleWriteToUserDoc(true);
        }
      } catch (e) {
        // ignore firestore errors - app still works offline/local
        // eslint-disable-next-line no-console
        console.error('[habits] Firestore sync failed', e);
      }
    });

    return () => {
      try { unsubAuth(); } catch {}
      if (unsubscribeRef.current) {
        try { unsubscribeRef.current(); } catch {}
        unsubscribeRef.current = null;
      }
    };
  }, []);

  // helper: schedule a debounced write to the current user's doc
  function scheduleWriteToUserDoc(immediate = false) {
    if (!userRef.current) return;
      const doWrite = async () => {
      const u = userRef.current;
      if (!u) return;
      const userDoc = doc(db, 'users', u.uid);
      try {
        await setDoc(userDoc, { habits, completions, updatedAt: serverTimestamp() }, { merge: true });
        try { localStorage.setItem(STORAGE_KEY + '.meta', JSON.stringify({ updatedAt: Date.now() })); } catch {}
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('[habits] Failed to write habits to Firestore', e);
      }
    };

    if (immediate) {
      if (writeTimer.current) { clearTimeout(writeTimer.current); writeTimer.current = null; }
      void doWrite();
      return;
    }

    if (writeTimer.current) clearTimeout(writeTimer.current);
    writeTimer.current = setTimeout(() => { void doWrite(); writeTimer.current = null; }, 500);
  }

  // public: force an immediate write of current local state to Firestore
  async function syncNow() {
    if (!userRef.current) return;
    if (writeTimer.current) { clearTimeout(writeTimer.current); writeTimer.current = null; }
    const u = userRef.current;
    const userDoc = doc(db, 'users', u.uid);
    try {
      await setDoc(userDoc, { habits, completions, updatedAt: serverTimestamp() }, { merge: true });
      try { localStorage.setItem(STORAGE_KEY + '.meta', JSON.stringify({ updatedAt: Date.now() })); } catch {}
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[habits] syncNow failed', e);
      throw e;
    }
  }

  // sync only today's completions (for all habits) to Firestore
  async function syncTodayCompletions() {
    const currentUser = userRef.current || auth.currentUser;
    if (!currentUser) {
      // eslint-disable-next-line no-console
      console.warn('[habits] syncTodayCompletions called but no authenticated user available');
      return;
    }
    // use local ISO (YYYY-MM-DD) to match how completions keys are stored
    const today = todayLocalIso();
    // build partial completions object containing only today's entries
    const partialCompletions: Record<string, any> = {};
    Object.keys(completions).forEach(hid => {
      const dayEntry = completions[hid]?.[today];
      if (dayEntry && Object.keys(dayEntry).length > 0) {
        partialCompletions[hid] = { [today]: dayEntry };
      }
    });

    if (Object.keys(partialCompletions).length === 0) {
      // nothing to sync
      return;
    }

    const userDoc = doc(db, 'users', currentUser.uid);
    try {
      // merge only the nested completions for today
      await setDoc(userDoc, { completions: partialCompletions, updatedAt: serverTimestamp() }, { merge: true });
      try { localStorage.setItem(STORAGE_KEY + '.meta', JSON.stringify({ updatedAt: Date.now() })); } catch {}
      // eslint-disable-next-line no-console
      console.info('[habits] syncTodayCompletions: wrote todays completions for user', currentUser.uid);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[habits] syncTodayCompletions failed', e);
      throw e;
    }
  }

  function addHabit(h: Omit<Habit, 'id'>) {
  const newH: Habit = { id: uid(), category: h.category || DEFAULT_CATEGORY, start_date: h.start_date || todayLocalIso(), ...h };
    setHabits(prev => {
      const next = [newH, ...prev];
      // fire-and-forget: write the new habits array to Firestore so adds propagate immediately
      const currentUser = userRef.current || auth.currentUser;
      if (currentUser) {
        const u = currentUser;
        const userDoc = doc(db, 'users', u.uid);
        (async () => {
          try {
            // write only the habits array (merge true so completions are untouched)
            await setDoc(userDoc, { habits: next, updatedAt: serverTimestamp() }, { merge: true });
            try { localStorage.setItem(STORAGE_KEY + '.meta', JSON.stringify({ updatedAt: Date.now() })); } catch {}
            // eslint-disable-next-line no-console
            console.info('[habits] addHabit: wrote new habit to Firestore for user', u.uid);
          } catch (e) {
            // eslint-disable-next-line no-console
            console.error('[habits] addHabit: failed to write new habit to Firestore', e);
          }
        })();
      }
      return next;
    });
    // initialize completion
    setCompletions(prev => ({ ...prev, [newH.id]: {} }));
  }

  function removeHabit(id: string) {
    // update local state first
    setHabits(prev => {
      const next = prev.filter(h => h.id !== id);

      // cleanup local completions for the habit
      setCompletions(prevC => {
        const nextC = { ...prevC };
        delete nextC[id];
        return nextC;
      });

      // attempt to update server: write updated habits array and delete completions.<id>
      const currentUser = userRef.current || auth.currentUser;
      if (currentUser) {
        const u = currentUser;
        const userDoc = doc(db, 'users', u.uid);
        (async () => {
          try {
            // try updateDoc to modify fields atomically
            // eslint-disable-next-line no-console
            console.info('[habits] removeHabit: removing habit on server', id, 'for user', u.uid);
            await updateDoc(userDoc, { habits: next, [`completions.${id}`]: deleteField(), updatedAt: serverTimestamp() });
          } catch (e) {
            // fallback to setDoc if updateDoc failed (e.g. doc missing)
            try {
              // eslint-disable-next-line no-console
              console.info('[habits] removeHabit: updateDoc failed, falling back to setDoc', e);
              await setDoc(userDoc, { habits: next, updatedAt: serverTimestamp() }, { merge: true });
            } catch (err) {
              // eslint-disable-next-line no-console
              console.error('[habits] removeHabit: failed to persist deletion to server', err);
            }
          }
        })();
      } else {
        // eslint-disable-next-line no-console
        console.warn('[habits] removeHabit: no authenticated user; skipping remote cleanup for', id);
      }

      return next;
    });
  }

  function toggleMorningEvening(id: string) {
    setHabits(prev => prev.map(h => h.id === id ? { ...h, morning_evening: !h.morning_evening } : h));
  }

  function updateHabit(id: string, data: Partial<Omit<Habit, 'id'>>) {
    setHabits(prev => {
      const next = prev.map(h => h.id === id ? { ...h, ...data } : h);
      // write updated habits array to Firestore immediately so edits propagate
      const currentUser = userRef.current || auth.currentUser;
      if (currentUser) {
        const u = currentUser;
        const userDoc = doc(db, 'users', u.uid);
        (async () => {
          try {
            // eslint-disable-next-line no-console
            console.info('[habits] updateHabit: writing updated habits for user', u.uid, 'habit', id);
            await setDoc(userDoc, { habits: next, updatedAt: serverTimestamp() }, { merge: true });
            try { localStorage.setItem(STORAGE_KEY + '.meta', JSON.stringify({ updatedAt: Date.now() })); } catch {}
          } catch (e) {
            // eslint-disable-next-line no-console
            console.error('[habits] updateHabit: failed to write updated habits to Firestore', e);
          }
        })();
      }
      return next;
    });

    // if morning_evening is changing, migrate completions for that habit
    if (typeof data.morning_evening === 'boolean') {
      setCompletions(prev => {
        const habitComp = prev[id] || {};
        const nextComp: Record<string, { morning?: number; evening?: number; single?: number }> = {};
        const wasME = habits.find(h => h.id === id)?.morning_evening ?? false;
        const willBeME = data.morning_evening;

        Object.keys(habitComp).forEach(date => {
          const day = habitComp[date];
          if (!wasME && willBeME) {
            // non-M&E -> M&E: expand `single` into morning & evening
            const single = day.single ?? 0;
            // rules: copy single into both morning and evening
            nextComp[date] = { morning: single, evening: single };
          } else if (wasME && !willBeME) {
            // M&E -> non-M&E: aggregate morning & evening into single
            const m = day.morning ?? 0;
            const e = day.evening ?? 0;
            // precedence: any failure (2) -> failure; both success (1) -> success; both incomplete (0) -> incomplete;
            // success+incomplete -> success
            let single = 0;
            if (m === 2 || e === 2) single = 2;
            else if (m === 1 && e === 1) single = 1;
            else if ((m === 1 && e === 0) || (m === 0 && e === 1)) single = 1;
            else single = 0;
            nextComp[date] = { single };
          } else {
            // no change in type — keep existing shape but clean it
            const clean: { morning?: number; evening?: number; single?: number } = {};
            if (willBeME) {
              if (typeof day.morning === 'number') clean.morning = day.morning;
              if (typeof day.evening === 'number') clean.evening = day.evening;
            } else {
              if (typeof day.single === 'number') clean.single = day.single;
            }
            nextComp[date] = clean;
          }
        });

        return { ...prev, [id]: nextComp };
      });
    }
  }

  function reorderHabit(fromIndex: number, toIndex: number) {
    setHabits(prev => {
      const next = [...prev];
      if (fromIndex < 0 || fromIndex >= next.length) return prev;
      if (toIndex < 0) toIndex = 0;
      if (toIndex >= next.length) toIndex = next.length - 1;
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }

  // convenience: cycle completion for today when only id/when provided
  function cycleCompletion(id: string, when: 'morning' | 'evening' | 'single', date?: string) {
  const d = date || todayLocalIso();
    setCompletions(prev => {
      const habit = prev[id] || {};
      const dayObj = habit[d] || {};
      const curVal = dayObj[when] ?? 0;
      const next = (curVal + 1) % 3;
      const nextDay = { ...dayObj, [when]: next };
      return { ...prev, [id]: { ...habit, [d]: nextDay } };
    });
  }

  function getCompletion(id: string, when: 'morning' | 'evening' | 'single', date?: string) {
  const d = date || todayLocalIso();
    return completions[id]?.[d]?.[when] ?? 0;
  }

  // calendar helpers
  function cycleCompletionDate(id: string, date: string) {
    setCompletions(prev => {
      const habit = prev[id] || {};
      const dayObj = habit[date] || {};
      // cycle overall value for the date
      // For M&E habits we toggle both morning and evening; for single-type habits we toggle only `single`.
      const cur = dayObj.single ?? dayObj.morning ?? dayObj.evening ?? 0;
      const next = (cur + 1) % 3;
      // determine whether this habit is a morning_evening type
      const isME = habits.find(h => h.id === id)?.morning_evening ?? false;
      let nextDay: { morning?: number; evening?: number; single?: number };
      if (isME) {
        nextDay = { ...dayObj, morning: next, evening: next };
        // don't set `single` for M&E habits to avoid storing redundant fields
        if ('single' in nextDay) delete nextDay.single;
      } else {
        nextDay = { ...dayObj, single: next };
        // remove morning/evening if previously present to keep the shape clean
        if ('morning' in nextDay) delete nextDay.morning;
        if ('evening' in nextDay) delete nextDay.evening;
      }
      return { ...prev, [id]: { ...habit, [date]: nextDay } };
    });
  }

  function getDayState(id: string, date: string) {
    const dayObj = completions[id]?.[date];
    if (!dayObj) return 0;
    const vals = [dayObj.single, dayObj.morning, dayObj.evening].filter(v => typeof v === 'number') as number[];
    if (vals.includes(2)) return 2;
    if (vals.includes(1)) return 1;
    return 0;
  }

  return (
    <HabitsContext.Provider value={{ habits, addHabit, removeHabit, toggleMorningEvening, updateHabit, reorderHabit, cycleCompletion, getCompletion, cycleCompletionDate, getDayState, syncNow, syncTodayCompletions }}>
      {children}
    </HabitsContext.Provider>
  );
};

export function useHabits() {
  const ctx = useContext(HabitsContext);
  if (!ctx) throw new Error('useHabits must be used within HabitsProvider');
  return ctx;
}
