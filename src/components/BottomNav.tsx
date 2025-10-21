import React from 'react';
import { NavLink } from 'react-router-dom';
import { List, Home, Calendar } from 'lucide-react';
import './BottomNav.css';
import { useAuth } from '../context/AuthContext';

export default function BottomNav() {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <nav className="bottom-nav" role="navigation" aria-label="Primary">
      <NavLink to="/habits" className="nav-item">
        <List size={20} />
        <span className="nav-label">Habits</span>
      </NavLink>

      <NavLink to="/" end className="nav-item">
        <Home size={20} />
        <span className="nav-label">Home</span>
      </NavLink>

      <NavLink to="/calendar" className="nav-item">
        <Calendar size={20} />
        <span className="nav-label">Calendar</span>
      </NavLink>
    </nav>
  );
}
