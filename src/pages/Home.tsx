import React from 'react';
import { useHabits } from '../context/HabitsContext';
import { useAuth } from '../context/AuthContext';
import './Home.css';
import { CATEGORY_COLORS } from '../constants/categories';
import { Check, X, Sun, Moon } from 'lucide-react';
import Header from '../components/Header';


function hexToRgba(hex: string, alpha = 1) {
  // sanitize
  const cleaned = hex.replace('#', '');
  const bigint = parseInt(cleaned.length === 3 ? cleaned.split('').map(c => c + c).join('') : cleaned, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function Home() {
  const { habits, cycleCompletion, getCompletion, syncTodayCompletions } = useHabits();
  const { user, signInWithGoogle } = useAuth();

  const todayStr = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

  const renderButton = (id: string, when: 'morning' | 'evening' | 'single') => {
    const state = getCompletion(id, when); // 0 neutral,1 done,2 failed
    const className = ['tri-btn', state === 1 ? 'done' : '', state === 2 ? 'failed' : ''].join(' ');
    return (
      <button
        key={when}
        className={className}
        onClick={() => cycleCompletion(id, when)}
        aria-pressed={state !== 0}
        title={state === 0 ? 'Mark' : state === 1 ? 'Mark failed' : 'Clear'}
      >
        {state === 0 && <span className="dot" />}
        {state === 1 && <Check size={14} />}
        {state === 2 && <X size={14} />}
      </button>
    );
  };

  if (!user) {
    return (
      <>
        <Header />
        <div className="page home" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 18, marginBottom: 8 }}>You're not signed in</div>
            <div style={{ color: 'var(--muted)', marginBottom: 16 }}>Sign in to sync your habits and see your home screen.</div>
            <div>
              <button className="btn btn-primary" onClick={async () => { await signInWithGoogle(); }}>Sign in with Google</button>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Header />
      <div className="page home">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px 8px 20px' }}>
          <div className="home-date">{todayStr}</div>
          <div>
            <button className="btn btn-primary" onClick={() => void syncTodayCompletions()}>Submit</button>
          </div>
        </div>
        {habits.length === 0 && <p>No habits yet — add some on the Habits page.</p>}
        <ul className="habit-list">
          {habits.map(h => (
            <li
              className="habit-row"
              key={h.id}
              style={{ background: `linear-gradient(180deg, rgba(0,0,0,0.01), rgba(0,0,0,0)), ${hexToRgba(CATEGORY_COLORS[h.category || 'General'] || '#000', 0.19)}` }}
            >
              <div style={{display: 'flex', alignItems: 'center', gap: 12}}>
                <div className="habit-name">{h.name}</div>
                {h.morning_evening && (
                  <div className="icon-flag" aria-label="Morning and evening habit" title="Morning & Evening">
                    <Sun className="icon-sun" size={14} />
                    <Moon className="icon-moon" size={14} />
                  </div>
                )}
              </div>
              <div className={h.morning_evening ? 'controls two' : 'controls single'}>
                {h.morning_evening ? (
                  <>
                    {renderButton(h.id, 'morning')}
                    {renderButton(h.id, 'evening')}
                  </>
                ) : (
                  renderButton(h.id, 'single')
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
