import { useEffect, useState, type ReactNode } from 'react';
import { useStore } from '../lib/store';
import { addDays, daysBetween, pretty, range, today, weekStart } from '../lib/dates';
import {
  AREA, EXCUSE_FIX, EXCUSE_LABEL, EXPERIMENT_TEMPLATE, PROFILE_ID, QUADRANT_LABEL,
  cajaStreak, defaultResults, generatePlan, planId, quadrant, simpleCoach, weekId, weeklyNeeded,
  type Area, type DayPlan, type Excuse, type Energy, type Note, type PlanItem, type Profile, type Quadrant, type WeekRec,
} from '../lib/simple';
import { NumInput, toast } from '../ui';
import { Wizard } from './Wizard';
import { SettingsScreen } from '../screens/Settings';

type Tab = 'hoy' | 'semana' | 'mente' | 'ajustes';

export function SimpleApp({ onAdvanced }: { onAdvanced: () => void }) {
  const s = useStore();
  const profile = s.get('sprofile', PROFILE_ID);
  const [tab, setTab] = useState<Tab>('hoy');
  const [wizard, setWizard] = useState(false);

  if (!profile || wizard) {
    return (
      <div className="s-app">
        <Wizard onDone={() => { setWizard(false); setTab('hoy'); }} />
      </div>
    );
  }

  return (
    <div className="s-app">
      <main className="s-main">
        {tab === 'hoy' && <Today p={profile} />}
        {tab === 'semana' && <Week p={profile} />}
        {tab === 'mente' && <Mind />}
        {tab === 'ajustes' && (
          <div>
            <h1 className="s-h1">Ajustes</h1>
            <div className="s-card">
              <button className="s-btn tonal block" onClick={() => setWizard(true)}>Rehacer el test</button>
              <button className="s-btn text block" onClick={onAdvanced}>Pasar a modo avanzado</button>
              <p className="s-muted small">El modo avanzado tiene objetivos, proyectos, hábitos y métricas detalladas. Los datos se mantienen.</p>
            </div>
            <SettingsScreen simple />
          </div>
        )}
      </main>
      <nav className="s-nav">
        {([['hoy', 'Hoy', '☀'], ['semana', 'Semana', '▦'], ['mente', 'Mente', '✎'], ['ajustes', 'Ajustes', '⚙']] as [Tab, string, string][]).map(([id, l, i]) => (
          <button key={id} className={tab === id ? 'on' : ''} onClick={() => { setTab(id); window.scrollTo(0, 0); }}>
            <span className="s-nav-ic">{i}</span>
            {l}
          </button>
        ))}
      </nav>
    </div>
  );
}

function useDayPlan(p: Profile, date: string): DayPlan | undefined {
  const s = useStore();
  const plan = s.get('splan', planId(date));
  useEffect(() => {
    if (!s.get('splan', planId(date))) s.create('splan', { id: planId(date), kind: 'splan', date, items: generatePlan(p, date), closed: false });
  }, [date, p, s]);
  return plan;
}

function setItems(s: ReturnType<typeof useStore>, plan: DayPlan, items: PlanItem[]) {
  s.update('splan', plan.id, { items });
}

const fmtMin = (m: number) => (m <= 0 ? '' : m >= 60 ? `${Math.round((m / 60) * 10) / 10} h`.replace('.', ',') : `${m} min`);

function Today({ p }: { p: Profile }) {
  const s = useStore();
  const d = today();
  const plan = useDayPlan(p, d);
  const plans = s.all('splan');
  const weeks = s.all('sweek');
  const insights = simpleCoach(p, plans, weeks, d);
  const streak = cajaStreak(plans, d);
  const week = s.get('sweek', weekId(weekStart(d)));
  const [focus, setFocus] = useState(false);
  const [edit, setEdit] = useState<PlanItem | 'new' | null>(null);
  const [close, setClose] = useState(false);
  const [open, setOpen] = useState(false);
  if (!plan) return null;

  const low = plan.energy === 'bajo';
  const caja = plan.items.filter((i) => i.area === 'caja');
  const sec = plan.items.filter((i) => i.area !== 'caja');
  const done = plan.items.filter((i) => i.done).length;
  const hour = new Date().getHours();
  const toggle = (it: PlanItem) => setItems(s, plan, plan.items.map((x) => (x.id === it.id ? { ...x, done: !x.done } : x)));
  const top = insights[0];

  const Row = (it: PlanItem) => (
    <div key={it.id} className={'s-item' + (it.done ? ' done' : '')}>
      <button className={'s-check ' + AREA[it.area].color} onClick={() => toggle(it)} aria-label="Marcar">{it.done ? '✓' : ''}</button>
      <div className="s-item-body" onClick={() => setEdit(it)}>
        <div className="s-item-title">{low ? it.min : it.title}</div>
        <div className="s-item-meta">
          <span className={'s-chip ' + AREA[it.area].color}>{AREA[it.area].label}</span>
          {!low && fmtMin(it.minutes) && <span>{fmtMin(it.minutes)}</span>}
          {low && <span>versión mínima</span>}
        </div>
      </div>
    </div>
  );

  return (
    <div>
      <header className="s-top">
        <div>
          <p className="s-muted">{pretty(d)}</p>
          <h1 className="s-h1">{hour < 13 ? 'Buen día' : hour < 20 ? 'Buenas tardes' : 'Buenas noches'}</h1>
        </div>
        <div className="s-streak" title="Días seguidos con al menos una acción de caja">
          <b>{streak}</b>
          <small>{streak === 1 ? 'día' : 'días'} seguidos</small>
        </div>
      </header>

      {!plan.energy && (
        <div className="s-card s-tonal">
          <b>¿Cómo arrancás hoy?</b>
          <div className="s-pills">
            {([['bien', 'Bien'], ['normal', 'Normal'], ['bajo', 'Sin energía']] as [Energy, string][]).map(([e, l]) => (
              <button key={e} className="s-pill" onClick={() => s.update('splan', plan.id, { energy: e })}>{l}</button>
            ))}
          </div>
        </div>
      )}
      {low && <p className="s-callout">Día de energía baja: solo versiones mínimas. Cuentan igual. Mañana volvés al plan completo.</p>}

      {top && (
        <div className={'s-card s-coach lvl' + top.level} onClick={() => setOpen(!open)}>
          <div className="s-coach-title">{top.title}</div>
          <p className="s-muted small">{top.evidence}</p>
          {p.tone !== 'datos' && (open ? (
            <>
              <p className="small"><b>Para que te sea más fácil cumplir:</b></p>
              <ol className="s-fixes">{top.fixes.map((f) => <li key={f}>{f}</li>)}</ol>
            </>
          ) : <p className="s-link small">Ver cómo facilitarlo →</p>)}
        </div>
      )}

      <button className="s-btn filled big block" onClick={() => setFocus(true)}>¿Qué hago ahora?</button>

      <section className="s-card">
        <div className="s-sec-head"><h2>Primero: caja</h2><small className="s-muted">lo que genera plata</small></div>
        {caja.map(Row)}
      </section>
      <section className="s-card">
        <div className="s-sec-head"><h2>Después</h2><small className="s-muted">{done}/{plan.items.length} hechas</small></div>
        {sec.length === 0 && <p className="s-muted small">Hoy no hay secundarias. Enfocate en la caja.</p>}
        {sec.map(Row)}
        <button className="s-btn text" onClick={() => setEdit('new')}>+ Agregar</button>
      </section>

      {week && week.results.length > 0 && (
        <section className="s-card s-outline">
          <small className="s-muted">Esta semana</small>
          {week.results.map((r, i) => <div key={i} className={'small' + (r.done ? ' s-strike' : '')}>• {r.text}</div>)}
        </section>
      )}

      <button className={'s-btn ' + (hour >= 18 ? 'tonal' : 'text') + ' block'} onClick={() => setClose(true)}>
        {plan.closed ? 'Día cerrado · editar' : 'Cerrar el día (1 min)'}
      </button>

      {focus && <Focus plan={plan} onClose={() => setFocus(false)} />}
      {edit && <ItemSheet plan={plan} item={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
      {close && <CloseSheet plan={plan} p={p} onClose={() => setClose(false)} />}
    </div>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="s-overlay" onClick={onClose}>
      <div className="s-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="s-handle" />
        <h2 className="s-sheet-title">{title}</h2>
        {children}
      </div>
    </div>
  );
}

/** Modo foco: elige la próxima acción y la reduce a 2 minutos para empezar. */
function Focus({ plan, onClose }: { plan: DayPlan; onClose: () => void }) {
  const s = useStore();
  const pending = plan.items.filter((i) => !i.done && !/^Jornada/.test(i.title));
  const it = pending.find((i) => i.area === 'caja') ?? pending[0];
  const [start] = useState(Date.now());
  const [now, setNow] = useState(Date.now());
  const [why, setWhy] = useState(false);
  const [excuse, setExcuse] = useState<Excuse | null>(null);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!it)
    return (
      <Sheet title="Todo hecho" onClose={onClose}>
        <p>Cumpliste el plan de hoy. Cada día así es un voto por la persona que querés ser.</p>
        <button className="s-btn filled block" onClick={onClose}>Listo</button>
      </Sheet>
    );
  const secs = Math.floor((now - start) / 1000);
  const mark = () => {
    setItems(s, plan, plan.items.map((x) => (x.id === it.id ? { ...x, done: true } : x)));
    toast('Hecho. Un voto más.');
    onClose();
  };
  return (
    <Sheet title="Ahora" onClose={onClose}>
      <span className={'s-chip ' + AREA[it.area].color}>{AREA[it.area].label}</span>
      <h2 className="s-focus-title">{it.title}</h2>
      {!why ? (
        <>
          <div className="s-callout">
            <b>Empezá con 2 minutos:</b> {it.min}.<br />
            Después decidís si seguís.
          </div>
          <div className="s-timer">{String(Math.floor(secs / 60)).padStart(2, '0')}:{String(secs % 60).padStart(2, '0')}</div>
          <button className="s-btn filled block" onClick={mark}>Listo ✓</button>
          <button className="s-btn text block" onClick={() => setWhy(true)}>Ahora no puedo</button>
        </>
      ) : !excuse ? (
        <>
          <p>¿Qué está pasando? Sin culpa: es un dato.</p>
          <div className="s-pills">
            {(Object.entries(EXCUSE_LABEL) as [Excuse, string][]).map(([k, l]) => (
              <button key={k} className="s-pill" onClick={() => { setExcuse(k); s.update('splan', plan.id, { excuse: k }); }}>{l}</button>
            ))}
          </div>
        </>
      ) : (
        <>
          <p><b>{EXCUSE_LABEL[excuse]}.</b> Probá esto:</p>
          <ol className="s-fixes">{EXCUSE_FIX[excuse].map((f) => <li key={f}>{f}</li>)}</ol>
          <button className="s-btn filled block" onClick={() => { setWhy(false); setExcuse(null); }}>Ok, hago los 2 minutos</button>
          <button className="s-btn text block" onClick={onClose}>Hoy no</button>
        </>
      )}
    </Sheet>
  );
}

function ItemSheet({ plan, item, onClose }: { plan: DayPlan; item?: PlanItem; onClose: () => void }) {
  const s = useStore();
  const [title, setTitle] = useState(item?.title ?? '');
  const [min, setMin] = useState(item?.min ?? '');
  const [minutes, setMinutes] = useState<number | null>(item?.minutes ?? 30);
  const [area, setArea] = useState<Area>(item?.area ?? 'extra');
  const tooMany = !item && plan.items.length >= 6;
  const save = () => {
    if (!title.trim()) return;
    const it: PlanItem = { id: item?.id ?? `${plan.date}-${Date.now().toString(36)}`, area, title: title.trim(), min: min.trim() || 'Empezar 2 minutos', minutes: minutes ?? 0, done: item?.done ?? false };
    setItems(s, plan, item ? plan.items.map((x) => (x.id === item.id ? it : x)) : [...plan.items, it]);
    onClose();
  };
  return (
    <Sheet title={item ? 'Editar' : 'Agregar al día'} onClose={onClose}>
      {tooMany && <p className="s-callout">Ya tenés {plan.items.length} cosas hoy. Eisenhower: si no es importante <i>y</i> urgente, mandalo a Mente y agendalo.</p>}
      <label className="s-label">Qué</label>
      <input className="s-input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Verbo + qué + cuánto" />
      <label className="s-label">Versión mínima (2 minutos)</label>
      <input className="s-input" value={min} onChange={(e) => setMin(e.target.value)} placeholder="Ej.: 1 mensaje" />
      <label className="s-label">Minutos</label>
      <NumInput integer value={minutes} onChange={setMinutes} />
      <label className="s-label">Área</label>
      <div className="s-pills">
        {(Object.keys(AREA) as Area[]).map((a) => (
          <button key={a} className={'s-pill' + (a === area ? ' on' : '')} onClick={() => setArea(a)}>{AREA[a].label}</button>
        ))}
      </div>
      <div className="s-row-end">
        {item && <button className="s-btn text danger" onClick={() => { setItems(s, plan, plan.items.filter((x) => x.id !== item.id)); onClose(); }}>Quitar</button>}
        <button className="s-btn filled" onClick={save}>Guardar</button>
      </div>
    </Sheet>
  );
}

function CloseSheet({ plan, p, onClose }: { plan: DayPlan; p: Profile; onClose: () => void }) {
  const s = useStore();
  const [items, setLocal] = useState(plan.items);
  const [excuse, setExcuse] = useState<Excuse | undefined>(plan.excuse);
  const missed = items.filter((i) => !i.done).length;
  const save = () => {
    s.update('splan', plan.id, { items, excuse: missed ? excuse : undefined, closed: true });
    // El plan de mañana se arma solo; lo no hecho de caja pasa primero.
    const tmr = addDays(plan.date, 1);
    if (!s.get('splan', planId(tmr))) {
      const carry = items.filter((i) => !i.done && i.area === 'caja' && !/^Jornada/.test(i.title)).slice(0, 1).map((i) => ({ ...i, id: i.id + '-c', title: i.title.replace(/^(\(pendiente\) )?/, '(pendiente) ') }));
      const gen = generatePlan(p, tmr);
      s.create('splan', { id: planId(tmr), kind: 'splan', date: tmr, items: [...carry, ...gen].slice(0, 6), closed: false });
    }
    toast(missed === 0 ? 'Día completo. Así se construye.' : 'Día cerrado. Mañana empezás por la caja.');
    onClose();
  };
  return (
    <Sheet title="¿Cómo te fue?" onClose={onClose}>
      {items.map((it) => (
        <div key={it.id} className={'s-item' + (it.done ? ' done' : '')}>
          <button className={'s-check ' + AREA[it.area].color} onClick={() => setLocal(items.map((x) => (x.id === it.id ? { ...x, done: !x.done } : x)))}>{it.done ? '✓' : ''}</button>
          <div className="s-item-body"><div className="s-item-title">{it.title}</div></div>
        </div>
      ))}
      {missed > 0 && (
        <>
          <label className="s-label">¿Qué te frenó?</label>
          <div className="s-pills">
            {(Object.entries(EXCUSE_LABEL) as [Excuse, string][]).map(([k, l]) => (
              <button key={k} className={'s-pill' + (excuse === k ? ' on' : '')} onClick={() => setExcuse(k)}>{l}</button>
            ))}
          </div>
          {excuse && <p className="s-callout small">{EXCUSE_FIX[excuse][0]}</p>}
        </>
      )}
      <button className="s-btn filled block" onClick={save}>Cerrar el día</button>
    </Sheet>
  );
}

function useWeek(p: Profile, ws: string): WeekRec | undefined {
  const s = useStore();
  const w = s.get('sweek', weekId(ws));
  useEffect(() => {
    if (!s.get('sweek', weekId(ws))) s.create('sweek', { id: weekId(ws), kind: 'sweek', weekStart: ws, income: null, results: defaultResults(p) });
  }, [ws, p, s]);
  return w;
}

function Week({ p }: { p: Profile }) {
  const s = useStore();
  const d = today();
  const ws = weekStart(d);
  const w = useWeek(p, ws);
  const weeks = s.all('sweek');
  const plans = s.all('splan');
  const need = weeklyNeeded(p);
  const insights = simpleCoach(p, plans, weeks, d);
  const [change, setChange] = useState(w?.change ?? '');
  if (!w) return null;

  const last4 = [3, 2, 1, 0].map((i) => {
    const k = addDays(ws, -7 * i);
    return { k, v: weeks.find((x) => x.weekStart === k)?.income ?? null };
  });
  const max = Math.max(need, ...last4.map((x) => x.v ?? 0));
  const known = last4.filter((x) => x.v != null);
  const avg = known.length ? known.reduce((a, x) => a + (x.v ?? 0), 0) / known.length : null;
  const grid = range(addDays(d, -27), d).map((x) => {
    const pl = plans.find((y) => y.date === x);
    return { x, ok: !!pl?.items.some((i) => i.area === 'caja' && i.done), any: !!pl };
  });
  const exp = p.experiment;
  const expLeft = exp ? daysBetween(d, exp.end) : 0;

  const decide = (decision: 'seguir' | 'cambiar' | 'cortar', next?: string) => {
    if (!exp) return;
    const hist = [...p.expHistory, { name: exp.name, start: exp.start, end: d, decision }];
    let experiment: Profile['experiment'] = undefined;
    if (decision === 'seguir') experiment = { ...exp, end: addDays(d, 7) };
    if (decision === 'cambiar' && next) {
      const t = EXPERIMENT_TEMPLATE[next];
      experiment = { idea: next, name: t?.name ?? next, question: t?.question ?? 'Mostrarlo a 5 personas en 7 días.', start: d, end: addDays(d, 7) };
    }
    s.update('sprofile', PROFILE_ID, { expHistory: hist, experiment });
    toast(decision === 'seguir' ? '7 días más, con datos.' : decision === 'cortar' ? 'Cortado. Cerrar también es terminar.' : 'Nuevo experimento en marcha.');
  };

  return (
    <div>
      <h1 className="s-h1">Semana</h1>
      <section className="s-card">
        <div className="s-sec-head"><h2>Plata de la semana</h2><small className="s-muted">meta $ {need.toLocaleString('es-AR')}</small></div>
        <NumInput value={w.income} onChange={(n) => s.update('sweek', w.id, { income: n })} placeholder="¿Cuánto entró esta semana?" />
        <div className="s-bars">
          {last4.map((x) => (
            <div key={x.k} className="s-barcol">
              <div className="s-barwrap"><div className={'s-barv' + ((x.v ?? 0) >= need ? ' ok' : '')} style={{ height: `${((x.v ?? 0) / (max || 1)) * 100}%` }} /></div>
              <small>{x.k === ws ? 'esta' : x.k.slice(8) + '/' + x.k.slice(5, 7)}</small>
            </div>
          ))}
          <div className="s-needline" style={{ bottom: `${(need / (max || 1)) * 64 + 18}px` }} />
        </div>
        {avg != null && (
          <p className="small">
            Promedio: <b>$ {Math.round(avg).toLocaleString('es-AR')}</b>/sem ≈ $ {Math.round(avg * 4.33).toLocaleString('es-AR')}/mes.{' '}
            {avg < need ? `Faltan $ ${Math.round(need - avg).toLocaleString('es-AR')} por semana.` : 'Estás sobre tu mínimo.'}
          </p>
        )}
      </section>

      <section className="s-card">
        <div className="s-sec-head"><h2>3 resultados de la semana</h2></div>
        {w.results.map((r, i) => (
          <div key={i} className={'s-item' + (r.done ? ' done' : '')}>
            <button className="s-check green" onClick={() => s.update('sweek', w.id, { results: w.results.map((x, j) => (j === i ? { ...x, done: !x.done } : x)) })}>{r.done ? '✓' : ''}</button>
            <textarea className="s-input flat" rows={2} value={r.text} placeholder="Resultado verificable" onChange={(e) => s.update('sweek', w.id, { results: w.results.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} />
          </div>
        ))}
        {w.results.length < 3 && <button className="s-btn text" onClick={() => s.update('sweek', w.id, { results: [...w.results, { text: '', done: false }] })}>+ Resultado</button>}
      </section>

      <section className="s-card">
        <div className="s-sec-head"><h2>Experimento de ingreso extra</h2><small className="s-muted">uno a la vez</small></div>
        {!exp ? (
          <>
            <p className="s-muted small">Sin experimento activo. Elegí una idea y probala 7 días.</p>
            <div className="s-pills">
              {p.ideas.map((i) => (
                <button key={i} className="s-pill" onClick={() => {
                  const t = EXPERIMENT_TEMPLATE[i];
                  s.update('sprofile', PROFILE_ID, { experiment: { idea: i, name: t?.name ?? i, question: t?.question ?? '', start: d, end: addDays(d, 7) } });
                }}>{i}</button>
              ))}
            </div>
          </>
        ) : (
          <>
            <b>{exp.name}</b>
            <p className="small">{exp.question}</p>
            {expLeft > 0 ? (
              <p className="s-muted small">Quedan {expLeft} días. Al final decidís con lo que pasó.</p>
            ) : (
              <>
                <p className="s-callout small">Terminó. ¿Qué pasó con personas reales? Decidí:</p>
                <div className="s-pills">
                  <button className="s-pill" onClick={() => decide('seguir')}>Seguir 7 días</button>
                  <button className="s-pill" onClick={() => decide('cortar')}>Cortar</button>
                  {p.ideas.filter((i) => i !== exp.idea).map((i) => (
                    <button key={i} className="s-pill" onClick={() => decide('cambiar', i)}>Cambiar a {i}</button>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </section>

      <section className="s-card">
        <div className="s-sec-head"><h2>Efecto compuesto</h2><small className="s-muted">28 días · caja cumplida</small></div>
        <div className="s-grid">
          {grid.map((g) => <span key={g.x} title={g.x} className={'s-cell' + (g.ok ? ' ok' : g.any ? ' miss' : '')} />)}
        </div>
        <p className="s-muted small">Cada cuadrado verde es un día en que hiciste algo por la plata. No hace falta que sea perfecto: hace falta que no se corte dos días seguidos.</p>
      </section>

      <section className="s-card">
        <div className="s-sec-head"><h2>Un cambio para la semana que viene</h2></div>
        {insights.slice(0, 2).flatMap((i) => i.fixes.slice(0, 1)).map((f) => (
          <button key={f} className={'s-option' + (change === f ? ' on' : '')} onClick={() => { setChange(f); s.update('sweek', w.id, { change: f }); }}>{f}</button>
        ))}
        <input className="s-input" value={change} onChange={(e) => setChange(e.target.value)} onBlur={() => s.update('sweek', w.id, { change })} placeholder="O escribí el tuyo" />
      </section>
    </div>
  );
}

function Mind() {
  const s = useStore();
  const notes = s.all('snote').filter((n) => n.status === 'open');
  const [text, setText] = useState('');
  const [current, setCurrent] = useState<Note | null>(null);
  const [imp, setImp] = useState<boolean | null>(null);

  const add = () => {
    if (!text.trim()) return;
    const n = s.create('snote', { kind: 'snote', text: text.trim(), status: 'open' });
    setText('');
    setCurrent(n);
    setImp(null);
  };

  const classify = (n: Note, q: Quadrant) => {
    if (q === 'hacer') {
      const d = today();
      const plan = s.get('splan', planId(d));
      if (plan) {
        setItems(s, plan, [...plan.items, { id: n.id + '-t', area: 'extra', title: n.text, min: 'Empezar 2 minutos', minutes: 30, done: false }]);
        s.update('snote', n.id, { quadrant: q, status: 'done' });
        toast('Agregado a Hoy');
      } else s.update('snote', n.id, { quadrant: q });
    } else if (q === 'eliminar') {
      s.update('snote', n.id, { quadrant: q, status: 'archived' });
      toast('Soltado. Una cosa menos en la cabeza.');
    } else s.update('snote', n.id, { quadrant: q });
    setCurrent(null);
  };

  const groups: Quadrant[] = ['agendar', 'delegar', 'idea'];
  return (
    <div>
      <h1 className="s-h1">Vaciar la cabeza</h1>
      <p className="s-muted">Escribí lo que te da vueltas. Dos preguntas y queda en su lugar.</p>
      <div className="s-search">
        <input className="s-input" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="¿Qué tenés en la cabeza?" />
        <button className="s-btn filled" onClick={add}>Anotar</button>
      </div>

      {notes.filter((n) => !n.quadrant).map((n) => (
        <section key={n.id} className="s-card s-tonal">
          <b>{n.text}</b>
          {current?.id === n.id && imp !== null ? (
            <>
              <p className="small">¿Tiene que hacerse en las próximas 48 h?</p>
              <div className="s-pills">
                <button className="s-pill" onClick={() => classify(n, quadrant(imp, true))}>Sí</button>
                <button className="s-pill" onClick={() => classify(n, quadrant(imp, false))}>No</button>
              </div>
            </>
          ) : (
            <>
              <p className="small">¿Te acerca a la plata, la salud o tu gente?</p>
              <div className="s-pills">
                <button className="s-pill" onClick={() => { setCurrent(n); setImp(true); }}>Sí</button>
                <button className="s-pill" onClick={() => { setCurrent(n); setImp(false); }}>No</button>
                <button className="s-pill" onClick={() => classify(n, 'idea')}>Es una idea</button>
              </div>
            </>
          )}
        </section>
      ))}

      {groups.map((g) => {
        const ns = notes.filter((n) => n.quadrant === g);
        if (!ns.length) return null;
        return (
          <section key={g} className="s-card">
            <div className="s-sec-head"><h2>{QUADRANT_LABEL[g].title}</h2><small className="s-muted">{QUADRANT_LABEL[g].hint}</small></div>
            {ns.map((n) => (
              <div key={n.id} className="s-note">
                <span>{n.text}</span>
                <span className="s-note-actions">
                  {g !== 'idea' && <button className="s-btn text small" onClick={() => classify(n, 'hacer')}>A hoy</button>}
                  <button className="s-btn text small" onClick={() => s.update('snote', n.id, { status: 'archived' })}>✕</button>
                </span>
              </div>
            ))}
          </section>
        );
      })}
      {notes.length === 0 && <p className="s-muted small s-center">Cabeza vacía. Volvé a Hoy y hacé lo que importa.</p>}
    </div>
  );
}

export { DEFAULT_PROFILE } from './Wizard';
export type { Profile };
