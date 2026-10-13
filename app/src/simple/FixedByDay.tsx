import { useState } from 'react';
import { addDays, today } from '../lib/dates';
import { dayName, gcalLink, type FixedTask } from '../lib/simple';

const WEEK_FROM_MONDAY = [1, 2, 3, 4, 5, 6, 0];
const capitalize = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** Lista de tareas fijas agrupada por día, de lunes a domingo, con alta por día. */
export function FixedByDay({ list, onChange, calendar }: { list: FixedTask[]; onChange: (l: FixedTask[]) => void; calendar?: boolean }) {
  const todayDow = new Date().getDay();
  const upd = (id: string, x: Partial<FixedTask>) => onChange(list.map((f) => (f.id === id ? { ...f, ...x } : f)));
  const nextDate = (day: number) => addDays(today(), (day - todayDow + 7) % 7);
  return (
    <div className="s-days">
      {WEEK_FROM_MONDAY.map((day) => {
        const items = list.filter((f) => f.day === day).sort((a, b) => a.time.localeCompare(b.time));
        return (
          <div key={day} className={'s-day' + (day === todayDow ? ' today' : '')}>
            <div className="s-day-head">
              <b>{capitalize(dayName(day))}</b>
              {day === todayDow && <span className="s-chip blue">hoy</span>}
              <small className="s-muted">{items.length ? `${items.length} ${items.length === 1 ? 'tarea' : 'tareas'}` : ''}</small>
            </div>
            {items.map((f) => (
              <div key={f.id} className="s-day-item">
                <textarea className="s-input flat s-day-title" rows={1} value={f.title} onChange={(e) => upd(f.id, { title: e.target.value })} aria-label="Tarea" />
                <div className="s-day-row">
                  <input className="s-input s-sel s-time" type="time" value={f.time} onChange={(e) => upd(f.id, { time: e.target.value || f.time })} aria-label="Horario" />
                  {calendar && (
                    <a className="s-btn text small" target="_blank" rel="noreferrer" title="Agregar a Google Calendar (todas las semanas)"
                      href={gcalLink(f.title, nextDate(f.day), f.time, f.minutes) + '&recur=' + encodeURIComponent('RRULE:FREQ=WEEKLY')}>+ Calendar</a>
                  )}
                  <button className="s-btn text small danger s-day-del" onClick={() => onChange(list.filter((x) => x.id !== f.id))} aria-label="Quitar">✕</button>
                </div>
              </div>
            ))}
            <DayAdd onAdd={(title, time) => onChange([...list, { id: 'fx-' + Date.now().toString(36), title, day, time, minutes: 30 }])} />
          </div>
        );
      })}
    </div>
  );
}

function DayAdd({ onAdd }: { onAdd: (title: string, time: string) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [time, setTime] = useState('10:00');
  if (!open) return <button className="s-btn text small s-day-add" onClick={() => setOpen(true)}>+ Agregar tarea</button>;
  const add = () => {
    if (!title.trim()) return;
    onAdd(title.trim(), time);
    setTitle('');
    setOpen(false);
  };
  return (
    <div className="s-day-row s-day-new">
      <input className="s-input s-sel s-time" type="time" value={time} onChange={(e) => setTime(e.target.value || '10:00')} aria-label="Horario" />
      <input className="s-input grow" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="Ej.: pagar cuentas" />
      <button className="s-btn tonal small" onClick={add} disabled={!title.trim()}>Sumar</button>
    </div>
  );
}
