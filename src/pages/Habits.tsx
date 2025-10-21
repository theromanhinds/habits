import React, { useEffect, useRef, useState } from 'react';
import { Sun, Moon, Edit2, GripVertical } from 'lucide-react';
import { DndContext, closestCenter, PointerActivationConstraint } from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Modal from '../components/Modal';
import './habits.css';
import { useHabits } from '../context/HabitsContext';
import { CATEGORY_COLORS } from '../constants/categories';
import Header from '../components/Header';

function hexToRgba(hex: string, alpha = 1) {
  const cleaned = hex.replace('#', '');
  const bigint = parseInt(cleaned.length === 3 ? cleaned.split('').map(c => c + c).join('') : cleaned, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function Habits() {
  const { habits, addHabit, removeHabit, toggleMorningEvening, updateHabit, reorderHabit } = useHabits();
  const { syncNow } = useHabits();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [morningEvening, setMorningEvening] = useState(false);
  const [category, setCategory] = useState<string>('General');
  // start date state as year/month/day for the 3-column picker
  const [showDatePicker, setShowDatePicker] = useState(false);
  const today = new Date();
  const isoToday = today.toISOString().slice(0, 10);
  const [year, setYear] = useState<number>(today.getFullYear());
  const [month, setMonth] = useState<number>(today.getMonth() + 1); // 1-12
  const [day, setDay] = useState<number>(today.getDate());
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  // refs for wheel columns
  const monthRef = useRef<HTMLDivElement | null>(null);
  const dayRef = useRef<HTMLDivElement | null>(null);
  const yearRef = useRef<HTMLDivElement | null>(null);

  const months = Array.from({ length: 12 }).map((_, i) => new Date(0, i).toLocaleString(undefined, { month: 'long' }));
  // years: two previous years up to current (ascending so current appears at bottom)
  const years = [today.getFullYear() - 2, today.getFullYear() - 1, today.getFullYear()];
  const minYear = Math.min(...years);
  const maxYear = Math.max(...years);

  function daysInMonth(y: number, m: number) {
    return new Date(y, m, 0).getDate(); // m is 1-12, Date(y,m,0) returns last day of previous month, so this works
  }

  function handleKey(e: React.KeyboardEvent, col: 'month' | 'day' | 'year') {
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      if (col === 'month') setMonth(prev => Math.max(1, prev - 1));
      if (col === 'day') setDay(prev => Math.max(1, prev - 1));
  if (col === 'year') setYear(prev => Math.max(minYear, prev - 1));
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      if (col === 'month') setMonth(prev => Math.min(12, prev + 1));
      if (col === 'day') setDay(prev => Math.min(daysInMonth(year, month), prev + 1));
      if (col === 'year') setYear(prev => Math.min(maxYear, prev + 1));
    }
  }

  // clamp day when month/year change to avoid invalid date (e.g., Feb 30)
  useEffect(() => {
    const maxD = daysInMonth(year, month);
    if (day > maxD) setDay(maxD);
  }, [year, month]);

  // scroll selected into view when picker opens or values change
  useEffect(() => {
    if (!showDatePicker) return;
    const mEl = monthRef.current?.querySelector('.wheel-item.selected') as HTMLElement | null;
    const dEl = dayRef.current?.querySelector('.wheel-item.selected') as HTMLElement | null;
    const yEl = yearRef.current?.querySelector('.wheel-item.selected') as HTMLElement | null;
    mEl?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    dEl?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    yEl?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [showDatePicker, month, day, year]);

  useEffect(() => {
    if (open) {
      // focus the input when modal opens
      setTimeout(() => nameInputRef.current?.focus(), 0);
    }
  }, [open]);

  function onAdd() {
    setName('');
    setMorningEvening(false);
    setDeleteConfirm(false);
    // reset date picker to today
    setYear(today.getFullYear());
    setMonth(today.getMonth() + 1);
    setDay(today.getDate());
    setShowDatePicker(true); // show picker when creating a new habit by default
    setOpen(true);
  }

  function onEdit(h: { id: string; name: string; morning_evening: boolean }) {
    setEditingId(h.id);
    setName(h.name);
    setMorningEvening(h.morning_evening);
    setDeleteConfirm(false);
    // initialize date fields from habit (if present) or today
    const sd = (habits.find(x => x.id === h.id) as any)?.start_date;
    if (sd) {
      const parts = sd.split('-').map((p: string) => parseInt(p, 10));
      if (parts.length === 3) {
        setYear(parts[0]);
        setMonth(parts[1]);
        setDay(parts[2]);
      }
    } else {
      setYear(today.getFullYear());
      setMonth(today.getMonth() + 1);
      setDay(today.getDate());
    }
    // initialize category from habit if available
    const hcat = (habits.find(x => x.id === h.id) as any)?.category;
    setCategory(hcat || 'General');
    setShowDatePicker(false);
    setOpen(true);
  }

  function onDone() {
    if (!name.trim()) return;
    const pad = (n: number) => String(n).padStart(2, '0');
    const iso = `${year}-${pad(month)}-${pad(day)}`;
    if (editingId) {
      updateHabit(editingId, { name: name.trim(), morning_evening: morningEvening, start_date: iso, category });
    } else {
      addHabit({ name: name.trim(), morning_evening: morningEvening, start_date: iso, category });
    }
    setEditingId(null);
    setDeleteConfirm(false);
    setOpen(false);
    // push change immediately
    void syncNow();
  }

  function onDeleteConfirm() {
    if (!editingId) return;
    // inline confirmation handled elsewhere; keep function to perform delete
    removeHabit(editingId);
    setEditingId(null);
    setDeleteConfirm(false);
    setOpen(false);
    // push deletion immediately
    void syncNow();
  }

  const [deleteConfirm, setDeleteConfirm] = useState(false);

  return (
    <>
      <Header />
      <div className="habits-root">
        <div className="habits-header">
          <div />
        </div>

      {/* Floating Add Habit button */}
      <button className="fab" onClick={onAdd} aria-label="Add habit">+
      </button>

      <DndContext
        collisionDetection={closestCenter}
        onDragEnd={e => {
          const { active, over } = e;
          if (active.id && over && active.id !== over.id) {
            const oldIndex = habits.findIndex(h => h.id === active.id);
            const newIndex = habits.findIndex(h => h.id === over.id);
            if (oldIndex !== -1 && newIndex !== -1) reorderHabit(oldIndex, newIndex);
          }
        }}
      >
        <SortableContext items={habits.map(h => h.id)} strategy={verticalListSortingStrategy}>
          <div className="habits-list">
            {habits.length === 0 && <div className="muted">No habits yet — add one.</div>}
            {habits.map(h => (
              <SortableHabit key={h.id} habit={h} onEdit={onEdit} />
            ))}
          </div>
        </SortableContext>
      </DndContext>

  <Modal open={open} onClose={() => { setEditingId(null); setDeleteConfirm(false); setOpen(false); }}>
        <label className="field">
          <div className="label">Habit</div>
          <input
            ref={nameInputRef}
            className="input"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Read for 10 minutes"
            onKeyDown={e => { if (e.key === 'Enter') onDone(); }}
          />
        </label>

        <div className="row">
          <div className="field-row">
            <div className="label">Morning & Evening</div>
            <label className="switch" style={{ margin: 0 }}>
              <input
                type="checkbox"
                className="switch-input"
                checked={morningEvening}
                onChange={e => setMorningEvening(e.target.checked)}
                aria-checked={morningEvening}
                aria-label="Morning and evening toggle"
              />
              <span className="switch-slider" aria-hidden="true" />
            </label>
          </div>
        </div>

        <div className="row" style={{ marginTop: 10 }}>
          <div className="field-row">
            <div className="label">Category</div>
            <div className="category-select">
              {[ 'Spiritual', 'Health', 'Finances' ].map(cat => (
                <button
                  key={cat}
                  className={`btn ${category === cat ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setCategory(cat)}
                  title={cat}
                >
                  <span className="swatch" style={{ background: CATEGORY_COLORS[cat] || '#666' }} />
                  {cat}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="row" style={{ marginTop: 10 }}>
          <div className="field-row">
            <div className="label">Start date</div>
            <button className="btn btn-ghost start-date-btn" onClick={() => setShowDatePicker(s => !s)} aria-expanded={showDatePicker}>
              {`${months[month - 1].slice(0,3)} ${String(day)}, ${year}`}
            </button>
          </div>
        </div>

        {showDatePicker && (
          <div className="date-wheel" role="application" aria-label="Date picker">
            {/* month column */}
            <div
              className="wheel-col"
              ref={monthRef}
              tabIndex={0}
              onKeyDown={e => handleKey(e, 'month')}
              aria-label="Month selector"
            >
              {months.map((m, i) => (
                <div
                  key={m}
                  className={`wheel-item ${month === i + 1 ? 'selected' : ''}`}
                  onClick={() => setMonth(i + 1)}
                  role="button"
                  aria-pressed={month === i + 1}
                >
                  {m}
                </div>
              ))}
            </div>

            {/* day column */}
            <div
              className="wheel-col"
              ref={dayRef}
              tabIndex={0}
              onKeyDown={e => handleKey(e, 'day')}
              aria-label="Day selector"
            >
              {Array.from({ length: daysInMonth(year, month) }).map((_, i) => (
                <div
                  key={i}
                  className={`wheel-item ${day === i + 1 ? 'selected' : ''}`}
                  onClick={() => setDay(i + 1)}
                  role="button"
                  aria-pressed={day === i + 1}
                >
                  {i + 1}
                </div>
              ))}
            </div>

            {/* year column */}
            <div
              className="wheel-col"
              ref={yearRef}
              tabIndex={0}
              onKeyDown={e => handleKey(e, 'year')}
              aria-label="Year selector"
            >
              {years.map(y => (
                <div
                  key={y}
                  className={`wheel-item ${year === y ? 'selected' : ''}`}
                  onClick={() => setYear(y)}
                  role="button"
                  aria-pressed={year === y}
                >
                  {y}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="modal-actions">
          <div className="modal-actions-left">
            {editingId && !deleteConfirm && (
              <button className="btn btn-danger" onClick={() => setDeleteConfirm(true)}>Delete</button>
            )}
            {editingId && deleteConfirm && (
              <>
                <button className="btn btn-danger" onClick={onDeleteConfirm}>Confirm</button>
                <button className="btn" onClick={() => setDeleteConfirm(false)}>Cancel</button>
                <span className="muted">Confirm delete?</span>
              </>
            )}
          </div>
          <div className="modal-actions-right">
            <button className="btn btn-primary" onClick={onDone}>Done</button>
          </div>
        </div>
      </Modal>
      </div>
    </>
  );
}

function SortableHabit({ habit, onEdit }: { habit: any; onEdit: (h: any) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: habit.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform && { ...transform, scaleY: 1 }),
    transition: transition || undefined,
    zIndex: isDragging ? 50 : undefined,
    boxShadow: isDragging ? '0 8px 20px rgba(0,0,0,0.12)' : undefined,
  };
  return (
    <div ref={setNodeRef} className={`habit-row sortable ${isDragging ? 'dragging' : ''}`} style={{ ...style, background: `linear-gradient(180deg, rgba(0,0,0,0.02), rgba(0,0,0,0)), ${hexToRgba(CATEGORY_COLORS[habit.category || 'General'] || '#000', 0.19)}` }} {...attributes}>
      <div className="drag-handle" {...listeners} title="Drag to reorder" aria-label={`Drag ${habit.name}`}>
        <GripVertical size={16} />
      </div>
      <div className="habit-main">
        <div className="habit-name">{habit.name}</div>
        <div className="habit-flags">
          {habit.morning_evening && (
            <div className="icon-flag" aria-label="Morning and evening habit" title="Morning & Evening">
              <Sun className="icon-sun" size={16} />
              <Moon className="icon-moon" size={16} />
            </div>
          )}
        </div>
      </div>
      <div className="habit-actions">
        <button className="btn btn-icon" title="Edit habit" aria-label={`Edit ${habit.name}`} onClick={() => onEdit(habit)}>
          <Edit2 size={16} />
        </button>
      </div>
    </div>
  );
}
