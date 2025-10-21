import React, { useMemo, useState, useEffect } from 'react';
import Header from '../components/Header';
import './calendar.css';
import { useHabits } from '../context/HabitsContext';
import { localIsoDate, todayLocalIso } from '../utils/dates';

function startOfWeek(d: Date) {
  // week starts Monday (robust handling for Sunday)
  const copy = new Date(d);
  const day = copy.getDay(); // 0 = Sunday, 1 = Monday, ...
  // calculate difference to Monday
  const diff = copy.getDate() - day + (day === 0 ? -6 : 1);
  copy.setDate(diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function isoDate(d: Date) {
  return localIsoDate(d);
}

function formatWeekLabel(weekStart: Date) {
  const today = new Date();
  const thisWeekStart = startOfWeek(today);
  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(thisWeekStart.getDate() - 7);

  if (weekStart.getTime() === thisWeekStart.getTime()) return 'This Week';
  if (weekStart.getTime() === lastWeekStart.getTime()) return 'Last Week';

  const end = new Date(weekStart);
  end.setDate(end.getDate() + 6);
  const startStr = weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const endStr = end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${startStr} - ${endStr}`;
}

export default function Calendar() {
  const { habits, getDayState, cycleCompletionDate, getCompletion, cycleCompletion, syncNow } = useHabits();
  const [mode, setMode] = useState<'week' | 'month'>('week');
  const [editable, setEditable] = useState<boolean>(false);
  const [editConfirm, setEditConfirm] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('calendar.editable');
      setEditable(raw === '1');
    } catch (e) {}
  }, []);

  function toggleEditable() {
    // If currently editable, disable immediately. If not, start confirm flow.
    setEditable(prev => {
      if (prev) {
        // when disabling editing, push current data to Firestore
        void syncNow();
        try { localStorage.setItem('calendar.editable', '0'); } catch (e) {}
        return false;
      }
      // otherwise, trigger inline confirm
      setEditConfirm(true);
      return prev;
    });
  }

  function confirmEnableEditing() {
    setEditable(true);
    try { localStorage.setItem('calendar.editable', '1'); } catch (e) {}
    setEditConfirm(false);
  }

  function cancelEnableEditing() {
    setEditConfirm(false);
  }

  // determine earliest habit start date (ISO) to limit calendar view
  const earliestIso = useMemo(() => {
    if (!habits || habits.length === 0) return todayLocalIso();
    let min = null as string | null;
    for (const h of habits) {
      if (h.start_date) {
        if (!min || h.start_date < min) min = h.start_date;
      }
    }
    return (min || todayLocalIso());
  }, [habits]);

  // build weeks from current week back to the week that contains earliestIso
  const weeks = useMemo(() => {
    const out: Date[] = [];
    const today = new Date();
    let wstart = startOfWeek(today);
    const earliestWeekStart = startOfWeek(new Date(earliestIso));
    // push weeks from current back to earliestWeekStart (inclusive)
    while (wstart >= earliestWeekStart) {
      out.push(new Date(wstart));
      const prev = new Date(wstart);
      prev.setDate(prev.getDate() - 7);
      wstart = prev;
    }
    return out;
  }, [earliestIso]);

  if (mode === 'month') {
    // placeholder for later month view
  }

  return (
    <div className="page calendar">
      <Header />
      <div className="calendar-controls">
        <div>
          <button className={`btn ${mode === 'week' ? 'btn-primary' : ''}`} onClick={() => setMode('week')}>Week</button>
          <button className={`btn ${mode === 'month' ? 'btn-primary' : ''}`} onClick={() => setMode('month')}>Month</button>
        </div>
        <div>
          {!editConfirm && (
            <button className={`btn btn-outline ${editable ? 'btn-primary' : ''}`} onClick={toggleEditable} aria-pressed={editable} title={editable ? 'Disable editing' : 'Enable editing'}>
              {editable ? 'Disable editing' : 'Enable editing'}
            </button>
          )}
          {editConfirm && (
            <>
              <span className="muted">Confirm enable editing?</span>
              <button className="btn" onClick={cancelEnableEditing}>Cancel</button>
              <button className="btn btn-primary" onClick={confirmEnableEditing}>Confirm</button>
            </>
          )}
        </div>
      </div>

      {mode === 'week' && (
        <>
          {habits.length === 0 ? (
            <div className="weeks-root" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 240 }}>
              <div style={{ textAlign: 'center', color: 'var(--muted)' }}>No habit history</div>
            </div>
          ) : (
            <div className="weeks-root">
              {weeks.map((ws, idx) => (
                <div key={isoDate(ws)} className="week-card">
                  <div className="week-header">{formatWeekLabel(ws)}</div>
                  <div className="week-body">
                    {habits.map(h => (
                      <div key={h.id} className="week-row">
                        <div className="week-habit-name">{h.name}</div>
                        <div className="week-days">
                          {Array.from({ length: 7 }).map((_, i) => {
                            const d = new Date(ws);
                            d.setDate(ws.getDate() + i);
                            const iso = isoDate(d);
                            const state = getDayState(h.id, iso);
                            // If this habit uses morning/evening tracking, render two half-squircles
                            if (h.morning_evening) {
                              const mVal = getCompletion(h.id, 'morning', iso);
                              const eVal = getCompletion(h.id, 'evening', iso);
                              return (
                                <div key={iso} className="squircle multi" title={`${iso}: morning ${mVal}, evening ${eVal}`}>
                                  <button
                                    className={`half left ${mVal === 1 ? 'done' : mVal === 2 ? 'failed' : ''}`}
                                    onClick={() => cycleCompletion(h.id, 'morning', iso)}
                                    disabled={!editable}
                                    aria-disabled={!editable}
                                    aria-label={`${h.name} ${iso} morning: ${mVal === 0 ? 'neutral' : mVal === 1 ? 'done' : 'failed'}`}
                                  />
                                  <button
                                    className={`half right ${eVal === 1 ? 'done' : eVal === 2 ? 'failed' : ''}`}
                                    onClick={() => cycleCompletion(h.id, 'evening', iso)}
                                    disabled={!editable}
                                    aria-disabled={!editable}
                                    aria-label={`${h.name} ${iso} evening: ${eVal === 0 ? 'neutral' : eVal === 1 ? 'done' : 'failed'}`}
                                  />
                                </div>
                              );
                            }

                            return (
                              <button
                                key={iso}
                                className={`squircle ${state === 1 ? 'done' : state === 2 ? 'failed' : ''}`}
                                onClick={() => cycleCompletionDate(h.id, iso)}
                                disabled={!editable}
                                aria-disabled={!editable}
                                title={`${iso}: ${state === 0 ? 'neutral' : state === 1 ? 'done' : 'failed'}`}
                              />
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {mode === 'month' && (
        <>
          {habits.length === 0 ? (
            <div className="months-root" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 240 }}>
              <div style={{ textAlign: 'center', color: 'var(--muted)' }}>No habit history</div>
            </div>
          ) : (
            <div className="months-root">
              {/* Overlay to hide the month view while under construction */}
              <div className="month-overlay" role="status" aria-live="polite">Under construction</div>
              {(() => {
                const months: Date[] = [];
                const now = new Date();
                // compute earliest month start based on earliestIso
                const earliest = new Date(earliestIso);
                const earliestMonthStart = new Date(earliest.getFullYear(), earliest.getMonth(), 1);
                // iterate from current month back to earliestMonthStart
                let cursor = new Date(now.getFullYear(), now.getMonth(), 1);
                while (cursor >= earliestMonthStart) {
                  months.push(new Date(cursor));
                  cursor = new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1);
                }
                return months.map(mo => {
                  const year = mo.getFullYear();
                  const monthIndex = mo.getMonth();
                  const days = new Date(year, monthIndex + 1, 0).getDate();
                  return (
                    <div className="month-card" key={`${year}-${monthIndex}`}>
                      <div className="month-header">{mo.toLocaleString(undefined, { month: 'long', year: 'numeric' })}</div>
                      <div className="month-grid">
                        {/* For month view: render habit names as rotated column headers and stack squircles under each habit */}
                        <div className="month-columns">
                          {habits.map(h => (
                            <div className="habit-col" key={h.id}>
                              <div className="habit-header" aria-hidden="true">{h.name}</div>
                              <div className="habit-body">
                                {Array.from({ length: days }).map((_, di) => {
                                  const dayNum = di + 1;
                                  const d = new Date(year, monthIndex, dayNum);
                                  const iso = isoDate(d);
                                  const state = getDayState(h.id, iso);
                                  if (h.morning_evening) {
                                    const mVal = getCompletion(h.id, 'morning', iso);
                                    const eVal = getCompletion(h.id, 'evening', iso);
                                    return (
                                      <div key={iso} className="squircle multi" title={`${h.name} — ${iso}`}>
                                          <button
                                            className={`half left ${mVal === 1 ? 'done' : mVal === 2 ? 'failed' : ''}`}
                                            onClick={() => cycleCompletion(h.id, 'morning', iso)}
                                            disabled={!editable}
                                            aria-disabled={!editable}
                                            aria-pressed={mVal !== 0}
                                            aria-label={`${h.name} ${dayNum} morning: ${mVal === 0 ? 'neutral' : mVal === 1 ? 'done' : 'failed'}`}
                                          />
                                          <button
                                            className={`half right ${eVal === 1 ? 'done' : eVal === 2 ? 'failed' : ''}`}
                                            onClick={() => cycleCompletion(h.id, 'evening', iso)}
                                            disabled={!editable}
                                            aria-disabled={!editable}
                                            aria-pressed={eVal !== 0}
                                            aria-label={`${h.name} ${dayNum} evening: ${eVal === 0 ? 'neutral' : eVal === 1 ? 'done' : 'failed'}`}
                                          />
                                        </div>
                                      );
                                  }

                                  return (
                                    <button
                                      key={iso}
                                      className={`squircle ${state === 1 ? 'done' : state === 2 ? 'failed' : ''}`}
                                      onClick={() => cycleCompletionDate(h.id, iso)}
                                      disabled={!editable}
                                      aria-disabled={!editable}
                                      title={`${h.name} — ${iso}`}
                                      aria-label={`${h.name} ${dayNum}: ${state === 0 ? 'neutral' : state === 1 ? 'done' : 'failed'}`}
                                    />
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          )}
        </>
      )}
    </div>
  );
}
