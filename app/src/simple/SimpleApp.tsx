import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useStore } from '../lib/store';
import { addDays, daysBetween, pretty, range, today, weekStart } from '../lib/dates';
import {
  AREA, AREA_RANK, EMPTY_LOG, dueCoach, dueLabel, guessDue, quadrantWithDue, FOCUS_BLOCK_MIN, GRACE_MIN, delivCoach, delivState, needsDeliverable, EXCUSE_FIX, EXCUSE_LABEL, EXPERIMENT_TEMPLATE, PROFILE_ID, QUADRANT_LABEL,
  cajaStreak, dayName, defaultResults, eventsForDate, gcalLink, generatePlan, guessArea, logCoach, planId, replan,
  simpleCoach, splitTasks, suggestQuadrant, weekId, weeklyNeeded, withDefaults,
  type Area, type CalEvent, type Deliverable, type ChangeReason, type DayLog, type DayPlan, type Excuse, type Energy, type FixedTask,
  type Note, type PlanItem, type Profile, type Quadrant, type WeekRec,
} from '../lib/simple';
import { NumInput, toast } from '../ui';
import { DEFAULT_NOTIFY, dueReminders, getNotifyPrefs, notifyOnce, notifySupported, requestNotifyPermission, saveNotifyPrefs, type NotifyPrefs } from '../lib/notify';
import { Wizard } from './Wizard';
import { Assistant } from './Assistant';
import { quoteForDate } from '../lib/quotes';
import { SettingsScreen } from '../screens/Settings';

type Tab = 'hoy' | 'semana' | 'ordenar' | 'asistente' | 'ajustes';
type Intent = 'ahora' | 'registrar' | null;

/** Atajos del ícono (manifest): ?go=ahora | registrar | ordenar */
function readIntent(): { tab: Tab; intent: Intent; date?: string } {
  const go = new URLSearchParams(location.search).get('go');
  if (go) history.replaceState(null, '', location.pathname);
  if (go === 'ordenar') return { tab: 'ordenar', intent: null };
  if (go === 'asistente') return { tab: 'asistente', intent: null };
  if (go === 'ahora' || go === 'registrar') return { tab: 'hoy', intent: go };
  return { tab: 'hoy', intent: null };
}

export function SimpleApp({ onAdvanced }: { onAdvanced: () => void }) {
  const s = useStore();
  const stored = s.get('sprofile', PROFILE_ID);
  const [nav, setNav] = useState(readIntent);
  const { tab, intent } = nav;
  const [wizard, setWizard] = useState(false);
  const setTab = (t: Tab) => setNav({ tab: t, intent: null });
  useReminders();

  if (!stored || wizard) {
    return (
      <div className="s-app">
        <Wizard onDone={() => { setWizard(false); setTab('hoy'); }} />
      </div>
    );
  }
  const profile = withDefaults(stored);

  return (
    <div className="s-app">
      <main className="s-main">
        {tab === 'hoy' && <Today key={nav.date ?? 'hoy'} p={profile} intent={intent} initialDate={nav.date} goWeek={() => setTab('semana')} />}
        {tab === 'semana' && <Week p={profile} goRegister={() => setNav({ tab: 'hoy', intent: 'registrar' })} goDay={(date) => { setNav({ tab: 'hoy', intent: null, date }); window.scrollTo(0, 0); }} />}
        {tab === 'ordenar' && <Organize />}
        {tab === 'asistente' && <Assistant p={profile} />}
        {tab === 'ajustes' && (
          <div>
            <h1 className="s-h1">Ajustes</h1>
            <NotifySettings />
            <CalendarSettings p={profile} />
            <div className="s-card">
              <button className="s-btn tonal block" onClick={() => setWizard(true)}>Rehacer el test</button>
              <button className="s-btn text block" onClick={onAdvanced}>Pasar a modo avanzado</button>
              <p className="s-muted small">El modo avanzado tiene objetivos, proyectos, hábitos y métricas detalladas. Los datos se mantienen.</p>
            </div>
            <SettingsScreen simple />
            <p className="s-muted small s-center">Versión {__BUILD__}</p>
          </div>
        )}
      </main>
      <nav className="s-nav">
        {([['hoy', 'Hoy', '☀'], ['semana', 'Semana', '▦'], ['ordenar', 'Ordenar', '⊞'], ['asistente', 'Asistente', '✦'], ['ajustes', 'Ajustes', '⚙']] as [Tab, string, string][]).map(([id, l, i]) => (
          <button key={id} className={tab === id ? 'on' : ''} onClick={() => { setTab(id); window.scrollTo(0, 0); }}>
            <span className="s-nav-ic">{i}</span>
            {l}
          </button>
        ))}
      </nav>
    </div>
  );
}

/** Revisa cada 30 s si hay que avisar algo (mañana, cierre, tareas con hora). */
function useReminders() {
  const s = useStore();
  useEffect(() => {
    const tick = () => {
      const prefs = getNotifyPrefs();
      if (!prefs.enabled) return;
      const d = today();
      const plan = s.get('splan', planId(d));
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const due = s.all('snote').filter((n) => n.status === 'open' && n.due && n.quadrant !== 'eliminar').map((n) => ({ id: n.id, text: n.text, due: n.due! }));
      for (const r of dueReminders(prefs, { date: d, nowHHMM: hhmm, items: plan?.items ?? [], due, closed: !!plan?.closed })) notifyOnce(r.key, r.title, r.body);
    };
    tick();
    const t = setInterval(tick, 30000);
    return () => clearInterval(t);
  }, [s]);
}

/**
 * Plan del día. Hoy (y futuro) se guarda al abrirlo. Un día pasado sin datos se muestra
 * como borrador y se guarda recién cuando cargás algo: mirar no cuenta como incumplir.
 */
function useDayPlan(p: Profile, date: string): DayPlan | undefined {
  const s = useStore();
  const stored = s.get('splan', planId(date));
  const isPast = date < today();
  const draft = useMemo<DayPlan>(() => ({ id: planId(date), kind: 'splan', date, items: generatePlan(p, date), closed: false, createdAt: 0, updatedAt: 0 }), [date, p]);
  useEffect(() => {
    if (!isPast && !s.get('splan', planId(date))) s.create('splan', { id: planId(date), kind: 'splan', date, items: generatePlan(p, date), closed: false });
  }, [date, p, s, isPast]);
  return stored ?? (isPast ? draft : undefined);
}

/** Guarda cambios del plan; si era un borrador de un día pasado, lo crea. */
function savePlan(s: ReturnType<typeof useStore>, plan: DayPlan, patch: Partial<DayPlan>) {
  if (s.get('splan', plan.id)) s.update('splan', plan.id, patch);
  else s.create('splan', { id: plan.id, kind: 'splan', date: plan.date, items: plan.items, closed: plan.closed, ...patch });
}

function setItems(s: ReturnType<typeof useStore>, plan: DayPlan, items: PlanItem[]) {
  savePlan(s, plan, { items });
}

const fmtMin = (m: number) => (m <= 0 ? '' : m >= 60 ? `${Math.round((m / 60) * 10) / 10} h`.replace('.', ',') : `${m} min`);
const byTime = (a: PlanItem, b: PlanItem) => (a.time ?? '99').localeCompare(b.time ?? '99');

function useCalendar(url: string | undefined, date: string) {
  const [state, setState] = useState<{ events: CalEvent[]; error: string | null; loading: boolean }>({ events: [], error: null, loading: false });
  useEffect(() => {
    if (!url) return;
    let alive = true;
    setState((x) => ({ ...x, loading: true }));
    fetch('/api/ical?url=' + encodeURIComponent(url))
      .then(async (r) => {
        const text = await r.text();
        if (!r.ok) throw new Error(text || 'Error ' + r.status);
        if (!text.startsWith('BEGIN:VCALENDAR')) throw new Error('la respuesta no es un calendario');
        return text;
      })
      .then((ics) => alive && setState({ events: eventsForDate(ics, date), error: null, loading: false }))
      .catch((e: Error) => alive && setState({ events: [], error: e.message.slice(0, 120), loading: false }));
    return () => {
      alive = false;
    };
  }, [url, date]);
  return state;
}

const MAX_BACK_DAYS = 60;

function Today({ p, intent, goWeek, initialDate }: { p: Profile; intent: Intent; goWeek: () => void; initialDate?: string }) {
  const s = useStore();
  const realToday = today();
  const [d, setD] = useState(initialDate && initialDate <= realToday ? initialDate : realToday);
  const isPast = d < realToday;
  const plan = useDayPlan(p, d);
  const plans = s.all('splan');
  const weeks = s.all('sweek');
  const insights = [...dueCoach(s.all('snote'), realToday), ...delivCoach(s.all('sdeliv'), realToday), ...simpleCoach(p, plans, weeks, realToday), ...logCoach(p, plans, realToday)].sort((a, b) => b.level - a.level);
  const streak = cajaStreak(plans, realToday);
  const week = s.get('sweek', weekId(weekStart(d)));
  const cal = useCalendar(isPast ? undefined : p.icalUrl, d);
  const quote = quoteForDate(d);
  const go = (n: number) => {
    const next = addDays(d, n);
    if (next > realToday || next < addDays(realToday, -MAX_BACK_DAYS)) return;
    setD(next);
    window.scrollTo(0, 0);
  };
  const [focus, setFocus] = useState(intent === 'ahora');
  const [edit, setEdit] = useState<PlanItem | 'new' | null>(null);
  const [close, setClose] = useState(intent === 'registrar');
  const [change, setChange] = useState(false);
  const [open, setOpen] = useState(false);
  if (!plan) return null;

  const low = plan.energy === 'bajo';
  const caja = plan.items.filter((i) => i.area === 'caja');
  const sec = plan.items.filter((i) => i.area !== 'caja' && i.area !== 'fijo');
  const fixed = plan.items.filter((i) => i.area === 'fijo').sort(byTime);
  const done = plan.items.filter((i) => i.done).length;
  const hour = new Date().getHours();
  const sunday = !isPast && new Date().getDay() === 0;
  const toggle = (it: PlanItem) => setItems(s, plan, plan.items.map((x) => (x.id === it.id ? { ...x, done: !x.done } : x)));
  const top = insights[0];

  const Row = (it: PlanItem) => (
    <div key={it.id} className={'s-item' + (it.done ? ' done' : '')}>
      <button className={'s-check ' + AREA[it.area].color} onClick={() => toggle(it)} aria-label="Marcar">{it.done ? '✓' : ''}</button>
      <div className="s-item-body" onClick={() => setEdit(it)}>
        <div className="s-item-title">{low ? it.min : it.title}</div>
        <div className="s-item-meta">
          {it.time && <b>{it.time}</b>}
          <span className={'s-chip ' + AREA[it.area].color}>{AREA[it.area].label}</span>
          {!low && fmtMin(it.minutes) && <span>{fmtMin(it.minutes)}</span>}
          {low && <span>versión mínima</span>}
        </div>
      </div>
    </div>
  );

  return (
    <div>
      <div className="s-daynav">
        <button className="s-btn text small" onClick={() => go(-1)} disabled={d <= addDays(realToday, -MAX_BACK_DAYS)} aria-label="Día anterior">‹ Anterior</button>
        <span className="s-muted">{pretty(d)}</span>
        {isPast ? (
          <button className="s-btn text small" onClick={() => go(1)} aria-label="Día siguiente">Siguiente ›</button>
        ) : <span className="s-daynav-spacer" />}
      </div>
      <header className="s-top">
        <div>
          <h1 className="s-h1">{isPast ? (d === addDays(realToday, -1) ? 'Ayer' : 'Día anterior') : hour < 13 ? 'Buen día' : hour < 20 ? 'Buenas tardes' : 'Buenas noches'}</h1>
          <p className="s-quote">“{quote.text}” <span>— {quote.source}</span></p>
        </div>
        <div className="s-streak" title="Días seguidos con al menos una acción de caja">
          <b>{streak}</b>
          <small>{streak === 1 ? 'día' : 'días'} seguidos</small>
        </div>
      </header>

      {sunday && (
        <div className="s-card s-tonal" onClick={goWeek}>
          <b>Domingo: planificá la semana</b>
          <p className="small">Revisá la plata, elegí 3 resultados y el evento social de la semana. 10 minutos. →</p>
        </div>
      )}

      {isPast && (
        <div className="s-card s-tonal">
          <b>Estás cargando un día anterior</b>
          <p className="small">Marcá lo que hiciste y tocá <b>{plan.closed ? 'Editar cierre' : 'Cerrar el día'}</b> para cargar el registro (mensajes, foco, celular, gym…).</p>
          <button className="s-btn tonal small" onClick={() => { setD(realToday); window.scrollTo(0, 0); }}>Volver a hoy</button>
        </div>
      )}

      {!isPast && !plan.energy && (
        <div className="s-card s-tonal">
          <b>¿Cómo arrancás hoy?</b>
          <div className="s-pills">
            {([['bien', 'Bien'], ['normal', 'Normal'], ['bajo', 'Sin energía']] as [Energy, string][]).map(([e, l]) => (
              <button key={e} className="s-pill" onClick={() => savePlan(s, plan, { energy: e })}>{l}</button>
            ))}
          </div>
        </div>
      )}
      {low && <p className="s-callout">Día de energía baja: solo versiones mínimas. Cuentan igual. Mañana volvés al plan completo.</p>}

      {!isPast && top && (
        <div className={'s-card s-coach lvl' + top.level} onClick={() => setOpen(!open)}>
          <div className="s-coach-title">{top.title}</div>
          <p className="s-muted small">{top.evidence}</p>
          {p.tone !== 'datos' && (open ? (
            <>
              <p className="small"><b>Para que te sea más fácil:</b></p>
              <ol className="s-fixes">{top.fixes.map((f) => <li key={f}>{f}</li>)}</ol>
              {insights.length > 1 && <p className="s-muted small">+{insights.length - 1} alertas más en Semana.</p>}
            </>
          ) : <p className="s-link small">Ver cómo facilitarlo →</p>)}
        </div>
      )}

      {!isPast && <button className="s-btn filled big block" onClick={() => setFocus(true)}>¿Qué hago ahora?</button>}

      {p.icalUrl && (cal.events.length > 0 || cal.error) && (
        <section className="s-card s-outline">
          <div className="s-sec-head"><h2>Agenda</h2><small className="s-muted">Google Calendar</small></div>
          {cal.error && <p className="s-muted small">No pude leer el calendario: {cal.error}</p>}
          {cal.events.map((e, i) => (
            <div key={i} className="s-event"><b>{e.allDay ? 'Todo el día' : `${e.start}–${e.end}`}</b><span>{e.title}</span></div>
          ))}
        </section>
      )}

      {!isPast && <DueCard />}

      <section className="s-card">
        <div className="s-sec-head"><h2>Primero: caja</h2><small className="s-muted">lo que genera plata</small></div>
        {caja.sort(byTime).map(Row)}
      </section>
      <section className="s-card">
        <div className="s-sec-head"><h2>Después</h2><small className="s-muted">{done}/{plan.items.length} hechas</small></div>
        {sec.length === 0 && <p className="s-muted small">Hoy no hay secundarias. Enfocate en la caja.</p>}
        {sec.sort(byTime).map(Row)}
        <button className="s-btn text" onClick={() => setEdit('new')}>+ Agregar</button>
      </section>
      {fixed.length > 0 && (
        <section className="s-card">
          <div className="s-sec-head"><h2>Tareas fijas de hoy</h2><small className="s-muted">día y hora fijos</small></div>
          {fixed.map(Row)}
        </section>
      )}

      {week && week.results.some((r) => r.text) && (
        <section className="s-card s-outline">
          <small className="s-muted">Esta semana</small>
          {week.results.filter((r) => r.text).map((r, i) => <div key={i} className={'small' + (r.done ? ' s-strike' : '')}>• {r.text}</div>)}
        </section>
      )}

      <div className="s-row2">
        {!isPast ? <button className="s-btn tonal" onClick={() => setChange(true)}>Cambió el día</button> : <span />}
        <button className={'s-btn ' + (hour >= 18 || isPast ? 'filled' : 'tonal')} onClick={() => setClose(true)}>
          {plan.closed ? 'Editar cierre' : 'Cerrar el día'}
        </button>
      </div>

      {focus && <Focus plan={plan} onClose={() => setFocus(false)} />}
      {edit && <ItemSheet plan={plan} item={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
      {close && <CloseSheet plan={plan} p={p} onClose={() => setClose(false)} />}
      {change && <ChangeSheet plan={plan} onClose={() => setChange(false)} />}
    </div>
  );
}

/** Fechas límite cercanas (vencidas, hoy y próximos 2 días) desde Ordenar. */
function DueCard() {
  const s = useStore();
  const d = today();
  const list = s.all('snote').filter((n) => n.status === 'open' && n.due && n.due <= addDays(d, 2) && n.quadrant !== 'eliminar').sort((a, b) => a.due!.localeCompare(b.due!));
  if (!list.length) return null;
  const toToday = (n: Note) => {
    const plan = s.get('splan', planId(d));
    if (!plan) return;
    setItems(s, plan, [...plan.items, { id: n.id + '-t', area: n.area ?? 'extra', title: n.text, min: 'Empezar 2 minutos', minutes: 30, done: false }]);
    s.update('snote', n.id, { status: 'done' });
    toast('Agregada a Hoy');
  };
  return (
    <section className="s-card s-due">
      <div className="s-sec-head"><h2>Fechas límite</h2><small className="s-muted">próximos 2 días</small></div>
      {list.map((n) => {
        const l = dueLabel(n.due!, d);
        return (
          <div key={n.id} className="s-note">
            <span className="small"><span className={'s-dot ' + AREA[n.area ?? 'extra'].color} /> {n.text} <b className={'s-due-' + l.tone}>· {l.text}</b></span>
            <button className="s-btn text small" onClick={() => toToday(n)}>A hoy</button>
          </div>
        );
      })}
    </section>
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

function ChangeSheet({ plan, onClose }: { plan: DayPlan; onClose: () => void }) {
  const s = useStore();
  const apply = (r: ChangeReason) => {
    savePlan(s, plan, { items: replan(plan.items, r, plan.date), changed: r });
    toast('Plan reacomodado.');
    onClose();
  };
  return (
    <Sheet title="¿Qué cambió?" onClose={onClose}>
      <p className="s-muted small">El plan se adapta. Lo que no se negocia: al menos una acción de caja.</p>
      <button className="s-option" onClick={() => apply('lluvia')}><b>Llueve / no se puede trabajar afuera</b><br /><small>Las horas del Roble pasan a clientes, presupuestos y avisos.</small></button>
      <button className="s-option" onClick={() => apply('mas_trabajo')}><b>Salió más trabajo</b><br /><small>Quedan la caja mínima y las fijas cortas. Lo demás, otro día.</small></button>
      <button className="s-option" onClick={() => apply('imprevisto')}><b>Imprevisto</b><br /><small>3 cosas, en versión mínima.</small></button>
    </Sheet>
  );
}

/**
 * Modo foco: una sola tarea, bloque de 50 min, arranque de 2 minutos.
 * Si es un entregable: antes de empezar se define la versión 1, el tiempo máximo y a quién se muestra;
 * al agotarse el tiempo, se entrega como está.
 */
function Focus({ plan, onClose }: { plan: DayPlan; onClose: () => void }) {
  const s = useStore();
  const d = today();
  const pending = plan.items.filter((i) => !i.done && !/^Jornada/.test(i.title));
  const it = pending.find((i) => i.area === 'caja') ?? pending.sort((a, b) => AREA_RANK[a.area] - AREA_RANK[b.area])[0];
  const deliv = it ? findDeliverable(s, it) : undefined;
  const [start, setStart] = useState(Date.now());
  const [now, setNow] = useState(Date.now());
  const [why, setWhy] = useState(false);
  const [excuse, setExcuse] = useState<Excuse | null>(null);
  const [ship, setShip] = useState(false);
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

  if (needsDeliverable(it) && !deliv) return <DeliverableSetup item={it} plan={plan} onClose={onClose} onReady={() => setStart(Date.now())} />;
  if (deliv && (ship || delivState(deliv, d) === 'time_up')) return <ShipSheet deliv={deliv} item={it} plan={plan} timeUp={!ship} onClose={onClose} />;

  const secs = Math.floor((now - start) / 1000);
  const left = FOCUS_BLOCK_MIN * 60 - secs;
  if (left <= 0 && left > -2) notifyOnce('block-' + start, 'Bloque de foco cumplido', `${it.title}: pausa de 5 minutos lejos de la pantalla.`);
  const spentNow = Math.floor(secs / 60);
  const logSpent = () => deliv && spentNow > 0 && s.update('sdeliv', deliv.id, { spentMin: deliv.spentMin + spentNow });
  const mark = () => {
    logSpent();
    if (deliv) return setShip(true);
    setItems(s, plan, plan.items.map((x) => (x.id === it.id ? { ...x, done: true } : x)));
    toast('Hecho. Un voto más.');
    onClose();
  };
  const budget = deliv ? deliv.maxMin + (deliv.graceUsed ? GRACE_MIN : 0) : 0;
  return (
    <Sheet title="Ahora: una sola cosa" onClose={() => { logSpent(); onClose(); }}>
      <span className={'s-chip ' + AREA[it.area].color}>{AREA[it.area].label}</span>
      <h2 className="s-focus-title">{it.title}</h2>
      {!why ? (
        <>
          {deliv ? (
            <div className="s-callout small">
              <b>Versión 1:</b> {deliv.good}<br />
              <b>Se lo mostrás a:</b> {deliv.audience} · {deliv.showBy === d ? 'hoy' : deliv.showBy}<br />
              <b>Tiempo:</b> {fmtMin(deliv.spentMin + spentNow)} de {fmtMin(budget)}. Al agotarse, se entrega como está.
            </div>
          ) : (
            <div className="s-callout">
              <b>Empezá con 2 minutos:</b> {it.min}.<br />
              Celular en otra habitación. Solo esto hasta que suene el bloque.
            </div>
          )}
          <div className={'s-timer' + (left <= 0 ? ' done' : '')}>
            {left > 0 ? `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}` : 'Bloque cumplido'}
          </div>
          {left <= 0 && <p className="s-muted small s-center">Pausa de 5 minutos lejos de la pantalla. Después, otro bloque o la próxima tarea.</p>}
          <button className="s-btn filled block" onClick={mark}>{deliv ? 'Terminé la versión 1' : 'Listo ✓'}</button>
          {deliv && <button className="s-btn tonal block" onClick={() => { logSpent(); toast(`Guardado: ${fmtMin(deliv.spentMin + spentNow)} invertidos.`); onClose(); }}>Pausar (sigue otro día)</button>}
          <button className="s-btn text block" onClick={() => setWhy(true)}>Ahora no puedo</button>
        </>
      ) : !excuse ? (
        <>
          <p>¿Qué está pasando? Sin culpa: es un dato.</p>
          <div className="s-pills">
            {(Object.entries(EXCUSE_LABEL) as [Excuse, string][]).map(([k, l]) => (
              <button key={k} className="s-pill" onClick={() => { setExcuse(k); savePlan(s, plan, { excuse: k }); }}>{l}</button>
            ))}
          </div>
        </>
      ) : (
        <>
          <p><b>{EXCUSE_LABEL[excuse]}.</b> Probá esto:</p>
          <ol className="s-fixes">{EXCUSE_FIX[excuse].map((f) => <li key={f}>{f}</li>)}</ol>
          <button className="s-btn filled block" onClick={() => { setWhy(false); setExcuse(null); setStart(Date.now()); }}>Ok, hago los 2 minutos</button>
          <button className="s-btn text block" onClick={() => { logSpent(); onClose(); }}>Hoy no</button>
        </>
      )}
    </Sheet>
  );
}

/** Busca el entregable abierto de una tarea (por vínculo o por título, para que siga entre días). */
function findDeliverable(s: ReturnType<typeof useStore>, it: PlanItem): Deliverable | undefined {
  const open = s.all('sdeliv').filter((x) => x.status === 'open');
  return (it.delivId ? s.get('sdeliv', it.delivId) : undefined) ?? open.find((x) => x.title === it.title);
}

const SHOW_WHEN: [number, string][] = [[0, 'Hoy'], [1, 'Mañana'], [3, 'En 3 días'], [7, 'En una semana']];
const MAX_TIME: [number, string][] = [[60, '1 h'], [120, '2 h'], [180, '3 h'], [300, '5 h']];

function DeliverableSetup({ item, plan, onClose, onReady }: { item: PlanItem; plan: DayPlan; onClose: () => void; onReady: () => void }) {
  const s = useStore();
  const [good, setGood] = useState('');
  const [audience, setAudience] = useState('');
  const [when, setWhen] = useState(1);
  const [maxMin, setMax] = useState(120);
  const [err, setErr] = useState('');
  const save = () => {
    if (!good.trim()) return setErr('Definí qué es "suficientemente bueno". Sin eso, nunca termina.');
    if (!audience.trim()) return setErr('¿A quién se lo vas a mostrar? Si no lo ve nadie, no sirve.');
    const dv = s.create('sdeliv', { kind: 'sdeliv', title: item.title, good: good.trim(), audience: audience.trim(), showBy: addDays(today(), when), maxMin, spentMin: 0, graceUsed: false, status: 'open', seen: 0 });
    setItems(s, plan, plan.items.map((x) => (x.id === item.id ? { ...x, delivId: dv.id } : x)));
    onReady();
  };
  return (
    <Sheet title="Antes de empezar: versión 1" onClose={onClose}>
      <p className="small"><b>{item.title}</b></p>
      <p className="s-muted small">Lo perfecto no se termina. Definí cuándo está listo, cuánto tiempo le das y quién lo va a ver.</p>
      <label className="s-label">¿Qué es "suficientemente bueno"?</label>
      <input className="s-input" value={good} onChange={(e) => setGood(e.target.value)} placeholder="Ej.: una página con precio, 3 fotos y WhatsApp" />
      <label className="s-label">¿A quién se lo mostrás?</label>
      <input className="s-input" value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="Ej.: 3 clientes del Roble / grupo de emprendedores" />
      <label className="s-label">¿Cuándo?</label>
      <div className="s-pills">{SHOW_WHEN.map(([v, l]) => <button key={v} className={'s-pill' + (when === v ? ' on' : '')} onClick={() => setWhen(v)}>{l}</button>)}</div>
      <label className="s-label">Tiempo máximo total</label>
      <div className="s-pills">{MAX_TIME.map(([v, l]) => <button key={v} className={'s-pill' + (maxMin === v ? ' on' : '')} onClick={() => setMax(v)}>{l}</button>)}</div>
      {err && <p className="s-warn small">{err}</p>}
      <button className="s-btn filled block" onClick={save}>Empezar bloque de {FOCUS_BLOCK_MIN} min</button>
    </Sheet>
  );
}

function ShipSheet({ deliv, item, plan, timeUp, onClose }: { deliv: Deliverable; item: PlanItem; plan: DayPlan; timeUp: boolean; onClose: () => void }) {
  const s = useStore();
  const [seen, setSeen] = useState(deliv.seen);
  const [v2, setV2] = useState(deliv.v2 ?? '');
  const ship = () => {
    s.update('sdeliv', deliv.id, { status: 'shipped', seen, v2: v2.trim() || undefined, shippedAt: today() });
    setItems(s, plan, plan.items.map((x) => (x.id === item.id ? { ...x, done: true } : x)));
    toast(seen > 0 ? `Entregado y visto por ${seen}. Eso vale más que otra semana puliendo.` : 'Entregado. Ahora falta que alguien lo vea: mandalo hoy.');
    onClose();
  };
  return (
    <Sheet title={timeUp ? 'Se terminó el tiempo' : 'Versión 1 lista'} onClose={onClose}>
      <p className="small"><b>{deliv.title}</b></p>
      {timeUp && <p className="s-callout small">Le diste {fmtMin(deliv.spentMin)}. Entregalo como está: lo que falta va a la versión 2, después de ver qué responde la gente.</p>}
      <p className="small">Acordaste mostrárselo a <b>{deliv.audience}</b>.</p>
      <Stepper label="¿A cuántas personas se lo mostraste?" value={seen} step={1} onChange={setSeen} />
      <label className="s-label">¿Qué mejorarías en la versión 2? (opcional)</label>
      <input className="s-input" value={v2} onChange={(e) => setV2(e.target.value)} placeholder="Lo que te dijeron o lo que viste" />
      <button className="s-btn filled block" onClick={ship}>Marcar como entregado</button>
      {timeUp && !deliv.graceUsed && (
        <button className="s-btn text block" onClick={() => { s.update('sdeliv', deliv.id, { graceUsed: true }); toast(`+${GRACE_MIN} min, una sola vez.`); onClose(); }}>
          Necesito {GRACE_MIN} min más (una sola vez)
        </button>
      )}
      {!timeUp && <button className="s-btn text block" onClick={onClose}>Todavía no lo mostré</button>}
    </Sheet>
  );
}

function ItemSheet({ plan, item, onClose }: { plan: DayPlan; item?: PlanItem; onClose: () => void }) {
  const s = useStore();
  const [title, setTitle] = useState(item?.title ?? '');
  const [min, setMin] = useState(item?.min ?? '');
  const [minutes, setMinutes] = useState<number | null>(item?.minutes ?? 30);
  const [time, setTime] = useState(item?.time ?? '');
  const [area, setArea] = useState<Area>(item?.area ?? 'extra');
  const [deliverable, setDeliverable] = useState(!!item?.deliverable || item?.area === 'experimento');
  const tooMany = !item && plan.items.length >= 7;
  const build = (): PlanItem => ({ id: item?.id ?? `${plan.date}-${Date.now().toString(36)}`, area, title: title.trim(), min: min.trim() || 'Empezar 2 minutos', minutes: minutes ?? 0, done: item?.done ?? false, time: time || undefined, deliverable, delivId: item?.delivId });
  const save = () => {
    if (!title.trim()) return;
    const it = build();
    setItems(s, plan, item ? plan.items.map((x) => (x.id === item.id ? it : x)) : [...plan.items, it]);
    onClose();
  };
  return (
    <Sheet title={item ? 'Editar' : 'Agregar al día'} onClose={onClose}>
      {tooMany && <p className="s-callout">Ya tenés {plan.items.length} cosas hoy. Si no es importante <i>y</i> urgente, mandalo a Ordenar y agendalo.</p>}
      <label className="s-label">Qué</label>
      <input className="s-input" autoFocus={!item} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Verbo + qué + cuánto" />
      <div className="s-grid2">
        <div>
          <label className="s-label">Hora</label>
          <input className="s-input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <div>
          <label className="s-label">Minutos</label>
          <NumInput integer value={minutes} onChange={setMinutes} />
        </div>
      </div>
      <label className="s-label">Versión mínima (2 minutos)</label>
      <input className="s-input" value={min} onChange={(e) => setMin(e.target.value)} placeholder="Ej.: 1 mensaje" />
      <label className="s-label">Área</label>
      <div className="s-pills">
        {(Object.keys(AREA) as Area[]).map((a) => (
          <button key={a} className={'s-pill' + (a === area ? ' on' : '')} onClick={() => setArea(a)}>{AREA[a].label}</button>
        ))}
      </div>
      <label className="s-toggle-row">
        <input type="checkbox" checked={deliverable} onChange={(e) => setDeliverable(e.target.checked)} />
        <span><b>Es un entregable</b> (proyecto, contenido, diseño): pide versión 1, tiempo máximo y a quién mostrarlo.</span>
      </label>
      {title.trim() && time && (
        <a className="s-btn tonal block s-center-text" href={gcalLink(title.trim(), plan.date, time, minutes || 30)} target="_blank" rel="noreferrer">Agregar a Google Calendar</a>
      )}
      <div className="s-row-end">
        {item && <button className="s-btn text danger" onClick={() => { setItems(s, plan, plan.items.filter((x) => x.id !== item.id)); onClose(); }}>Quitar</button>}
        <button className="s-btn filled" onClick={save}>Guardar</button>
      </div>
    </Sheet>
  );
}

function Stepper({ label, value, step, onChange, unit }: { label: string; value: number; step: number; onChange: (n: number) => void; unit?: string }) {
  return (
    <div className="s-stepper">
      <span>{label}</span>
      <div>
        <button onClick={() => onChange(Math.max(0, +(value - step).toFixed(1)))} aria-label={'Menos ' + label}>−</button>
        <b>{String(value).replace('.', ',')}{unit}</b>
        <button onClick={() => onChange(+(value + step).toFixed(1))} aria-label={'Más ' + label}>+</button>
      </div>
    </div>
  );
}

function CloseSheet({ plan, p, onClose }: { plan: DayPlan; p: Profile; onClose: () => void }) {
  const s = useStore();
  const [items, setLocal] = useState(plan.items);
  const [excuse, setExcuse] = useState<Excuse | undefined>(plan.excuse);
  const [log, setLog] = useState<DayLog>(plan.log ?? EMPTY_LOG);
  const missed = items.filter((i) => !i.done).length;
  const up = (x: Partial<DayLog>) => setLog((l) => ({ ...l, ...x }));
  const save = () => {
    savePlan(s, plan, { items, excuse: missed ? excuse : undefined, closed: true, log });
    // El plan de mañana se arma solo; lo no hecho de caja pasa primero.
    const tmr = addDays(plan.date, 1);
    if (plan.date === today() && !s.get('splan', planId(tmr))) {
      const carry = items.filter((i) => !i.done && i.area === 'caja' && !/^Jornada/.test(i.title)).slice(0, 1).map((i) => ({ ...i, id: i.id + '-c', title: i.title.replace(/^(\(pendiente\) )?/, '(pendiente) ') }));
      s.create('splan', { id: planId(tmr), kind: 'splan', date: tmr, items: [...carry, ...generatePlan(p, tmr)], closed: false });
    }
    toast(missed === 0 ? 'Día completo. Así se construye.' : 'Día cerrado. Mañana empezás por la caja.');
    onClose();
  };
  const limit = p.phoneLimit ?? 1;
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
      <label className="s-label">Registro del día</label>
      <div className="s-card s-outline s-log">
        <Stepper label="Mensajes a clientes" value={log.messages} step={1} onChange={(n) => up({ messages: n })} />
        <Stepper label="Horas de trabajo enfocado" value={log.focusH} step={0.5} unit=" h" onChange={(n) => up({ focusH: n })} />
        <div className="s-stepper"><span>Evento o actividad social</span><button className={'s-pill' + (log.social ? ' on' : '')} onClick={() => up({ social: !log.social })}>{log.social ? '✓ Fui' : 'No'}</button></div>
        <Stepper label="Celular de ocio" value={log.phoneH} step={0.5} unit=" h" onChange={(n) => up({ phoneH: n })} />
        {log.phoneH > limit && <p className="s-warn small">Pasaste tu límite ({limit} h). Mirá el tiempo real en Bienestar digital de Android.</p>}
        <div className="s-stepper"><span>Gym / deporte</span><button className={'s-pill' + (log.gym ? ' on' : '')} onClick={() => up({ gym: !log.gym })}>{log.gym ? '✓ Fui' : 'No'}</button></div>
        <Stepper label="Horas de sueño" value={log.sleepH} step={0.5} unit=" h" onChange={(n) => up({ sleepH: n })} />
      </div>
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

const fmtN = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');

function Week({ p, goRegister, goDay }: { p: Profile; goRegister: () => void; goDay: (date: string) => void }) {
  const s = useStore();
  const d = today();
  const ws = weekStart(d);
  const w = useWeek(p, ws);
  const weeks = s.all('sweek');
  const plans = s.all('splan');
  const need = weeklyNeeded(p);
  const target = Math.round((p.incomeTarget ?? 4_000_000) / 4.33);
  const insights = [...dueCoach(s.all('snote'), d), ...delivCoach(s.all('sdeliv'), d), ...simpleCoach(p, plans, weeks, d), ...logCoach(p, plans, d)].sort((a, b) => b.level - a.level);
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
  const logs = plans.filter((x) => x.date >= ws && x.log).map((x) => x.log!);
  const sum = (f: (l: DayLog) => number) => logs.reduce((a, l) => a + f(l), 0);
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
        <div className="s-sec-head"><h2>Plata de la semana</h2><small className="s-muted">mín. $ {need.toLocaleString('es-AR')} · meta $ {target.toLocaleString('es-AR')}</small></div>
        <p className="s-help">Lo escribís vos: cuánto cobraste en total esta semana. Actualizalo cuando cobres. Las barras comparan las últimas 4 semanas.</p>
        <NumInput value={w.income} onChange={(n) => s.update('sweek', w.id, { income: n })} placeholder="¿Cuánto entró esta semana?" />
        <div className="s-bars">
          {last4.map((x) => (
            <div key={x.k} className="s-barcol">
              <div className="s-barwrap"><div className={'s-barv' + ((x.v ?? 0) >= need ? ' ok' : '')} style={{ height: `${((x.v ?? 0) / (max || 1)) * 100}%` }} /></div>
              <small>{x.k === ws ? 'esta' : x.k.slice(8) + '/' + x.k.slice(5, 7)}</small>
            </div>
          ))}
        </div>
        {avg != null && (
          <p className="small">
            Promedio: <b>$ {Math.round(avg).toLocaleString('es-AR')}</b>/sem ≈ $ {Math.round(avg * 4.33).toLocaleString('es-AR')}/mes.{' '}
            {avg < need ? `Faltan $ ${Math.round(need - avg).toLocaleString('es-AR')} por semana para el mínimo.` : avg < target ? 'Sobre el mínimo; vamos por la meta.' : 'Estás sobre tu meta.'}
          </p>
        )}
      </section>

      <section className="s-card">
        <div className="s-sec-head"><h2>Registro de la semana</h2><small className="s-muted">{logs.length} días cargados</small></div>
        <p className="s-help">Se llena solo con lo que cargás cada noche en <b>Hoy → Cerrar el día</b> (mensajes, horas de foco, evento, celular, gym, sueño).</p>
        <button className="s-btn tonal small" onClick={goRegister}>Cargar el registro de hoy</button>
        <div className="s-kpis">
          <div><b>{sum((l) => l.messages)}</b><small>mensajes a clientes</small></div>
          <div><b>{fmtN(sum((l) => l.focusH))} h</b><small>trabajo enfocado</small></div>
          <div className={logs.some((l) => l.social) ? 'ok' : ''}><b>{logs.filter((l) => l.social).length}/1</b><small>eventos sociales</small></div>
          <div className={logs.length && sum((l) => l.phoneH) / logs.length > (p.phoneLimit ?? 1) ? 'bad' : ''}><b>{logs.length ? fmtN(sum((l) => l.phoneH) / logs.length) : '–'} h</b><small>celular/día (lím. {p.phoneLimit ?? 1})</small></div>
          <div><b>{logs.filter((l) => l.gym).length}</b><small>gym/deporte</small></div>
          <div><b>{logs.length ? fmtN(sum((l) => l.sleepH) / logs.length) : '–'} h</b><small>sueño/día</small></div>
        </div>
      </section>

      {insights.length > 0 && (
        <section className="s-card">
          <div className="s-sec-head"><h2>Coach</h2></div>
        <p className="s-help">Alertas automáticas a partir de tus datos. Tocá una para ver cómo facilitarla.</p>
          {insights.map((i) => (
            <details key={i.id} className={'s-insight lvl' + i.level}>
              <summary><b>{i.title}</b><br /><small className="s-muted">{i.evidence}</small></summary>
              <ol className="s-fixes">{i.fixes.map((f) => <li key={f}>{f}</li>)}</ol>
            </details>
          ))}
        </section>
      )}

      <section className="s-card">
        <div className="s-sec-head"><h2>3 resultados de la semana</h2></div>
        <p className="s-help">Escribí (o corregí) los 3 resultados que harían que esta semana valga. Tocá el círculo cuando lo logres.</p>
        {w.results.map((r, i) => (
          <div key={i} className={'s-item' + (r.done ? ' done' : '')}>
            <button className="s-check green" onClick={() => s.update('sweek', w.id, { results: w.results.map((x, j) => (j === i ? { ...x, done: !x.done } : x)) })}>{r.done ? '✓' : ''}</button>
            <textarea className="s-input flat" rows={2} value={r.text} placeholder="Resultado verificable" onChange={(e) => s.update('sweek', w.id, { results: w.results.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} />
          </div>
        ))}
        {w.results.length < 3 && <button className="s-btn text" onClick={() => s.update('sweek', w.id, { results: [...w.results, { text: '', done: false }] })}>+ Resultado</button>}
      </section>

      <Deliverables />

      <FixedEditor p={p} />

      <section className="s-card">
        <div className="s-sec-head"><h2>Experimento de ingreso extra</h2><small className="s-muted">uno a la vez</small></div>
        <p className="s-help">Una idea de ingreso extra que probás 7 días. Aparece en Hoy los días libres. Al terminar decidís: seguir, cambiar o cortar.</p>
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
        <p className="s-help">Se pinta solo: verde los días que marcaste al menos una tarea de <b>Primero: caja</b> en Hoy. Tocá un día para verlo o cargarlo.</p>
        <div className="s-grid">
          {grid.map((g) => <button key={g.x} title={g.x} aria-label={'Ver ' + g.x} onClick={() => goDay(g.x)} className={'s-cell' + (g.ok ? ' ok' : g.any ? ' miss' : '')} />)}
        </div>
        <p className="s-muted small">Cada cuadrado verde es un día en que hiciste algo por la plata. Que no se corte dos días seguidos.</p>
      </section>

      <section className="s-card">
        <div className="s-sec-head"><h2>Un cambio para la semana que viene</h2></div>
        <p className="s-help">Elegí una sugerencia o escribí tu propio cambio. Uno solo.</p>
        {insights.slice(0, 3).map((i) => i.fixes[0]).map((f) => (
          <button key={f} className={'s-option' + (change === f ? ' on' : '')} onClick={() => { setChange(f); s.update('sweek', w.id, { change: f }); }}>{f}</button>
        ))}
        <input className="s-input" value={change} onChange={(e) => setChange(e.target.value)} onBlur={() => s.update('sweek', w.id, { change })} placeholder="O escribí el tuyo" />
      </section>
    </div>
  );
}

/** Entregas: lo que importa es cuánta gente lo vio, no cuántas horas llevó. */
function Deliverables() {
  const s = useStore();
  const d = today();
  const all = s.all('sdeliv');
  const open = all.filter((x) => x.status === 'open');
  const ws = weekStart(d);
  const shipped = all.filter((x) => x.status === 'shipped' && (x.shippedAt ?? '') >= addDays(d, -30)).sort((a, b) => (b.shippedAt ?? '').localeCompare(a.shippedAt ?? ''));
  const seenWeek = all.filter((x) => x.status === 'shipped' && (x.shippedAt ?? '') >= ws).reduce((a, x) => a + x.seen, 0);
  if (!all.length)
    return (
      <section className="s-card">
        <div className="s-sec-head"><h2>Entregas</h2><small className="s-muted">versión 1 · quién lo vio</small></div>
        <p className="s-muted small">Cuando empieces un proyecto o contenido, la app te pide la versión 1, el tiempo máximo y a quién mostrárselo. Acá ves cuánta gente vio tu trabajo.</p>
      </section>
    );
  return (
    <section className="s-card">
      <div className="s-sec-head"><h2>Entregas</h2><small className="s-muted">{seenWeek} personas lo vieron esta semana</small></div>
        <p className="s-help">Se llena cuando usás "¿Qué hago ahora?" en un proyecto o contenido: versión 1, tiempo usado y cuánta gente lo vio.</p>
      {open.map((x) => {
        const st = delivState(x, d);
        return (
          <div key={x.id} className="s-deliv">
            <div className="s-row-between"><b className="small">{x.title}</b><small className={st === 'ok' ? 's-muted' : 's-warn'}>{st === 'time_up' ? 'tiempo agotado' : st === 'late' ? 'vencida' : 'mostrar ' + (x.showBy === d ? 'hoy' : x.showBy.slice(8) + '/' + x.showBy.slice(5, 7))}</small></div>
            <div className="s-minibar"><div style={{ width: `${Math.min(100, (x.spentMin / x.maxMin) * 100)}%` }} className={x.spentMin >= x.maxMin ? 'over' : ''} /></div>
            <small className="s-muted">{fmtMin(x.spentMin) || '0 min'} de {fmtMin(x.maxMin)} · v1: {x.good} · para: {x.audience}</small>
            <div><button className="s-btn text small danger" onClick={() => s.update('sdeliv', x.id, { status: 'dropped' })}>Descartar</button></div>
          </div>
        );
      })}
      {shipped.length > 0 && <label className="s-label">Entregadas (30 días)</label>}
      {shipped.map((x) => (
        <div key={x.id} className="s-note"><span className="small">{x.title}</span><b className={'small ' + (x.seen ? '' : 's-warn')}>{x.seen} {x.seen === 1 ? 'persona' : 'personas'}</b></div>
      ))}
    </section>
  );
}

const WEEK: [number, string][] = [[1, 'Lu'], [2, 'Ma'], [3, 'Mi'], [4, 'Ju'], [5, 'Vi'], [6, 'Sá'], [0, 'Do']];

/** Tareas recurrentes con día y horario. Se pueden mandar al calendario como evento semanal. */
export function FixedEditor({ p, compact }: { p: Profile; compact?: boolean }) {
  const s = useStore();
  const list = p.fixed ?? [];
  const [title, setTitle] = useState('');
  const save = (fixed: FixedTask[]) => s.update('sprofile', PROFILE_ID, { fixed });
  const upd = (id: string, x: Partial<FixedTask>) => save(list.map((f) => (f.id === id ? { ...f, ...x } : f)));
  const sorted = [...list].sort((a, b) => ((a.day + 6) % 7) - ((b.day + 6) % 7) || a.time.localeCompare(b.time));
  const nextDate = (day: number) => {
    const t = today();
    const diff = (day - new Date().getDay() + 7) % 7;
    return addDays(t, diff);
  };
  return (
    <section className={compact ? '' : 's-card'}>
      {!compact && <div className="s-sec-head"><h2>Tareas fijas</h2><small className="s-muted">día y hora</small></div>}
      {!compact && <p className="s-help">Cosas que se repiten cada semana. Aparecen solas en Hoy el día que les toca.</p>}
      {sorted.map((f) => (
        <div key={f.id} className="s-fixed">
          <div className="s-fixed-top">
            <input className="s-input flat" value={f.title} onChange={(e) => upd(f.id, { title: e.target.value })} />
            <button className="s-btn text small danger" onClick={() => save(list.filter((x) => x.id !== f.id))} aria-label="Quitar">✕</button>
          </div>
          <div className="s-fixed-row">
            <select className="s-input s-sel" value={f.day} onChange={(e) => upd(f.id, { day: Number(e.target.value) })}>
              {WEEK.map(([v]) => <option key={v} value={v}>{dayName(v)}</option>)}
            </select>
            <input className="s-input s-sel" type="time" value={f.time} onChange={(e) => upd(f.id, { time: e.target.value })} />
            {!compact && (
              <a className="s-btn text small" target="_blank" rel="noreferrer" href={gcalLink(f.title, nextDate(f.day), f.time, f.minutes) + '&recur=' + encodeURIComponent('RRULE:FREQ=WEEKLY')}>+ Calendar</a>
            )}
          </div>
        </div>
      ))}
      <div className="s-search">
        <input className="s-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nueva tarea fija (ej.: pagar cuentas)" />
        <button className="s-btn tonal" onClick={() => {
          if (!title.trim()) return;
          save([...list, { id: 'fx-' + Date.now().toString(36), title: title.trim(), day: 6, time: '10:00', minutes: 30 }]);
          setTitle('');
        }}>Agregar</button>
      </div>
      {!compact && <p className="s-muted small">Los cambios se aplican a los días que todavía no abriste. "+ Calendar" crea el evento semanal en Google Calendar.</p>}
    </section>
  );
}

/** Asistente para ordenar: pegás tareas, se sugieren área y cuadrante, vos corregís con un toque. */
function Organize() {
  const s = useStore();
  const notes = s.all('snote').filter((n) => n.status === 'open');
  const [text, setText] = useState('');
  const [sel, setSel] = useState<Note | null>(null);

  const add = () => {
    const tasks = splitTasks(text);
    if (!tasks.length) return;
    for (const t of tasks) {
      const area = guessArea(t);
      const due = guessDue(t, today());
      s.create('snote', { kind: 'snote', text: t, area, quadrant: quadrantWithDue(suggestQuadrant(t, area), due, today()), due, status: 'open' });
    }
    setText('');
    toast(`${tasks.length} ${tasks.length === 1 ? 'tarea ordenada' : 'tareas ordenadas'}. Tocá una para corregirla.`);
  };

  const toToday = (n: Note) => {
    const d = today();
    const plan = s.get('splan', planId(d));
    if (!plan) return toast('Abrí Hoy primero para crear el plan del día.');
    setItems(s, plan, [...plan.items, { id: n.id + '-t', area: n.area ?? 'extra', title: n.text, min: 'Empezar 2 minutos', minutes: 30, done: false }]);
    s.update('snote', n.id, { status: 'done' });
    toast('Agregada a Hoy');
    setSel(null);
  };

  const Q: Quadrant[] = ['hacer', 'agendar', 'delegar', 'eliminar'];
  const sortQ = (a: Note, b: Note) => AREA_RANK[a.area ?? 'extra'] - AREA_RANK[b.area ?? 'extra'];
  const hacer = notes.filter((n) => n.quadrant === 'hacer').length;

  return (
    <div>
      <h1 className="s-h1">Ordenar</h1>
      <p className="s-muted">Escribí o pegá todo lo que tenés en la cabeza, una cosa por línea. También podés dictar con el micrófono del teclado.</p>
      <textarea className="s-input s-dump" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Mandar presupuesto a Laura\nLavar el auto\nCumple de Martín el viernes\nIdea: app para jardineros'} />
      <button className="s-btn filled block" onClick={add} disabled={!text.trim()}>Ordenar</button>

      {hacer > 3 && <p className="s-callout small">Tenés {hacer} cosas en "Hacer hoy". Eisenhower funciona si "Hacer" es corto: dejá 3 y pasá el resto a "Agendar".</p>}

      <div className="s-matrix">
        {Q.map((q) => (
          <section key={q} className={'s-quad q-' + q}>
            <div className="s-quad-head"><b>{QUADRANT_LABEL[q].title}</b><small>{QUADRANT_LABEL[q].hint}</small></div>
            {notes.filter((n) => n.quadrant === q).sort(sortQ).map((n) => (
              <button key={n.id} className="s-qitem" onClick={() => setSel(n)}>
                <span className={'s-dot ' + AREA[n.area ?? 'extra'].color} />
                <span>{n.text}{n.due && <small className={'s-due-' + dueLabel(n.due, today()).tone}> · {dueLabel(n.due, today()).text}</small>}</span>
              </button>
            ))}
          </section>
        ))}
      </div>

      {notes.some((n) => n.quadrant === 'idea' || !n.quadrant) && (
        <section className="s-card">
          <div className="s-sec-head"><h2>Ideas en espera</h2><small className="s-muted">no compiten con tu plan</small></div>
          {notes.filter((n) => n.quadrant === 'idea' || !n.quadrant).map((n) => (
            <button key={n.id} className="s-qitem" onClick={() => setSel(n)}><span className={'s-dot ' + AREA[n.area ?? 'extra'].color} />{n.text}</button>
          ))}
        </section>
      )}
      {notes.length === 0 && <p className="s-muted small s-center">Cabeza vacía. Volvé a Hoy y hacé lo que importa.</p>}

      {sel && (
        <Sheet title={sel.text} onClose={() => setSel(null)}>
          <label className="s-label">Cuadrante</label>
          <div className="s-pills">
            {([...Q, 'idea'] as Quadrant[]).map((q) => (
              <button key={q} className={'s-pill' + (sel.quadrant === q ? ' on' : '')} onClick={() => { s.update('snote', sel.id, { quadrant: q }); setSel({ ...sel, quadrant: q }); }}>{QUADRANT_LABEL[q].title}</button>
            ))}
          </div>
          <label className="s-label">Área</label>
          <div className="s-pills">
            {(Object.keys(AREA) as Area[]).map((a) => (
              <button key={a} className={'s-pill' + (sel.area === a ? ' on' : '')} onClick={() => { s.update('snote', sel.id, { area: a }); setSel({ ...sel, area: a }); }}>{AREA[a].label}</button>
            ))}
          </div>
          <label className="s-label">Fecha límite</label>
          <input className="s-input" type="date" value={sel.due ?? ''} onChange={(e) => { const due = e.target.value || undefined; s.update('snote', sel.id, { due }); setSel({ ...sel, due }); }} />
          <button className="s-btn filled block" onClick={() => toToday(sel)}>Pasar a Hoy</button>
          <a className="s-btn tonal block s-center-text" target="_blank" rel="noreferrer" href={gcalLink(sel.text, sel.due ?? addDays(today(), 1), '10:00', 30)}>{sel.due ? 'Recordatorio en Google Calendar' : 'Agendar en Google Calendar'}</a>
          <button className="s-btn text block" onClick={() => { s.update('snote', sel.id, { status: sel.quadrant === 'eliminar' ? 'archived' : 'done' }); setSel(null); toast('Listo. Una cosa menos en la cabeza.'); }}>
            {sel.quadrant === 'eliminar' ? 'Soltar (eliminar)' : 'Ya está hecha'}
          </button>
        </Sheet>
      )}
    </div>
  );
}

function NotifySettings() {
  const [p, setP] = useState<NotifyPrefs>(getNotifyPrefs);
  const [perm, setPerm] = useState(notifySupported() ? Notification.permission : 'denied');
  const up = (x: Partial<NotifyPrefs>) => {
    const n = { ...p, ...x };
    setP(n);
    saveNotifyPrefs(n);
  };
  const enable = async (on: boolean) => {
    if (!on) return up({ enabled: false });
    const r = await requestNotifyPermission();
    setPerm(r);
    if (r === 'granted') {
      up({ enabled: true });
      notifyOnce('test-' + Date.now(), 'Avisos activados', 'Así te vamos a avisar.');
    } else toast('Android bloqueó los avisos. Activalos en Ajustes del teléfono → Apps → Chrome → Notificaciones.');
  };
  return (
    <section className="s-card">
      <div className="s-sec-head"><h2>Avisos</h2><small className="s-muted">{p.enabled && perm === 'granted' ? 'activados' : 'desactivados'}</small></div>
      {!notifySupported() ? (
        <p className="s-muted small">Este navegador no permite avisos. Instalá la app desde Chrome.</p>
      ) : (
        <>
          <label className="s-toggle-row"><input type="checkbox" checked={p.enabled && perm === 'granted'} onChange={(e) => enable(e.target.checked)} /><span><b>Activar avisos</b>: planificar a la mañana, cerrar el día a la noche y {p.beforeMin} min antes de cada tarea con hora.</span></label>
          <div className="s-grid2">
            <div><label className="s-label">Mañana</label><input className="s-input" type="time" value={p.morning} onChange={(e) => up({ morning: e.target.value || DEFAULT_NOTIFY.morning })} /></div>
            <div><label className="s-label">Cierre</label><input className="s-input" type="time" value={p.evening} onChange={(e) => up({ evening: e.target.value || DEFAULT_NOTIFY.evening })} /></div>
          </div>
          <p className="s-muted small">Importante: el teléfono solo deja avisar si la app estuvo abierta hace poco. Para un recordatorio que llegue sí o sí a una hora exacta, usá "Recordatorio en Google Calendar" en la tarea.</p>
        </>
      )}
    </section>
  );
}

function CalendarSettings({ p }: { p: Profile }) {
  const s = useStore();
  const [url, setUrl] = useState(p.icalUrl ?? '');
  const [err, setErr] = useState('');
  const save = () => {
    const u = url.trim();
    if (u && !/^https:\/\/calendar\.google\.com\/calendar\/ical\//.test(u)) return setErr('Tiene que empezar con https://calendar.google.com/calendar/ical/');
    s.update('sprofile', PROFILE_ID, { icalUrl: u || undefined });
    setErr('');
    toast(u ? 'Calendario conectado. Tus eventos aparecen en Hoy.' : 'Calendario desconectado.');
  };
  return (
    <section className="s-card">
      <div className="s-sec-head"><h2>Google Calendar</h2><small className="s-muted">{p.icalUrl ? 'conectado' : 'no conectado'}</small></div>
      <ol className="s-fixes small">
        <li>En la compu, abrí Google Calendar → ⚙ Configuración.</li>
        <li>A la izquierda, tocá tu calendario → "Integrar el calendario".</li>
        <li>Copiá la <b>"Dirección secreta en formato iCal"</b> y pegala acá.</li>
      </ol>
      <input className="s-input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://calendar.google.com/calendar/ical/…/basic.ics" />
      {err && <p className="s-warn small">{err}</p>}
      <button className="s-btn filled block" onClick={save}>Guardar</button>
      <p className="s-muted small">Es solo lectura: la app ve tus eventos pero no los cambia. Para agregar bloques usá "Agregar a Google Calendar" en cada tarea.</p>
    </section>
  );
}

export type { Profile };
