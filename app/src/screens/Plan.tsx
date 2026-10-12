import { useState } from 'react';
import { useStore } from '../lib/store';
import type { Goal, GoalSource, Idea, Project, ProjectRole, ProjectStatus, Task } from '../lib/types';
import { ROLE_LABEL, TYPE_LABEL } from '../lib/types';
import { addDays, daysBetween, short, today } from '../lib/dates';
import { goalCurrent, goalProgress, slotConflict, fmtMoney } from '../lib/model';
import { setProjectStatus } from '../lib/actions';
import { Bar, Chips, Empty, Field, NumInput, Sheet, Toggle, toast } from '../ui';
import { TaskSheet } from '../forms';

type Tab = 'goals' | 'projects' | 'tasks' | 'ideas';

export function Plan() {
  const [tab, setTab] = useState<Tab>('goals');
  return (
    <div className="screen">
      <h1>Plan</h1>
      <Chips<Tab> value={tab} options={[['goals', 'Objetivos'], ['projects', 'Proyectos'], ['tasks', 'Acciones'], ['ideas', 'Ideas']]} onChange={setTab} />
      {tab === 'goals' && <Goals />}
      {tab === 'projects' && <Projects />}
      {tab === 'tasks' && <Tasks />}
      {tab === 'ideas' && <Ideas />}
    </div>
  );
}

const SOURCES: [GoalSource, string][] = [
  ['manual', 'Manual'],
  ['income_ars', 'Ingresos ARS'],
  ['savings_ars', 'Ahorro ARS'],
  ['savings_usd', 'Ahorro USD'],
  ['clients', 'Clientes'],
  ['contacts', 'Contactos'],
  ['proposals', 'Propuestas'],
];

function fmtGoal(g: Goal, v: number) {
  if (g.source === 'income_ars' || g.source === 'savings_ars') return fmtMoney(v, 'ARS');
  if (g.source === 'savings_usd') return fmtMoney(v, 'USD');
  return `${Math.round(v * 100) / 100} ${g.unit}`.trim();
}

function Goals() {
  const s = useStore();
  const goals = s.all('goal').filter((g) => g.status === 'active');
  const results = s.all('result');
  const [edit, setEdit] = useState<Goal | 'new' | null>(null);
  const d = today();
  const longs = goals.filter((g) => g.horizon === 'long');
  const orphans = goals.filter((g) => g.horizon === '30d' && !longs.some((l) => l.id === g.parentId));

  const card = (g: Goal) => {
    const p = goalProgress(g, results);
    const late = g.reviewDate < d;
    const projects = s.all('project').filter((x) => x.goalId === g.id && x.status === 'active');
    return (
      <div key={g.id} className={'goal ' + g.horizon} onClick={() => setEdit(g)}>
        <div className="row between">
          <b>{g.title}</b>
          <small className={late ? 'error' : 'muted'}>{late ? 'Revisar' : 'Rev.'} {short(g.reviewDate)}</small>
        </div>
        {p != null ? (
          <>
            <Bar value={p} tone={p >= 1 ? 'ok' : undefined} />
            <small className="muted">
              {g.metric}: {fmtGoal(g, goalCurrent(g, results))} de {fmtGoal(g, g.target!)} ({Math.round(p * 100)}%)
            </small>
          </>
        ) : (
          <small className="warn-text">Sin resultado medible. Definí la métrica cuando tengas un dato real.</small>
        )}
        {projects.length > 0 && <small className="muted"> · Proyectos: {projects.map((x) => x.title).join(', ')}</small>}
      </div>
    );
  };

  return (
    <>
      <p className="muted small">Largo plazo → metas de 30 días con número → proyectos → acciones.</p>
      {goals.length === 0 && <Empty>Sin objetivos. Empezá por uno de largo plazo y una meta de 30 días medible.</Empty>}
      {longs.map((l) => (
        <section key={l.id} className="card">
          {card(l)}
          <div className="children">
            {goals.filter((g) => g.horizon === '30d' && g.parentId === l.id).map(card)}
          </div>
        </section>
      ))}
      {orphans.length > 0 && <section className="card">{orphans.map(card)}</section>}
      <button className="primary block" onClick={() => setEdit('new')}>+ Objetivo o meta de 30 días</button>
      {edit && <GoalSheet goal={edit === 'new' ? undefined : edit} longs={longs} onClose={() => setEdit(null)} />}
    </>
  );
}

function GoalSheet({ goal, longs, onClose }: { goal?: Goal; longs: Goal[]; onClose: () => void }) {
  const s = useStore();
  const d = today();
  const [f, setF] = useState<Partial<Goal>>(
    goal ?? { horizon: longs.length ? '30d' : 'long', source: 'manual', baseline: 0, target: null, manualCurrent: 0, startDate: d, reviewDate: addDays(d, 30), metric: '', unit: '' },
  );
  const [err, setErr] = useState('');
  const up = (p: Partial<Goal>) => setF((x) => ({ ...x, ...p }));

  const save = () => {
    if (!f.title?.trim()) return setErr('Poné un nombre.');
    if (f.horizon === '30d' && (f.target == null || !f.metric?.trim()))
      return setErr('Una meta de 30 días necesita métrica y número objetivo. Si todavía no sabés el número, usá tu dato actual como base y apuntá a una mejora chica.');
    if (f.target != null && !isFinite(f.target)) return setErr('Objetivo numérico inválido.');
    const data = { ...f, title: f.title.trim(), status: f.status ?? 'active' } as Goal;
    if (goal) s.update('goal', goal.id, data);
    else s.create('goal', { ...data, kind: 'goal' });
    onClose();
  };

  return (
    <Sheet title={goal ? 'Editar objetivo' : 'Nuevo objetivo'} onClose={onClose}>
      <Chips value={f.horizon} options={[['long', 'Largo plazo'], ['30d', 'Meta 30 días']]} onChange={(h) => up({ horizon: h as Goal['horizon'], reviewDate: addDays(d, h === '30d' ? 30 : 90) })} />
      <Field label="Nombre"><input value={f.title ?? ''} onChange={(e) => up({ title: e.target.value })} /></Field>
      {f.horizon === '30d' && (
        <Field label="Objetivo de largo plazo">
          <select value={f.parentId ?? ''} onChange={(e) => up({ parentId: e.target.value || undefined })}>
            <option value="">—</option>
            {longs.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
          </select>
        </Field>
      )}
      <Field label="¿Cómo se mide?" hint="Automático: se calcula con lo que registrás. Manual: lo actualizás vos.">
        <Chips<GoalSource> value={f.source} options={SOURCES} onChange={(v) => up({ source: v })} />
      </Field>
      <div className="grid2">
        <Field label="Métrica"><input value={f.metric ?? ''} onChange={(e) => up({ metric: e.target.value })} placeholder="Ej.: ahorro para el auto" /></Field>
        {f.source === 'manual' && <Field label="Unidad"><input value={f.unit ?? ''} onChange={(e) => up({ unit: e.target.value })} placeholder="kg, clientes…" /></Field>}
      </div>
      <div className="grid2">
        <Field label="Base (valor actual)" hint="Lo que ya tenés hoy (ej.: USD ya ahorrados).">
          <NumInput value={f.baseline ?? 0} onChange={(n) => up({ baseline: n ?? 0 })} />
        </Field>
        <Field label="Objetivo" hint="Vacío hasta tener datos que lo justifiquen.">
          <NumInput value={f.target} onChange={(n) => up({ target: n })} />
        </Field>
      </div>
      {f.source === 'manual' && (
        <Field label="Valor actual"><NumInput value={f.manualCurrent ?? 0} onChange={(n) => up({ manualCurrent: n ?? 0 })} /></Field>
      )}
      <div className="grid2">
        <Field label="Desde"><input type="date" value={f.startDate} onChange={(e) => up({ startDate: e.target.value })} /></Field>
        <Field label="Revisión"><input type="date" value={f.reviewDate} onChange={(e) => up({ reviewDate: e.target.value })} /></Field>
      </div>
      {err && <p className="error">{err}</p>}
      <div className="actions">
        {goal && <button className="ghost" onClick={() => { s.update('goal', goal.id, { status: 'done' }); onClose(); }}>Logrado</button>}
        {goal && <button className="ghost danger" onClick={() => { s.update('goal', goal.id, { status: 'dropped' }); onClose(); }}>Abandonar</button>}
        <button className="primary" onClick={save}>Guardar</button>
      </div>
    </Sheet>
  );
}

const STATUS_LABEL: Record<ProjectStatus, string> = { active: 'Activo', paused: 'Pausado', closed: 'Cerrado', discarded: 'Descartado' };

function Projects() {
  const s = useStore();
  const all = s.all('project');
  const [edit, setEdit] = useState<Project | 'new' | null>(null);
  const [conflict, setConflict] = useState<{ want: Project; holder: Project } | null>(null);
  const [showOld, setShowOld] = useState(false);
  const tasks = s.all('task');
  const d = today();

  const tryActivate = (p: Project) => {
    const holder = slotConflict(all, p.role, p.id);
    if (holder) setConflict({ want: p, holder });
    else setProjectStatus(s, p.id, 'active');
  };

  const list = (ps: Project[]) =>
    ps.map((p) => {
      const pend = tasks.filter((t) => t.projectId === p.id && t.status === 'todo').length;
      const done = tasks.filter((t) => t.projectId === p.id && t.status === 'done').length;
      const left = p.deadline ? daysBetween(d, p.deadline) : null;
      return (
        <section key={p.id} className="card">
          <div className="row between" onClick={() => setEdit(p)}>
            <b>{p.title}</b>
            <span className={'tag ' + (p.role === 'main' ? 'result' : 'maintenance')}>{ROLE_LABEL[p.role]}</span>
          </div>
          <small className="muted">
            {STATUS_LABEL[p.status]} · {pend} pendientes · {done} hechas
            {p.isExperiment && left != null && (left >= 0 ? ` · experimento: ${left} d para decidir` : ' · experimento vencido: decidí')}
          </small>
          {p.isExperiment && p.successCriteria && <p className="small">Éxito si: {p.successCriteria}</p>}
          {p.status === 'active' && pend === 0 && <p className="warn small">Sin próxima acción. Un proyecto sin acción está pausado en los hechos.</p>}
          <div className="actions left">
            {p.status === 'active' ? (
              <>
                <button className="ghost small" onClick={() => setProjectStatus(s, p.id, 'paused')}>Pausar</button>
                <button className="ghost small" onClick={() => { const n = prompt('¿Por qué lo cerrás? (resultado o aprendizaje)'); if (n !== null) setProjectStatus(s, p.id, 'closed', n); }}>Cerrar</button>
                <button className="ghost small danger" onClick={() => { const n = prompt('¿Por qué lo descartás? (dato que lo justifica)'); if (n !== null) setProjectStatus(s, p.id, 'discarded', n); }}>Descartar</button>
              </>
            ) : (
              <button className="ghost small" onClick={() => tryActivate(p)}>Reactivar</button>
            )}
          </div>
        </section>
      );
    });

  const active = all.filter((p) => p.status === 'active');
  const paused = all.filter((p) => p.status === 'paused');
  const old = all.filter((p) => p.status === 'closed' || p.status === 'discarded');

  return (
    <>
      <p className="muted small">Máximo: 1 principal de crecimiento + 1 secundario, más ingresos actuales y salud.</p>
      {active.length === 0 && <Empty>Sin proyectos activos. Creá tu proyecto de ingresos actual (jardinería) y, si tenés, uno principal de crecimiento como experimento.</Empty>}
      {list(active)}
      {paused.length > 0 && <h3>Pausados</h3>}
      {list(paused)}
      {old.length > 0 && <button className="ghost small" onClick={() => setShowOld(!showOld)}>{showOld ? 'Ocultar' : 'Ver'} cerrados/descartados ({old.length})</button>}
      {showOld && list(old)}
      <button className="primary block" onClick={() => setEdit('new')}>+ Proyecto</button>
      {edit && (
        <ProjectSheet
          project={edit === 'new' ? undefined : edit}
          onClose={() => setEdit(null)}
          onConflict={(want, holder) => { setEdit(null); setConflict({ want, holder }); }}
        />
      )}
      {conflict && <ConflictSheet {...conflict} onClose={() => setConflict(null)} />}
    </>
  );
}

/** Para activar otro proyecto en el mismo cupo, hay que decidir qué pasa con el actual. */
function ConflictSheet({ want, holder, onClose }: { want: Project; holder: Project; onClose: () => void }) {
  const s = useStore();
  const resolve = (st: ProjectStatus) => {
    const note = st === 'paused' ? undefined : prompt(`¿Por qué ${st === 'closed' ? 'cerrás' : 'descartás'} "${holder.title}"?`) ?? undefined;
    setProjectStatus(s, holder.id, st, note);
    setProjectStatus(s, want.id, 'active');
    toast(`"${want.title}" activo.`);
    onClose();
  };
  return (
    <Sheet title="Cupo ocupado" onClose={onClose}>
      <p>
        Ya tenés <b>"{holder.title}"</b> como {ROLE_LABEL[holder.role].toLowerCase()}. Para activar <b>"{want.title}"</b> tenés que decidir qué pasa con el actual.
      </p>
      <p className="warn small">Antes de cambiar: ¿"{holder.title}" llegó a su fecha de revisión con datos, o lo estás dejando porque la parte comercial incomoda?</p>
      <button className="list-btn" onClick={() => resolve('paused')}>Pausar "{holder.title}"</button>
      <button className="list-btn" onClick={() => resolve('closed')}>Cerrar "{holder.title}" (terminado o aprendido)</button>
      <button className="list-btn" onClick={() => resolve('discarded')}>Descartar "{holder.title}"</button>
      <button className="list-btn ghost" onClick={() => { if (want.status !== 'paused') setProjectStatus(s, want.id, 'paused'); onClose(); }}>Dejar "{want.title}" en pausa</button>
    </Sheet>
  );
}

export function ProjectSheet({ project, defaults, onClose, onConflict, onSaved }: {
  project?: Project; defaults?: Partial<Project>; onClose: () => void; onConflict?: (want: Project, holder: Project) => void; onSaved?: (p: Project) => void;
}) {
  const s = useStore();
  const goals = s.all('goal').filter((g) => g.status === 'active');
  const [f, setF] = useState<Partial<Project>>(project ?? { role: 'main', isExperiment: true, growth: 3, deadline: addDays(today(), 30), ...defaults });
  const [err, setErr] = useState('');
  const up = (p: Partial<Project>) => setF((x) => ({ ...x, ...p }));

  const save = () => {
    if (!f.title?.trim()) return setErr('Poné un nombre.');
    if (f.isExperiment && (!f.successCriteria?.trim() || !f.deadline))
      return setErr('Un experimento necesita criterio de éxito medible y fecha de decisión.');
    const data = { ...f, title: f.title.trim() };
    if (project) {
      const holder = project.status === 'active' && f.role !== project.role ? slotConflict(s.all('project'), f.role!, project.id) : undefined;
      if (holder) return setErr(`El cupo "${ROLE_LABEL[f.role!]}" está ocupado por "${holder.title}".`);
      s.update('project', project.id, data);
      onSaved?.(s.get('project', project.id)!);
      return onClose();
    }
    const holder = slotConflict(s.all('project'), f.role!);
    const p = s.create('project', { ...(data as Project), kind: 'project', status: holder ? 'paused' : 'active' });
    onSaved?.(p);
    if (holder && onConflict) onConflict(p, holder);
    else {
      if (holder) toast(`Guardado en pausa: el cupo lo ocupa "${holder.title}".`);
      onClose();
    }
  };

  return (
    <Sheet title={project ? 'Editar proyecto' : 'Nuevo proyecto'} onClose={onClose}>
      <Field label="Nombre"><input value={f.title ?? ''} onChange={(e) => up({ title: e.target.value })} /></Field>
      <Field label="Rol"><Chips<ProjectRole> value={f.role} options={Object.entries(ROLE_LABEL) as [ProjectRole, string][]} onChange={(v) => up({ role: v, isExperiment: v === 'main' || v === 'secondary' ? f.isExperiment : false })} /></Field>
      <Field label="Objetivo al que sirve">
        <select value={f.goalId ?? ''} onChange={(e) => up({ goalId: e.target.value || undefined })}>
          <option value="">—</option>
          {goals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
        </select>
      </Field>
      <Toggle checked={!!f.isExperiment} onChange={(v) => up({ isExperiment: v })} label="Es un experimento (validar demanda antes de invertir meses)" />
      {f.isExperiment && (
        <>
          <Field label="Hipótesis" hint="Ej.: Administradores de consorcio pagarían por mantenimiento mensual de espacios verdes.">
            <input value={f.hypothesis ?? ''} onChange={(e) => up({ hypothesis: e.target.value })} />
          </Field>
          <Field label="Criterio de éxito (medible)" hint="Ej.: 3 de 20 contactados piden presupuesto en 21 días.">
            <input value={f.successCriteria ?? ''} onChange={(e) => up({ successCriteria: e.target.value })} />
          </Field>
          <div className="grid2">
            <Field label="Fecha de decisión"><input type="date" value={f.deadline ?? ''} onChange={(e) => up({ deadline: e.target.value })} /></Field>
            <Field label="Presupuesto máx. (ARS)"><NumInput integer value={f.budget} onChange={(n) => up({ budget: n ?? undefined })} /></Field>
          </div>
          <Field label="Potencial de crecimiento">
            <Chips<number> value={f.growth} options={[[1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5']]} onChange={(v) => up({ growth: v })} />
          </Field>
        </>
      )}
      {err && <p className="error">{err}</p>}
      <div className="actions">
        {project && <button className="ghost danger" onClick={() => { s.remove(project.id); onClose(); }}>Borrar</button>}
        <button className="primary" onClick={save}>Guardar</button>
      </div>
    </Sheet>
  );
}

function Tasks() {
  const s = useStore();
  const d = today();
  const tasks = s.all('task');
  const projects = s.all('project');
  const [edit, setEdit] = useState<Task | 'new' | null>(null);
  const [showDone, setShowDone] = useState(false);
  const pending = tasks.filter((t) => t.status === 'todo');
  const groups = [...projects.filter((p) => p.status === 'active'), undefined];
  const done = tasks.filter((t) => t.status === 'done').sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? '')).slice(0, 30);

  const row = (t: Task) => (
    <div key={t.id} className="task">
      <div className="grow" onClick={() => setEdit(t)}>
        <div>{t.title}</div>
        <small className="muted">
          <span className={'tag ' + t.type}>{TYPE_LABEL[t.type]}</span> {t.estimateMin} min
          {t.dueDate && ` · vence ${short(t.dueDate)}`}
          {t.plannedFor && ` · plan ${t.plannedFor === d ? 'hoy' : short(t.plannedFor)}`}
          {t.postponeCount > 0 && ` · postergada ${t.postponeCount}×`}
        </small>
      </div>
      {t.plannedFor !== d && <button className="ghost small" onClick={() => { s.update('task', t.id, { plannedFor: d }); toast('Agregada al plan de hoy'); }}>Hoy</button>}
    </div>
  );

  return (
    <>
      {pending.length === 0 && <Empty>Sin acciones pendientes. Cada proyecto activo necesita una próxima acción concreta.</Empty>}
      {groups.map((p) => {
        const ts = pending.filter((t) => (p ? t.projectId === p.id : !t.projectId || !projects.some((x) => x.id === t.projectId && x.status === 'active')));
        if (!ts.length) return null;
        return (
          <section key={p?.id ?? 'none'} className="card">
            <h3>{p ? p.title : 'Sin proyecto activo'}</h3>
            {ts.map(row)}
          </section>
        );
      })}
      <button className="primary block" onClick={() => setEdit('new')}>+ Acción</button>
      <button className="ghost small" onClick={() => setShowDone(!showDone)}>{showDone ? 'Ocultar' : 'Ver'} completadas</button>
      {showDone && (
        <section className="card">
          {done.map((t) => (
            <div key={t.id} className="task done">
              <div className="grow">
                <div>{t.title}</div>
                <small className="muted">{t.doneAt && short(t.doneAt)} · {TYPE_LABEL[t.type]}{t.evidence ? ' · ' + t.evidence : ''}</small>
              </div>
            </div>
          ))}
        </section>
      )}
      {edit && <TaskSheet task={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function Ideas() {
  const s = useStore();
  const ideas = s.all('idea').filter((i) => i.status === 'waiting');
  const [text, setText] = useState('');
  const [promote, setPromote] = useState<Idea | null>(null);
  const [conflict, setConflict] = useState<{ want: Project; holder: Project } | null>(null);

  const add = () => {
    if (!text.trim()) return;
    s.create('idea', { kind: 'idea', title: text.trim(), status: 'waiting' });
    setText('');
  };

  return (
    <>
      <p className="muted small">Las ideas no se pierden, pero tampoco compiten con tu plan. Se revisan en la revisión semanal.</p>
      <div className="row">
        <input className="grow" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="Nueva idea…" />
        <button className="primary" onClick={add}>Guardar</button>
      </div>
      {ideas.length === 0 && <Empty>Lista de espera vacía.</Empty>}
      {ideas.map((i) => (
        <section key={i.id} className="card">
          <div>{i.title}</div>
          <small className="muted">Guardada {short(new Date(i.createdAt).toISOString().slice(0, 10))}</small>
          <div className="actions left">
            <button className="ghost small" onClick={() => setPromote(i)}>Convertir en experimento</button>
            <button className="ghost small danger" onClick={() => s.update('idea', i.id, { status: 'discarded' })}>Descartar</button>
          </div>
        </section>
      ))}
      {promote && (
        <ProjectSheet
          defaults={{ title: promote.title, role: 'main', isExperiment: true }}
          onSaved={() => s.update('idea', promote.id, { status: 'promoted' })}
          onConflict={(want, holder) => { setPromote(null); setConflict({ want, holder }); }}
          onClose={() => setPromote(null)}
        />
      )}
      {conflict && <ConflictSheet {...conflict} onClose={() => setConflict(null)} />}
    </>
  );
}
