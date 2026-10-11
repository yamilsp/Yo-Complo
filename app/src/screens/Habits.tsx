import { useState } from 'react';
import { useStore } from '../lib/store';
import type { Habit, HabitLog, MissCause } from '../lib/types';
import { CAUSE_LABEL } from '../lib/types';
import { addDays, range, today, weekStart } from '../lib/dates';
import { logHabit } from '../lib/actions';
import { Chips, Empty, Field, Sheet, Toggle } from '../ui';
import { CausePicker } from '../forms';

const TEMPLATES: Omit<Habit, 'id' | 'kind' | 'createdAt' | 'updatedAt' | 'active'>[] = [
  { title: 'Dormir 7 h', minVersion: 'Acostarme antes de las 00:00', cue: 'Celular fuera del cuarto a las 23:30', targetPerWeek: 5 },
  { title: 'Entrenar', minVersion: '10 minutos de movilidad', cue: 'Ropa preparada la noche anterior', targetPerWeek: 3 },
  { title: 'Prospección comercial', minVersion: '1 mensaje a un potencial cliente', cue: 'Primera hora de trabajo, antes de abrir email', targetPerWeek: 5 },
  { title: 'Trabajo enfocado 90 min', minVersion: '25 minutos sin celular', cue: 'Bloque fijo de la mañana', targetPerWeek: 5 },
  { title: 'Leer', minVersion: '2 páginas', cue: 'Libro en la mesa de luz', targetPerWeek: 5 },
];

/** Consistencia de los últimos N días: completo o mínimo cuentan; sin registro no cuenta. */
export function consistency(logs: HabitLog[], habitId: string, to: string, n: number) {
  const from = addDays(to, -(n - 1));
  const ok = logs.filter((l) => l.habitId === habitId && l.date >= from && l.date <= to && l.status !== 'miss').length;
  return ok / n;
}

export function Habits() {
  const s = useStore();
  const d = today();
  const habits = s.all('habit');
  const logs = s.all('habitLog');
  const [edit, setEdit] = useState<Habit | 'new' | null>(null);
  const [missFor, setMissFor] = useState<Habit | null>(null);
  const days = range(addDays(d, -13), d);
  const ws = weekStart(d);
  const active = habits.filter((h) => h.active);

  return (
    <div className="screen">
      <h1>Hábitos</h1>
      <p className="muted small">Registro de un toque. Si no podés hacerlo completo, hacé la versión mínima: también cuenta. La regla: no fallar dos días seguidos.</p>
      {active.length === 0 && (
        <section className="card">
          <Empty>Sin hábitos. Empezá con 1 o 2, no con 5. Tocá uno para agregarlo:</Empty>
          {TEMPLATES.map((t) => (
            <button key={t.title} className="list-btn" onClick={() => s.create('habit', { ...t, kind: 'habit', active: true })}>
              + {t.title} <small className="muted">(mínimo: {t.minVersion})</small>
            </button>
          ))}
        </section>
      )}
      {active.map((h) => {
        const l = logs.find((x) => x.habitId === h.id && x.date === d);
        const week = logs.filter((x) => x.habitId === h.id && x.date >= ws && x.status !== 'miss').length;
        const c30 = consistency(logs, h.id, d, 30);
        return (
          <section key={h.id} className="card">
            <div className="row between">
              <b onClick={() => setEdit(h)}>{h.title}</b>
              <small className="muted">{week}/{h.targetPerWeek} sem · {Math.round(c30 * 100)}% 30d</small>
            </div>
            <small className="muted">Mínimo: {h.minVersion}{h.cue ? ` · Señal: ${h.cue}` : ''}</small>
            <div className="dots">
              {days.map((x) => {
                const lg = logs.find((y) => y.habitId === h.id && y.date === x);
                return <span key={x} className={'dot ' + (lg?.status ?? 'none')} title={x} />;
              })}
            </div>
            <div className="habit-btns">
              <button className={'chip' + (l?.status === 'done' ? ' on' : '')} onClick={() => logHabit(s, h, d, 'done')}>✓ Completo</button>
              <button className={'chip' + (l?.status === 'min' ? ' on' : '')} onClick={() => logHabit(s, h, d, 'min')}>½ Mínimo</button>
              <button className={'chip' + (l?.status === 'miss' ? ' on bad' : '')} onClick={() => setMissFor(h)}>✕ No</button>
            </div>
            {l?.status === 'miss' && l.reason && <small className="muted">Causa: {CAUSE_LABEL[l.reason]}</small>}
          </section>
        );
      })}
      <button className="primary block" onClick={() => setEdit('new')}>+ Hábito</button>
      {habits.some((h) => !h.active) && (
        <section className="card">
          <h3>Pausados</h3>
          {habits.filter((h) => !h.active).map((h) => (
            <button key={h.id} className="list-btn" onClick={() => s.update('habit', h.id, { active: true })}>Reactivar: {h.title}</button>
          ))}
        </section>
      )}
      <p className="muted small">Loop Habit Tracker no tiene API. La importación de su CSV queda para la etapa 2, si la app se usa sostenidamente.</p>
      {edit && <HabitSheet habit={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
      {missFor && (
        <MissSheet onClose={() => setMissFor(null)} onSave={(c) => { logHabit(s, missFor, d, 'miss', c); setMissFor(null); }} />
      )}
    </div>
  );
}

function MissSheet({ onClose, onSave }: { onClose: () => void; onSave: (c: MissCause) => void }) {
  const [c, setC] = useState<MissCause>();
  return (
    <Sheet title="¿Por qué no?" onClose={onClose}>
      <p className="muted small">Sin culpa: es un dato para ajustar el sistema.</p>
      <CausePicker value={c} onChange={setC} />
      <div className="actions">
        <button className="primary" disabled={!c} onClick={() => c && onSave(c)}>Guardar</button>
      </div>
    </Sheet>
  );
}

function HabitSheet({ habit, onClose }: { habit?: Habit; onClose: () => void }) {
  const s = useStore();
  const [f, setF] = useState<Partial<Habit>>(habit ?? { targetPerWeek: 5, active: true, minVersion: '', cue: '' });
  const [err, setErr] = useState('');
  const up = (p: Partial<Habit>) => setF((x) => ({ ...x, ...p }));
  const save = () => {
    if (!f.title?.trim()) return setErr('Poné un nombre.');
    if (!f.minVersion?.trim()) return setErr('Definí la versión mínima: es lo que te salva los días malos.');
    if (habit) s.update('habit', habit.id, { ...f, title: f.title.trim() });
    else s.create('habit', { ...(f as Habit), kind: 'habit', title: f.title.trim() });
    onClose();
  };
  return (
    <Sheet title={habit ? 'Editar hábito' : 'Nuevo hábito'} onClose={onClose}>
      <Field label="Hábito"><input value={f.title ?? ''} onChange={(e) => up({ title: e.target.value })} /></Field>
      <Field label="Versión mínima" hint="Tan chica que no tengas excusa. Ej.: 1 mensaje, 10 minutos, 2 páginas.">
        <input value={f.minVersion ?? ''} onChange={(e) => up({ minVersion: e.target.value })} />
      </Field>
      <Field label="Señal / entorno" hint="Cuándo y dónde. Ej.: después del café, con el celular en otra habitación.">
        <input value={f.cue ?? ''} onChange={(e) => up({ cue: e.target.value })} />
      </Field>
      <Field label="Días por semana">
        <Chips<number> value={f.targetPerWeek} options={[[2, '2'], [3, '3'], [4, '4'], [5, '5'], [6, '6'], [7, '7']]} onChange={(v) => up({ targetPerWeek: v })} />
      </Field>
      {habit && <Toggle checked={!!f.active} onChange={(v) => up({ active: v })} label="Activo" />}
      {err && <p className="error">{err}</p>}
      <div className="actions">
        {habit && <button className="ghost danger" onClick={() => { s.remove(habit.id); onClose(); }}>Borrar</button>}
        <button className="primary" onClick={save}>Guardar</button>
      </div>
    </Sheet>
  );
}
