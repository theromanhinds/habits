import React from 'react';
import { Routes, Route } from 'react-router-dom';
import './App.css';
import Home from './pages/Home';
import Habits from './pages/Habits';
import Calendar from './pages/Calendar';
import BottomNav from './components/BottomNav';

function App() {
  return (
    <div className="App app-container">
      <main className="app-content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/habits" element={<Habits />} />
          <Route path="/calendar" element={<Calendar />} />
        </Routes>
      </main>
      <BottomNav />
    </div>
  );
}

export default App;
