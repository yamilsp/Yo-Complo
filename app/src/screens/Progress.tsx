import { useState } from 'react';
import { useStore } from '../lib/store';
import type { MissCause } from '../lib/types';
import { CAUSE_LABEL } from '../lib/types';
import { addDays, daysBetween, fromISO, inRange, today, weekStart } from '../lib/dates';
import { fmtMoney, goalCurrent, goalProgress, moneySum, monthRange, snapshot, type Snapshot } from '../lib/model';
import { achievements, balance, pointsBetween, strategicProgress } from '../lib/points';
import { coach } from '../lib/coach';
import { consistency } from './Habits';
import { Bar, Chips, Empty, Field, NumInput, Sheet, toast } from '../ui';

type Period = 'week' | 'month';

export interface PeriodStats {
  planned: number;
  done: number;
  contacts: number;
  proposals: number;
  clients: number;
  incomeARS: number;
  savingARS: number;
  savingUSD: number;
  habitRate: number | null;
  causes: [MissCause, number][];
}

export function periodStats(s: Snapshot, from: string, to: string): PeriodStats {
  const days = s.days.filter((d) => d.closed && inRange(d.date, from, to));
  const cnt = (t: string) => s.results.filter((r) => r.type === t && inRange(r.date, from, to)).reduce((a, r) => a + Math.max(1, r.qty), 0);
  const n = daysBetween(from, to) + 1;
  const hs = s.habits.filter((h) => h.active);
  const causes = new Map<MissCause, number>();
  const bump = (c?: MissCause) => c && causes.set(c, (causes.get(c) ?? 0) + 1);
  s.days.filter((d) => inRange(d.date, from, to)).forEach((d) => bump(d.missCause));
  s.obstacles.filter((o) => inRange(o.date, from, to)).forEach((o) => bump(o.cause));
  s.habitLogs.filter((l) => inRange(l.date, from, to)).forEach((l) => bump(l.reason));
  return {
    planned: days.reduce((a, d) => a + (d.plannedCount ?? 0), 0),
    done: days.reduce((a, d) => a + (d.doneCount ?? 0), 0),
    contacts: cnt('contact'),
    proposals: cnt('proposal'),
    clients: cnt('client'),
    incomeARS: moneySum(s.results, 'income', 'ARS', from, to),
    savingARS: moneySum(s.results, 'saving', 'ARS', from, to),
    savingUSD: moneySum(s.results, 'saving', 'USD', from, to),
    habitRate: hs.length ? hs.reduce((a, h) => a + consistency(s.habitLogs, h.id, to, n), 0) / hs.length : null,
    causes: [...causes.entries()].sort((a, b) => b[1] - a[1]),
  };
}

export function Progress() {
  const s = useStore();
  const snap = snapshot(s);
  const d = today();
  const [period, setPeriod] = useState<Period>('week');
  const [sheet, setSheet] = useState<null | 'review' | 'reward'>(null);
  const [from, to] = period === 'week' ? [weekStart(d), d] : monthRange(d);
  const pts = pointsBetween(snap, from, to);
  const st = periodStats(snap, from, to);
  const strat = strategicProgress(snap);
  const findings = coach(snap, d);
  const bal = balance(snap);
  const ach = achievements(snap);
  const firstUse = [...snap.days.map((x) => x.date), ...snap.tasks.map((t) => new Date(t.createdAt).toISOString().slice(0, 10))].sort()[0];
  const cycleDay = firstUse ? daysBetween(firstUse, d) + 1 : 0;
  const closedAll = snap.days.filter((x) => x.closed).length;
  const dow = fromISO(d).getDay();
  const reviewWeek = dow === 0 || dow >= 5 ? addDays(weekStart(d), 7) : weekStart(d);
  const reviewed = snap.reviews.some((r) => r.weekStart === reviewWeek);

  return (
    <div className="screen">
      <h1>Progreso</h1>
      {!reviewed && (dow === 0 || dow >= 5 || dow === 1) && (
        <section className="card coach sev2" onClick={() => setSheet('review')}>
          <b>Revisión semanal pendiente</b>
          <p>10–15 minutos. Termina con pocas prioridades para la semana.</p>
        </section>
      )}
      <Chips<Period> value={period} options={[['week', 'Esta semana'], ['month', 'Este mes']]} onChange={setPeriod} />

      <div className="tiles">
        <div className="tile"><small>Actividad</small><b>{pts.activity}</b><small>pts</small></div>
        <div className="tile accent"><small>Resultados</small><b>{pts.results}</b><small>pts</small></div>
        <div className="tile"><small>Estratégico</small><b>{strat == null ? '—' : Math.round(strat * 100) + '%'}</b><small>objetivos</small></div>
      </div>
      {pts.activity > 0 && pts.results === 0 && (
        <p className="warn">Hay actividad pero ningún resultado registrado. Los puntos de actividad no reemplazan resultados.</p>
      )}

      <section className="card">
        <h3>Dinero</h3>
        <div className="kv"><span>Ingresos cobrados</span><b>{fmtMoney(st.incomeARS)}</b></div>
        <div className="kv"><span>Ahorro ARS</span><b>{fmtMoney(st.savingARS)}</b></div>
        <div className="kv"><span>Ahorro USD</span><b>{fmtMoney(st.savingUSD, 'USD')}</b></div>
      </section>

      <section className="card">
        <h3>Comercial</h3>
        <div className="kv"><span>Contactos</span><b>{st.contacts}</b></div>
        <div className="kv"><span>Propuestas</span><b>{st.proposals}</b></div>
        <div className="kv"><span>Clientes nuevos</span><b>{st.clients}</b></div>
        {st.contacts > 0 && <small className="muted">Conversión contacto → propuesta: {Math.round((st.proposals / st.contacts) * 100)}%</small>}
      </section>

      <section className="card">
        <h3>Ejecución</h3>
        <div className="kv"><span>Prioridades cumplidas</span><b>{st.done}/{st.planned}</b></div>
        {st.planned > 0 && <Bar value={st.done / st.planned} tone={st.done / st.planned >= 0.7 ? 'ok' : st.done / st.planned >= 0.5 ? 'warn' : 'bad'} />}
        <div className="kv"><span>Acciones importantes</span><b>{pts.importantDone}</b></div>
        <div className="kv"><span>Comerciales / evitadas enfrentadas</span><b>{pts.commercialDone} / {pts.avoidedDone}</b></div>
        <div className="kv"><span>Preparación</span><b>{pts.prepDone}</b></div>
        <div className="kv"><span>Hábitos (consistencia)</span><b>{st.habitRate == null ? '—' : Math.round(st.habitRate * 100) + '%'}</b></div>
        {st.causes[0] && <div className="kv"><span>Causa principal de incumplimiento</span><b>{CAUSE_LABEL[st.causes[0][0]]} ({st.causes[0][1]})</b></div>}
      </section>

      <section className="card">
        <h3>Objetivos</h3>
        {snap.goals.filter((g) => g.status === 'active' && g.target != null).length === 0 && <Empty>Ningún objetivo con número todavía. Sin número no hay forma de saber si avanzás.</Empty>}
        {snap.goals.filter((g) => g.status === 'active' && g.target != null).map((g) => {
          const p = goalProgress(g, snap.results) ?? 0;
          return (
            <div key={g.id} className="goal-row">
              <div className="row between"><span>{g.title}</span><small>{Math.round(p * 100)}%</small></div>
              <Bar value={p} />
              <small className="muted">{Math.round(goalCurrent(g, snap.results)).toLocaleString('es-AR')} / {g.target!.toLocaleString('es-AR')} {g.unit}</small>
            </div>
          );
        })}
      </section>

      <section className="card">
        <h3>Coach</h3>
        {findings.length === 0 && <Empty>Sin alertas. Si tenés pocos datos, es normal: registrá cierres y resultados unos días.</Empty>}
        {findings.map((f) => (
          <div key={f.id} className={'finding sev' + f.severity}>
            <b>{f.title}</b>
            <p className="small">{f.evidence}</p>
            <p className="fix small">→ {f.action}</p>
          </div>
        ))}
      </section>

      <section className="card">
        <div className="row between">
          <h3>Recompensas</h3>
          <span className="muted">Saldo: <b>{bal}</b> pts</span>
        </div>
        {snap.rewards.length === 0 && <Empty>Definí recompensas personales (ej.: cena afuera = 300 pts). Se canjean con puntos ganados.</Empty>}
        {snap.rewards.map((r) => (
          <div key={r.id} className="kv">
            <span>{r.title} · {r.cost} pts</span>
            <span>
              <button className="ghost small" disabled={bal < r.cost} onClick={() => {
                s.create('redemption', { kind: 'redemption', rewardId: r.id, title: r.title, cost: r.cost, date: d });
                toast('Canjeado. Disfrutalo sin culpa.');
              }}>Canjear</button>
              <button className="ghost small danger" onClick={() => s.remove(r.id)}>✕</button>
            </span>
          </div>
        ))}
        <button className="ghost small" onClick={() => setSheet('reward')}>+ Recompensa</button>
      </section>

      <section className="card">
        <h3>Logros verificables</h3>
        {ach.length === 0 ? <Empty>Se desbloquean con registros reales: contactos, propuestas, clientes, cierres.</Empty> : ach.map((a) => (
          <div key={a.id} className="kv"><span>🏅 {a.title}</span><small className="muted">{a.detail}</small></div>
        ))}
      </section>

      <section className="card">
        <h3>Ciclo de 30 días</h3>
        <Bar value={Math.min(1, cycleDay / 30)} />
        <small className="muted">Día {Math.min(cycleDay, 30)} de 30 · {closedAll} cierres diarios · {snap.reviews.length} revisiones semanales</small>
      </section>

      <button className="primary block" onClick={() => setSheet('review')}>{reviewed ? 'Rehacer revisión semanal' : 'Hacer revisión semanal'}</button>

      {sheet === 'review' && <ReviewSheet weekKey={reviewWeek} onClose={() => setSheet(null)} />}
      {sheet === 'reward' && <RewardSheet onClose={() => setSheet(null)} />}
    </div>
  );
}

function RewardSheet({ onClose }: { onClose: () => void }) {
  const s = useStore();
  const [title, setTitle] = useState('');
  const [cost, setCost] = useState(200);
  return (
    <Sheet title="Nueva recompensa" onClose={onClose}>
      <Field label="Recompensa"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej.: salida con amigos" /></Field>
      <Field label="Costo en puntos" hint="Referencia: una semana sólida con resultados ronda 150–300 pts.">
        <NumInput integer value={cost} onChange={(n) => setCost(n ?? 0)} />
      </Field>
      <div className="actions">
        <button className="primary" disabled={!title.trim() || cost < 1} onClick={() => { s.create('reward', { kind: 'reward', title: title.trim(), cost }); onClose(); }}>Guardar</button>
      </div>
    </Sheet>
  );
}

/** Revisión semanal: datos de 7 días → un cambio concreto → pocas prioridades. */
function ReviewSheet({ weekKey, onClose }: { weekKey: string; onClose: () => void }) {
  const s = useStore();
  const snap = snapshot(s);
  const d = today();
  const from = addDays(d, -6);
  const st = periodStats(snap, from, d);
  const pts = pointsBetween(snap, from, d);
  const findings = coach(snap, d);
  const prev = snap.reviews.find((r) => r.weekStart === weekKey);
  const [change, setChange] = useState(prev?.change ?? '');
  const [prios, setPrios] = useState<string[]>(prev?.priorities ?? ['', '', '']);
  const [err, setErr] = useState('');
  const dueGoals = snap.goals.filter((g) => g.status === 'active' && g.reviewDate <= addDays(d, 7));
  const ideas = snap.ideas.filter((i) => i.status === 'waiting').length;
  const suggestions = findings.slice(0, 3).map((f) => f.action);

  const save = () => {
    const ps = prios.map((p) => p.trim()).filter(Boolean);
    if (!change.trim()) return setErr('Elegí un cambio concreto para la semana.');
    if (!ps.length) return setErr('Definí al menos una prioridad semanal.');
    const data = { kind: 'review' as const, weekStart: weekKey, change: change.trim(), priorities: ps, planned: st.planned, done: st.done };
    if (prev) s.update('review', prev.id, data);
    else s.create('review', data);
    toast('Revisión guardada. Tus prioridades semanales aparecen en Hoy.');
    onClose();
  };

  return (
    <Sheet title="Revisión semanal" onClose={onClose}>
      <span className="label">1. Hechos de los últimos 7 días</span>
      <div className="kv"><span>Prioridades cumplidas</span><b>{st.done}/{st.planned}</b></div>
      <div className="kv"><span>Hábitos</span><b>{st.habitRate == null ? '—' : Math.round(st.habitRate * 100) + '%'}</b></div>
      <div className="kv"><span>Acciones comerciales</span><b>{pts.commercialDone} tareas · {st.contacts} contactos</b></div>
      <div className="kv"><span>Propuestas / clientes</span><b>{st.proposals} / {st.clients}</b></div>
      <div className="kv"><span>Ingresos</span><b>{fmtMoney(st.incomeARS)}</b></div>
      <div className="kv"><span>Preparación vs resultado</span><b>{pts.prepDone} / {pts.importantDone}</b></div>
      {st.causes.length > 0 && (
        <div className="kv"><span>Causas de incumplimiento</span><b>{st.causes.slice(0, 2).map(([c, n]) => `${CAUSE_LABEL[c]} (${n})`).join(', ')}</b></div>
      )}

      <span className="label">2. Patrones detectados</span>
      {findings.length === 0 ? <p className="muted small">Ninguno con los datos actuales.</p> : findings.slice(0, 3).map((f) => (
        <p key={f.id} className="small"><b>{f.title}.</b> {f.evidence}</p>
      ))}
      {dueGoals.length > 0 && <p className="warn small">Objetivos para revisar esta semana: {dueGoals.map((g) => g.title).join(', ')}. Actualizá número o fecha en Plan.</p>}
      {ideas > 0 && <p className="muted small">{ideas} ideas en espera. Solo pasan a proyecto si reemplazan a otro.</p>}

      <span className="label">3. Un cambio concreto para la semana</span>
      {suggestions.map((sg) => (
        <button key={sg} className={'list-btn' + (change === sg ? ' on' : '')} onClick={() => setChange(sg)}>{sg}</button>
      ))}
      <input value={change} onChange={(e) => setChange(e.target.value)} placeholder="O escribí el tuyo" />

      <span className="label">4. Prioridades de la semana (máx. 3)</span>
      {prios.map((p, i) => (
        <input key={i} value={p} onChange={(e) => setPrios(prios.map((x, j) => (j === i ? e.target.value : x)))} placeholder={i === 0 ? 'Ej.: 20 contactos a consorcios y 3 propuestas' : ''} />
      ))}
      {err && <p className="error">{err}</p>}
      <div className="actions">
        <button className="primary" onClick={save}>Guardar revisión</button>
      </div>
    </Sheet>
  );
}
