import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import './Header.css';
import Modal from './Modal';
import { useAuth } from '../context/AuthContext';
import { User } from 'lucide-react';

function formatDateForHeader(d: Date) {
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function Header() {
  const { pathname } = useLocation();
  const [profileOpen, setProfileOpen] = useState(false);
  const { user, signInWithGoogle, signOut } = useAuth();
  const session = user ? { name: user.displayName || '', email: user.email || '' } : null;
  let title = 'App';
  if (pathname === '/') title = 'Today';
  else if (pathname.startsWith('/habits')) title = 'Habits';
  else if (pathname.startsWith('/calendar')) title = 'Calendar';

  // show header only when user is authenticated
  if (!user) return null;

  return (
    <>
      <header className="app-header">
        <div className="app-header-inner">
          <h1 className="app-title">{title}</h1>
          <div className="app-header-right">
            <button className="profile-btn" aria-label="Open profile" onClick={() => setProfileOpen(true)}><User size={16} /></button>
          </div>
        </div>
      </header>

      <Modal open={profileOpen} onClose={() => setProfileOpen(false)} title="Profile">
        {session ? (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontWeight: 700 }}>{session.name}</div>
              <div style={{ color: 'var(--muted)' }}>{session.email}</div>
            </div>
            <div className="modal-actions" style={{ marginTop: 12 }}>
              <div className="modal-actions-left">
                <button className="btn btn-danger" onClick={async () => { await signOut(); setProfileOpen(false); }}>Logout</button>
              </div>
              <div className="modal-actions-right">
                <button className="btn" onClick={() => setProfileOpen(false)}>Close</button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontWeight: 700 }}>Not signed in</div>
              <div style={{ color: 'var(--muted)' }}>Sign in to sync your habits</div>
            </div>
            <div className="modal-actions" style={{ marginTop: 12 }}>
              <div className="modal-actions-left">
                <button className="btn btn-primary" onClick={async () => { await signInWithGoogle(); setProfileOpen(false); }}>Sign in with Google</button>
              </div>
              <div className="modal-actions-right">
                <button className="btn" onClick={() => setProfileOpen(false)}>Close</button>
              </div>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
