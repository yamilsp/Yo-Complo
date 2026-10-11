import { useState } from 'react';
import { useStore } from '../lib/store';
import type { Block, Energy, MissCause, Task } from '../lib/types';
import { CAUSE_FIX, TYPE_LABEL } from '../lib/types';
import { addDays, pretty, today, weekStart } from '../lib/dates';
import { ensureDay, getDay, getSettings, lowEnergyStreak, snapshot } from '../lib/model';
import { candidates, capacity, load, maxPriorities, proposePlan, scoreTask, fallbackAction, type Proposal } from '../lib/priority';
import { closeDay, completeTask, delegate, drop, logHabit, newTask, postpone, setPriorities, unprioritize } from '../lib/actions';
import { pointsBetween } from '../lib/points';
import { coach } from '../lib/coach';
import { Bar, Chips, Empty, Field, Sheet, toast } from '../ui';
import { CausePicker, LogSheet, TaskSheet } from '../forms';

const HOURS: [number, string][] = [[60, '1 h'], [120, '2 h'], [240, '4 h'], [360, '6 h'], [480, '8 h']];

export function Today({ go }: { go: (tab: string) => void }) {
  const s = useStore();
  const date = today();
  const settings = getSettings(s);
  const day = getDay(s, date) ?? { date, energy: 'normal' as Energy, availableMin: settings.defaultAvailableMin, priorities: [] as string[], blocks: [] as Block[], closed: false };
  const tasks = s.all('task');
  const projects = s.all('project');
  const snap = snapshot(s);
  const prio = day.priorities.map((id) => s.get('task', id)).filter((t): t is Task => !!t);
  const next = prio.find((t) => t.status === 'todo');
  const others = candidates(tasks, date).filter((t) => t.plannedFor === date && !day.priorities.includes(t.id));
  const cap = capacity(day.availableMin, settings.realism);
  const planned = load([...prio.filter((t) => t.status === 'todo'), ...others]);
  const over = planned - cap;
  const max = maxPriorities(day.energy);
  const lowStreak = lowEnergyStreak(snap.days, date);
  const findings = coach(snap, date);
  const pts = pointsBetween(snap, date, date);
  const review = snap.reviews.find((r) => r.weekStart === weekStart(date));
  const habits = snap.habits.filter((h) => h.active);

  const [sheet, setSheet] = useState<null | 'task' | 'log' | 'plan' | 'close' | 'block' | 'swap'>(null);
  const [doneTask, setDoneTask] = useState<Task | null>(null);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [swapIn, setSwapIn] = useState<string | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [lowWarn, setLowWarn] = useState(false);

  const patchDay = (p: Partial<typeof day>) => {
    const d = ensureDay(s, date);
    s.update('day', d.id, p);
  };

  const setEnergy = (e: Energy) => {
    if (e === 'low' && lowStreak >= 2) setLowWarn(true);
    const extra = day.priorities.slice(maxPriorities(e));
    patchDay({ energy: e, priorities: day.priorities.slice(0, maxPriorities(e)) });
    if (extra.length) toast(`Con poca energía quedan ${maxPriorities(e)} prioridades. Las demás siguen en el plan.`);
  };

  const addPriority = (id: string) => {
    if (day.priorities.length >= max) {
      setSwapIn(id);
      setSheet('swap');
      return;
    }
    setPriorities(s, date, [...day.priorities, id], max);
  };

  const propose = () => {
    setProposal(proposePlan(tasks, { today: date, energy: day.energy, availableMin: day.availableMin, realism: settings.realism, projects, lowStreak }));
    setSheet('plan');
  };

  const onboarding = !snap.goals.length && !projects.length && !tasks.length;

  return (
    <div className="screen">
      <header className="today-head">
        <div>
          <h1>Hoy</h1>
          <p className="muted">{pretty(date)}{day.closed && ' · día cerrado'}</p>
        </div>
        <div className="score" title="Puntos de hoy: actividad + resultados">
          <b>{pts.total}</b>
          <small>pts hoy</small>
        </div>
      </header>

      {onboarding && <Onboarding go={go} />}

      <section className="card compact">
        <div className="row between">
          <span className="label">Energía</span>
          <Chips<Energy> value={day.energy} options={[['low', 'Baja'], ['normal', 'Normal'], ['high', 'Alta']]} onChange={setEnergy} />
        </div>
        <div className="row between">
          <span className="label">Tiempo libre</span>
          <Chips<number> value={day.availableMin} options={HOURS} onChange={(v) => patchDay({ availableMin: v })} />
        </div>
        <div className="cap">
          <Bar value={cap ? planned / cap : 0} tone={over > 0 ? 'bad' : planned / cap > 0.85 ? 'warn' : 'ok'} />
          <small className={over > 0 ? 'error' : 'muted'}>
            {planned} de {cap} min realistas{over > 0 ? ` · te pasaste ${over} min: sacá algo` : ''}
          </small>
        </div>
        {lowWarn && (
          <p className="warn">
            Es el {lowStreak + 1}º día seguido con energía baja. El plan mínimo sirve para un mal día, no como estándar. Revisá tu sueño y, si podés, hacé 2 prioridades.
          </p>
        )}
      </section>

      {findings[0] && (
        <section className={'card coach sev' + findings[0].severity} onClick={() => go('progreso')}>
          <b>{findings[0].title}</b>
          <p>{findings[0].evidence}</p>
          <p className="fix">→ {findings[0].action}</p>
        </section>
      )}

      {review && review.priorities.length > 0 && (
        <p className="week-prio">Semana: {review.priorities.join(' · ')}</p>
      )}

      <section className="card next">
        <span className="label">Siguiente acción</span>
        {next ? (
          <>
            <h2>{next.title}</h2>
            <p className="muted small">
              {TYPE_LABEL[next.type]} · {next.estimateMin} min
              {next.avoided && ' · la venís evitando'}
            </p>
            <div className="actions">
              {next.startedAt ? (
                <span className="running">En curso desde {new Date(next.startedAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</span>
              ) : (
                <button className="primary" onClick={() => s.update('task', next.id, { startedAt: Date.now() })}>Empezar</button>
              )}
              <button className="primary outline" onClick={() => setDoneTask(next)}>Terminé</button>
              <button className="ghost" onClick={() => setSheet('log')}>Me trabé</button>
            </div>
          </>
        ) : prio.length ? (
          <p>Prioridades del día completas. Si te queda energía, sumá la siguiente acción de resultado, no una de preparación.</p>
        ) : (
          <NoPlan onPropose={propose} hasTasks={candidates(tasks, date).length > 0} projects={projects} onCreate={(title) => { const t = newTask(s, { title, plannedFor: date }); setPriorities(s, date, [t.id], max); }} />
        )}
      </section>

      <section className="card">
        <div className="row between">
          <h3>Prioridades ({prio.length}/{max})</h3>
          <button className="ghost small" onClick={propose}>Proponer plan</button>
        </div>
        {prio.length === 0 && <Empty>Sin prioridades. Tocá "Proponer plan" o elegí abajo.</Empty>}
        {prio.map((t, i) => {
          const sc = scoreTask(t, { today: date, energy: day.energy, availableMin: day.availableMin, realism: settings.realism, projects, lowStreak });
          return (
            <div key={t.id} className={'task' + (t.status === 'done' ? ' done' : '')}>
              <button className="check" aria-label="Completar" onClick={() => (t.status === 'done' ? s.update('task', t.id, { status: 'todo', doneAt: undefined }) : setDoneTask(t))}>
                {t.status === 'done' ? '✓' : i + 1}
              </button>
              <div className="grow" onClick={() => setEditTask(t)}>
                <div>{t.title}</div>
                <small className="muted">
                  <span className={'tag ' + t.type}>{TYPE_LABEL[t.type]}</span> {t.estimateMin} min · {sc.reasons.slice(0, 2).join(' · ')}
                </small>
              </div>
              {t.status === 'todo' && <button className="ghost small" onClick={() => unprioritize(s, t.id, date)} aria-label="Quitar">↓</button>}
            </div>
          );
        })}
        {prio.length > 0 && prio.every((t) => t.type === 'prep') && (
          <p className="warn">Todas tus prioridades son preparación. ¿Cuál de ellas produce un resultado verificable hoy?</p>
        )}
      </section>

      {others.length > 0 && (
        <section className="card">
          <h3>También planificado hoy</h3>
          {over > 0 && <p className="warn">No entra todo. Decidí: postergar, delegar o descartar.</p>}
          {others.map((t) => (
            <div key={t.id} className="task">
              <div className="grow" onClick={() => setEditTask(t)}>
                <div>{t.title}</div>
                <small className="muted">{TYPE_LABEL[t.type]} · {t.estimateMin} min</small>
              </div>
              <Triage t={t} date={date} onPrio={() => addPriority(t.id)} />
            </div>
          ))}
        </section>
      )}

      <section className="card">
        <div className="row between">
          <h3>Bloques y compromisos</h3>
          <button className="ghost small" onClick={() => setSheet('block')}>+ Bloque</button>
        </div>
        {day.blocks.length === 0 ? (
          <Empty>Reservá un bloque de foco para tu prioridad 1. Lo que no tiene horario, compite con todo.</Empty>
        ) : (
          [...day.blocks].sort((a, b) => a.start.localeCompare(b.start)).map((b, i) => (
            <div key={i} className="block-row">
              <span className={'tag ' + (b.type === 'focus' ? 'result' : 'maintenance')}>{b.start}–{b.end}</span>
              <span className="grow">{b.label}</span>
              <button className="ghost small" onClick={() => patchDay({ blocks: day.blocks.filter((x) => x !== b) })}>✕</button>
            </div>
          ))
        )}
      </section>

      <section className="card">
        <div className="row between">
          <h3>Hábitos</h3>
          <button className="ghost small" onClick={() => go('habitos')}>Ver</button>
        </div>
        {habits.length === 0 ? (
          <Empty>Sin hábitos. Empezá con uno solo, con versión mínima.</Empty>
        ) : (
          <div className="habit-chips">
            {habits.map((h) => {
              const l = snap.habitLogs.find((x) => x.habitId === h.id && x.date === date);
              return (
                <button key={h.id} className={'chip ' + (l?.status ?? '')} onClick={() => logHabit(s, h, date, l?.status === 'done' ? 'min' : l?.status === 'min' ? 'miss' : 'done')}>
                  {l?.status === 'done' ? '✓ ' : l?.status === 'min' ? '½ ' : l?.status === 'miss' ? '✕ ' : ''}{h.title}
                </button>
              );
            })}
          </div>
        )}
        <small className="muted">Tocá: completo → mínimo → no. Para registrar la causa, entrá a Hábitos.</small>
      </section>

      <div className="fab-row">
        <button className="ghost" onClick={() => setSheet('task')}>+ Acción</button>
        <button className="ghost" onClick={() => setSheet('log')}>Registrar</button>
        <button className="primary" onClick={() => setSheet('close')}>{day.closed ? 'Recerrar día' : 'Cerrar día'}</button>
      </div>

      {sheet === 'task' && <TaskSheet defaults={{ plannedFor: date }} onClose={() => setSheet(null)} />}
      {editTask && <TaskSheet task={editTask} onClose={() => setEditTask(null)} />}
      {sheet === 'log' && <LogSheet onClose={() => setSheet(null)} taskId={next?.id} />}
      {doneTask && <DoneSheet task={doneTask} onClose={() => setDoneTask(null)} />}
      {sheet === 'block' && <BlockSheet onClose={() => setSheet(null)} onSave={(b) => patchDay({ blocks: [...day.blocks, b] })} />}
      {sheet === 'plan' && proposal && (
        <PlanSheet
          proposal={proposal}
          onClose={() => setSheet(null)}
          onAccept={(ids) => {
            setPriorities(s, date, ids, max);
            setSheet(null);
          }}
        />
      )}
      {sheet === 'swap' && swapIn && (
        <Sheet title="Ya tenés el máximo de prioridades" onClose={() => setSheet(null)}>
          <p>Para sumar "{s.get('task', swapIn)?.title}", elegí cuál sale. No se agrega una cuarta.</p>
          {prio.map((t) => (
            <button key={t.id} className="list-btn" onClick={() => {
              setPriorities(s, date, day.priorities.map((x) => (x === t.id ? swapIn : x)), max);
              setSheet(null);
            }}>Sacar: {t.title}</button>
          ))}
        </Sheet>
      )}
      {sheet === 'close' && <CloseSheet date={date} prio={prio} onClose={() => setSheet(null)} />}
    </div>
  );
}

function Triage({ t, date, onPrio }: { t: Task; date: string; onPrio: () => void }) {
  const s = useStore();
  return (
    <div className="triage">
      <button className="ghost small" onClick={onPrio} title="Hacerla prioridad">★</button>
      <button className="ghost small" onClick={() => postpone(s, t.id, addDays(date, 1), date)} title="Mañana">→</button>
      <button className="ghost small" onClick={() => { const w = prompt('¿A quién se la delegás?'); if (w !== null) delegate(s, t.id, w, date); }} title="Delegar">⇢</button>
      <button className="ghost small" onClick={() => drop(s, t.id, date)} title="Descartar">✕</button>
    </div>
  );
}

function NoPlan({ onPropose, hasTasks, projects, onCreate }: { onPropose: () => void; hasTasks: boolean; projects: import('../lib/types').Project[]; onCreate: (t: string) => void }) {
  if (hasTasks)
    return (
      <>
        <p>Todavía no elegiste prioridades.</p>
        <button className="primary" onClick={onPropose}>Proponeme un plan</button>
      </>
    );
  const fb = fallbackAction(projects);
  return (
    <>
      <h2>{fb.title}</h2>
      <p className="muted small">{fb.why}</p>
      <button className="primary" onClick={() => onCreate(fb.title)}>Hacer esto hoy</button>
    </>
  );
}

function PlanSheet({ proposal, onClose, onAccept }: { proposal: Proposal; onClose: () => void; onAccept: (ids: string[]) => void }) {
  const [sel, setSel] = useState(proposal.picks.map((p) => p.task.id));
  return (
    <Sheet title="Plan propuesto" onClose={onClose}>
      <p className="muted small">Capacidad realista: {proposal.capacityMin} min · plan: {proposal.loadMin} min. Vos decidís.</p>
      {proposal.picks.length === 0 && <Empty>No hay acciones pendientes. Creá la próxima acción concreta de tu proyecto principal.</Empty>}
      {proposal.picks.map((p, i) => (
        <label key={p.task.id} className="task">
          <input type="checkbox" checked={sel.includes(p.task.id)} onChange={(e) => setSel((x) => (e.target.checked ? [...x, p.task.id] : x.filter((y) => y !== p.task.id)))} />
          <div className="grow">
            <div>{i + 1}. {p.task.title}</div>
            <small className="muted">{p.reasons.join(' · ') || 'Mejor opción disponible'}</small>
          </div>
        </label>
      ))}
      {proposal.notes.map((n, i) => <p key={i} className="warn">{n}</p>)}
      <div className="actions">
        <button className="primary" disabled={!sel.length} onClick={() => onAccept(sel)}>Aceptar plan</button>
      </div>
    </Sheet>
  );
}

function DoneSheet({ task, onClose }: { task: Task; onClose: () => void }) {
  const s = useStore();
  const [ev, setEv] = useState(task.evidence ?? '');
  const [log, setLog] = useState(false);
  if (log) return <LogSheet onClose={onClose} taskId={task.id} />;
  return (
    <Sheet title="¿Qué lograste?" onClose={onClose}>
      <p><b>{task.title}</b></p>
      <Field label="Evidencia (suma puntos)" hint="Algo verificable: link, cantidad, respuesta recibida, archivo entregado.">
        <input autoFocus value={ev} onChange={(e) => setEv(e.target.value)} placeholder={task.commercial ? 'Ej.: 5 enviados, 2 respuestas' : 'Ej.: propuesta enviada a Juan'} />
      </Field>
      {task.avoided && <p className="good">Enfrentaste algo que venías evitando. Eso vale más que diez tareas cómodas.</p>}
      <div className="actions">
        <button className="ghost" onClick={() => { completeTask(s, task.id, today(), ev); setLog(true); }}>Guardar y registrar resultado</button>
        <button className="primary" onClick={() => { completeTask(s, task.id, today(), ev); toast('Hecho'); onClose(); }}>Guardar</button>
      </div>
    </Sheet>
  );
}

function BlockSheet({ onClose, onSave }: { onClose: () => void; onSave: (b: Block) => void }) {
  const [b, setB] = useState<Block>({ start: '09:00', end: '10:30', label: '', type: 'focus' });
  const [err, setErr] = useState('');
  return (
    <Sheet title="Nuevo bloque" onClose={onClose}>
      <Chips value={b.type} options={[['focus', 'Foco'], ['commitment', 'Compromiso']]} onChange={(type) => setB({ ...b, type: type as Block['type'] })} />
      <div className="grid2">
        <Field label="Desde"><input type="time" value={b.start} onChange={(e) => setB({ ...b, start: e.target.value })} /></Field>
        <Field label="Hasta"><input type="time" value={b.end} onChange={(e) => setB({ ...b, end: e.target.value })} /></Field>
      </div>
      <Field label="Qué"><input value={b.label} onChange={(e) => setB({ ...b, label: e.target.value })} placeholder="Ej.: Prospección sin celular" /></Field>
      {err && <p className="error">{err}</p>}
      <div className="actions">
        <button className="primary" onClick={() => {
          if (!b.label.trim()) return setErr('Poné un nombre.');
          if (b.end <= b.start) return setErr('El fin debe ser posterior al inicio.');
          onSave({ ...b, label: b.label.trim() });
          onClose();
        }}>Guardar</button>
      </div>
    </Sheet>
  );
}

/** Cierre diario: < 2 minutos, todo con toques. */
function CloseSheet({ date, prio, onClose }: { date: string; prio: Task[]; onClose: () => void }) {
  const s = useStore();
  const [done, setDone] = useState(prio.filter((t) => t.status === 'done').map((t) => t.id));
  const [cause, setCause] = useState<MissCause | undefined>(getDay(s, date)?.missCause);
  const pending = candidates(s.all('task'), addDays(date, 1)).filter((t) => !done.includes(t.id)).slice(0, 6);
  const [first, setFirst] = useState<string>(pending.find((t) => prio.some((p) => p.id === t.id))?.id ?? pending[0]?.id ?? '');
  const [firstTitle, setFirstTitle] = useState('');
  const [err, setErr] = useState('');
  const missed = prio.length - done.length;
  const results = s.all('result').filter((r) => r.date === date);

  const save = () => {
    if (missed > 0 && !cause) return setErr('Elegí la causa principal de lo que no hiciste.');
    if (!first && !firstTitle.trim()) return setErr('Definí la primera acción de mañana.');
    closeDay(s, { date, doneIds: done, missCause: cause, firstActionId: first || undefined, firstActionTitle: first ? undefined : firstTitle });
    toast(missed === 0 && prio.length ? 'Día cumplido.' : 'Día cerrado. Mañana empezás por la primera acción.');
    onClose();
  };

  return (
    <Sheet title="Cierre del día" onClose={onClose}>
      <span className="label">1. ¿Qué prioridades completaste?</span>
      {prio.length === 0 && <p className="muted">No tenías prioridades definidas. Ese es el primer ajuste.</p>}
      {prio.map((t) => (
        <label key={t.id} className="task">
          <input type="checkbox" checked={done.includes(t.id)} onChange={(e) => setDone((x) => (e.target.checked ? [...x, t.id] : x.filter((y) => y !== t.id)))} />
          <span className="grow">{t.title}</span>
        </label>
      ))}
      <span className="label">2. Resultados de hoy</span>
      <p className="small muted">{results.length ? results.map((r) => `${r.type}${r.amount ? ' ' + r.amount : r.qty > 1 ? ' ×' + r.qty : ''}`).join(', ') : 'Ninguno registrado. Si hubo, registralo desde "Registrar".'}</p>
      {missed > 0 && (
        <>
          <span className="label">3. ¿Por qué no hiciste {missed === 1 ? 'una' : missed}?</span>
          <CausePicker value={cause} onChange={setCause} />
          {cause && <p className="fix small">→ {CAUSE_FIX[cause]}</p>}
        </>
      )}
      <span className="label">{missed > 0 ? '4' : '3'}. Primera acción de mañana</span>
      <select value={first} onChange={(e) => setFirst(e.target.value)}>
        {pending.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
        <option value="">— Escribir otra —</option>
      </select>
      {!first && <input placeholder="Verbo + objeto + cantidad" value={firstTitle} onChange={(e) => setFirstTitle(e.target.value)} />}
      {err && <p className="error">{err}</p>}
      <div className="actions">
        <button className="primary" onClick={save}>Cerrar día</button>
      </div>
    </Sheet>
  );
}

const MY_GOALS = [
  'Aumentar ingresos y alcanzar independencia económica',
  'Comprar un auto',
  'Mudarme solo',
  'Desarrollar disciplina y capacidad de ejecución',
  'Mejorar salud, energía y condición física',
  'Mejorar vida social y tener más experiencias',
];

function Onboarding({ go }: { go: (t: string) => void }) {
  const s = useStore();
  const load = () => {
    const d = today();
    for (const title of MY_GOALS)
      s.create('goal', {
        kind: 'goal', title, horizon: 'long', metric: '', unit: '', source: 'manual', baseline: 0, target: null,
        manualCurrent: 0, startDate: d, reviewDate: addDays(d, 30), status: 'active',
      });
    toast('Objetivos cargados. Definí la métrica de cada uno cuando tengas datos.');
    go('plan');
  };
  return (
    <section className="card onboarding">
      <h3>Empezá en 3 pasos</h3>
      <ol>
        <li>Objetivos: cargá tus 6 objetivos de largo plazo (sin números inventados).</li>
        <li>Proyectos: uno principal y, si querés, uno secundario, más ingresos y salud.</li>
        <li>Acción: escribí la próxima acción concreta y hacela hoy.</li>
      </ol>
      <div className="actions">
        <button className="primary" onClick={load}>Cargar mis 6 objetivos</button>
        <button className="ghost" onClick={() => go('plan')}>Crearlos yo</button>
      </div>
    </section>
  );
}
