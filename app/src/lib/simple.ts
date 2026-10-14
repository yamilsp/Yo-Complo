import type { Base } from './types';
import { addDays, daysBetween, fromISO, weekStart } from './dates';

/**
 * Modo simple. Pocas piezas:
 *  - Perfil (sale del test inicial)
 *  - Plan del día generado por reglas: Caja primero, después 1 por área
 *  - Semana: plata de la semana, 3 resultados y 1 experimento a la vez
 *  - Notas de "vaciar la cabeza" clasificadas con Eisenhower
 * Coach basado en Hábitos Atómicos (4 leyes, regla de 2 minutos, nunca fallar dos veces)
 * y El Efecto Compuesto (pequeñas acciones constantes, medir para ver la tendencia).
 */

export type Area = 'caja' | 'experimento' | 'salud' | 'social' | 'imagen' | 'fijo' | 'extra';
export type Excuse = 'ganas' | 'plata' | 'celular' | 'cansado' | 'manana' | 'investigar' | 'perfecto' | 'imprevisto';
export type Tone = 'duro' | 'firme' | 'datos';
export type Energy = 'bien' | 'normal' | 'bajo';
export type Quadrant = 'hacer' | 'agendar' | 'delegar' | 'eliminar' | 'idea';

export interface Experiment {
  idea: string;
  name: string;
  question: string;
  start: string;
  end: string;
}

export interface Profile extends Base {
  kind: 'sprofile';
  incomeNow: number;
  incomeMin: number;
  incomeDream: number;
  robleDays: number[];
  bestTime: ('manana' | 'tarde' | 'noche')[];
  excuses: Excuse[];
  ideas: string[];
  job: 'si' | 'no' | 'talvez';
  experiment?: Experiment;
  expHistory: { name: string; start: string; end: string; decision: 'seguir' | 'cambiar' | 'cortar' }[];
  social: string;
  socialDay: number;
  footballDay: number | null;
  healthDays: number[];
  imagen: string;
  imagenDay: number;
  tone: Tone;
  /** Meta de ingresos a 3 meses (la del papel: 4 M). */
  incomeTarget?: number;
  /** Tareas recurrentes con día y horario fijo. */
  fixed?: FixedTask[];
  /** Límite de horas de celular de ocio por día. */
  phoneLimit?: number;
  /** Dirección privada iCal de Google Calendar (solo lectura). */
  icalUrl?: string;
}

export interface FixedTask {
  id: string;
  title: string;
  day: number;
  time: string;
  minutes: number;
}

/** Registro de la noche: lo que mueve las metas, en orden de prioridad (plata, relaciones, salud). */
export interface DayLog {
  messages: number;
  focusH: number;
  social: boolean;
  phoneH: number;
  gym: boolean;
  sleepH: number;
}

export interface PlanItem {
  id: string;
  area: Area;
  title: string;
  minutes: number;
  min: string;
  done: boolean;
  time?: string;
  /** Marca la tarea como entregable: pide versión 1, tiempo máximo y a quién mostrarlo. */
  deliverable?: boolean;
  delivId?: string;
}

export interface DayPlan extends Base {
  kind: 'splan';
  date: string;
  items: PlanItem[];
  energy?: Energy;
  closed: boolean;
  excuse?: Excuse;
  log?: DayLog;
  changed?: 'lluvia' | 'mas_trabajo' | 'imprevisto';
}

export interface WeekRec extends Base {
  kind: 'sweek';
  weekStart: string;
  income: number | null;
  results: { text: string; done: boolean }[];
  change?: string;
}

export interface Note extends Base {
  kind: 'snote';
  text: string;
  quadrant?: Quadrant;
  area?: Area;
  status: 'open' | 'done' | 'archived';
  /** Fecha límite real (YYYY-MM-DD). */
  due?: string;
  /** Por qué quedó en ese cuadrante (lo explica la IA). */
  reason?: string;
}

export const planId = (date: string) => 'splan-' + date;
export const weekId = (ws: string) => 'sweek-' + ws;
export const PROFILE_ID = 'sprofile';

export const AREA: Record<Area, { label: string; color: string }> = {
  caja: { label: 'Caja', color: 'green' },
  experimento: { label: 'Ingreso extra', color: 'blue' },
  salud: { label: 'Salud', color: 'orange' },
  social: { label: 'Social', color: 'pink' },
  imagen: { label: 'Imagen', color: 'purple' },
  fijo: { label: 'Fija', color: 'gray' },
  extra: { label: 'Otro', color: 'gray' },
};

export const EXCUSE_LABEL: Record<Excuse, string> = {
  ganas: 'No tengo ganas',
  plata: '¿Realmente voy a ganar plata?',
  celular: 'Celular / redes',
  cansado: 'Estoy cansado',
  manana: 'Mañana arranco',
  investigar: 'Me puse a investigar',
  perfecto: 'No está listo para mostrar',
  imprevisto: 'Imprevisto real',
};

export const IDEAS = ['Canción', 'Apps', 'Libro', 'Curso', 'Videojuego', 'Consultoría'];

/** Cada idea se prueba con una pregunta de mercado concreta, no con meses de desarrollo. */
export const EXPERIMENT_TEMPLATE: Record<string, { name: string; question: string }> = {
  Canción: { name: 'Publicar 1 canción', question: 'Terminarla y publicarla en 7 días. ¿Cuántas personas reales la escuchan y comentan?' },
  Apps: { name: 'App mínima para un problema real', question: 'Mostrarla a 10 personas con ese problema en 7 días. ¿Alguien la usa o pagaría?' },
  Libro: { name: 'Índice + 1 capítulo', question: 'Mostrarlo a 5 lectores posibles en 7 días. ¿Lo comprarían?' },
  Curso: { name: 'Clase piloto', question: 'Ofrecer 1 clase a 10 personas en 7 días. ¿Cuántas se anotan o pagan?' },
  Videojuego: { name: 'Prototipo jugable de 5 minutos', question: 'Que lo prueben 5 personas en 7 días. ¿Quieren seguir jugando?' },
  Consultoría: { name: 'Oferta de consultoría', question: 'Ofrecerla a 10 conocidos/pymes en 7 días. ¿Alguien agenda una reunión?' },
};

const ROBLE_ACTIONS = [
  'Pedir 3 referidos a clientes actuales por WhatsApp',
  'Mandar 10 mensajes a administradores de consorcios e inmobiliarias',
  'Publicar 2 fotos antes/después en Instagram y Google Maps',
  'Llamar a los presupuestos enviados que no respondieron',
  'Ofrecer mantenimiento mensual a 5 clientes de trabajos puntuales',
  'Recorrer 1 barrio con casas con jardín y dejar volantes',
  'Contactar 3 viveros o paisajistas para que te deriven trabajos',
];

const JOB_ACTIONS = [
  'Postular a 5 avisos (LinkedIn, Bumeran, Computrabajo)',
  'Escribir a 3 contactos pidiendo referencias laborales',
  'Mejorar CV y LinkedIn: máximo 1 h, después postulá',
];

const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
export const dayName = (d: number) => DAYS[d];

function dayIndex(date: string): number {
  return Math.abs(daysBetween('2026-01-01', date));
}

let seq = 0;
const iid = (date: string) => `${date}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

/** Plan del día por reglas: caja primero; secundarias de a una por área. */
export function generatePlan(p: Profile, date: string): PlanItem[] {
  const dow = fromISO(date).getDay();
  const n = dayIndex(date);
  const roble = p.robleDays.includes(dow);
  const items: Omit<PlanItem, 'id' | 'done'>[] = [];
  const robleAction = ROBLE_ACTIONS[n % ROBLE_ACTIONS.length];

  if (dow === 0 && !roble) {
    items.push({ area: 'caja', title: 'Revisión semanal: plata de la semana y 3 resultados', minutes: 15, min: 'Cargar la plata de la semana' });
  } else if (roble) {
    items.push({ area: 'caja', title: 'Jornada en El Roble', minutes: 0, min: 'Cumplir la jornada' });
    items.push({ area: 'caja', title: 'Clientes Roble: ' + robleAction, minutes: 30, min: '1 mensaje a un cliente posible' });
  } else {
    items.push({ area: 'caja', title: 'Clientes Roble: ' + robleAction, minutes: 120, min: '15 min: 3 mensajes' });
    if (p.job !== 'no' && n % 2 === 0) items.push({ area: 'caja', title: 'Empleo: ' + JOB_ACTIONS[(n / 2) % JOB_ACTIONS.length], minutes: 90, min: 'Postular a 1 aviso' });
    else items.push({ area: 'caja', title: 'Seguimiento: presupuestos, cobros y agenda de la semana', minutes: 60, min: 'Responder 1 presupuesto pendiente' });
  }

  const sec: Omit<PlanItem, 'id' | 'done'>[] = [];
  if (p.experiment && !roble && dow !== 0 && date <= p.experiment.end)
    sec.push({ area: 'experimento', title: `${p.experiment.name}`, minutes: 90, min: '25 minutos, sin investigar: producir' });
  if (p.footballDay === dow) sec.push({ area: 'salud', title: 'Fútbol', minutes: 90, min: 'Ir' });
  else if (p.healthDays.includes(dow)) sec.push({ area: 'salud', title: 'Caminar o correr 30 min', minutes: 30, min: '10 minutos caminando' });
  if (p.socialDay === dow && p.social) sec.push({ area: 'social', title: p.social, minutes: 60, min: 'Escribirle a 1 persona para verse' });
  if (p.imagenDay === dow && p.imagen) sec.push({ area: 'imagen', title: p.imagen, minutes: 45, min: '10 minutos' });

  // Días de Roble: máximo 2 secundarias; días libres: máximo 3. Las fijas van aparte.
  const fixed = (p.fixed ?? []).filter((f) => f.day === dow).sort((a, b) => a.time.localeCompare(b.time))
    .map((f) => ({ area: 'fijo' as Area, title: f.title, minutes: f.minutes, min: 'Versión corta: 15 minutos', time: f.time }));
  const all = [...items, ...sec.slice(0, roble ? 2 : 3), ...fixed];
  return all.map((x) => ({ ...x, id: iid(date), done: false }));
}

export function weeklyNeeded(p: Profile): number {
  return Math.round(p.incomeMin / 4.33);
}

export function defaultResults(p: Profile): { text: string; done: boolean }[] {
  const r = [
    { text: 'Conseguir 2 clientes nuevos o 1 de mantenimiento mensual para El Roble', done: false },
    { text: `Facturar $ ${weeklyNeeded(p).toLocaleString('es-AR')} en la semana`, done: false },
  ];
  if (p.experiment) r.push({ text: `Experimento: ${p.experiment.question.split('.')[0]}`, done: false });
  else if (p.job !== 'no') r.push({ text: 'Postular a 10 empleos', done: false });
  return r;
}

/** Clasificación Eisenhower con dos preguntas. */
export function quadrant(important: boolean, urgent: boolean): Quadrant {
  if (important && urgent) return 'hacer';
  if (important) return 'agendar';
  if (urgent) return 'delegar';
  return 'eliminar';
}

export const QUADRANT_LABEL: Record<Quadrant, { title: string; hint: string }> = {
  hacer: { title: 'Hacer hoy', hint: 'Importante y urgente' },
  agendar: { title: 'Agendar', hint: 'Importante, no urgente: ponele día' },
  delegar: { title: 'Delegar o resolver rápido', hint: 'Urgente pero no te acerca a tus objetivos' },
  eliminar: { title: 'Eliminar', hint: 'Ni importante ni urgente: soltalo' },
  idea: { title: 'Ideas en espera', hint: 'No compiten con tu plan. Se revisan el domingo' },
};

export interface Insight {
  id: string;
  level: 1 | 2 | 3;
  title: string;
  evidence: string;
  fixes: string[];
}

const AREA_FIXES: Record<Area, string[]> = {
  caja: [
    'Hacelo obvio: "A las 9:00, en la mesa, con el mate, mando 3 mensajes". Queda primero en tu día, antes de abrir redes.',
    'Hacelo fácil: regla de 2 minutos. El mínimo es 1 mensaje; después decidís si seguís.',
    'Preparalo la noche anterior: lista de 10 contactos y mensaje modelo copiado.',
    'Hacelo satisfactorio: cada contacto suma a la cadena. Nunca falles dos días seguidos.',
  ],
  experimento: [
    'Bloque fijo de 90 min en tu mejor horario, siempre el mismo día y hora.',
    'Producir antes que investigar: los primeros 25 min solo se crea, nada de buscar.',
    'Mostrá algo feo a 1 persona hoy. Lo que no se muestra, no existe.',
  ],
  salud: [
    'Ropa y zapatillas preparadas la noche anterior, a la vista.',
    'Apilá el hábito: "Después del café, salgo a caminar 10 minutos".',
    'El mínimo cuenta: 10 minutos mantienen la identidad de "persona que se mueve".',
  ],
  social: [
    'Decidí ahora el lugar y el horario, y escribile hoy a 1 persona.',
    'Sumate a algo con fecha fija (grupo de running, fútbol, idiomas): la agenda decide por vos.',
    'Mínimo: 1 mensaje para proponer un plan concreto.',
  ],
  fijo: ['Hacela en su día y horario, aunque sea la versión corta. Lo que tiene lugar fijo no compite con lo demás.'],
  imagen: [
    'Una sola mejora por semana, agendada (corte, ropa, postura).',
    'Dejá preparada la ropa del día siguiente.',
  ],
  extra: ['Definí la acción como verbo + objeto + cantidad, de 30 minutos o menos.'],
};

export const EXCUSE_FIX: Record<Excuse, string[]> = {
  ganas: [
    'Las ganas aparecen después de empezar, no antes. Hacé el mínimo de 2 minutos sin negociar.',
    'Si a los 2 minutos querés cortar, cortás. Casi nunca pasa.',
    'Juntalo con algo que te guste: tu música o el mate, solo durante el bloque.',
  ],
  plata: [
    'Esa pregunta se responde con datos, no pensando. Medí 20 contactos en la semana y contá cuántos piden presupuesto.',
    'Efecto compuesto: 1 cliente de mantenimiento por semana son 12 en 3 meses. Mirá la tendencia de 4 semanas, no el día.',
    'Si después de 2 semanas medidas no hay respuesta, se cambia el canal o la oferta, no el objetivo.',
  ],
  celular: [
    'Diseño del entorno: el celular en otra habitación durante el bloque.',
    'Sacá las apps de redes de la pantalla de inicio.',
  ],
  cansado: [
    'Lo difícil va a la mañana, que es tu mejor horario. A la tarde, lo mecánico.',
    'Cuando estás cansado, el mínimo igual cuenta. No faltes dos días seguidos.',
  ],
  manana: [
    '"Mañana" es la excusa que más cuesta. Hacé ahora la versión de 2 minutos.',
    'Nunca falles dos veces: fallar un día es un accidente, dos es el inicio de un hábito nuevo.',
  ],
  investigar: [
    'Límite: 30 minutos de investigación y después tenés que mostrarle algo a una persona.',
    'Investigar se siente productivo, pero no te acerca a cobrar.',
  ],
  perfecto: [
    'Mostrá la versión 1, aunque sea fea, a 1 persona hoy.',
    'El feedback real vale más que otra semana puliendo.',
  ],
  imprevisto: ['Los imprevistos pasan. Si se repiten, no son imprevistos: reservá margen en el plan.'],
};

/** Coach del modo simple. Solo habla con datos: necesita días registrados. */
export function simpleCoach(p: Profile, plans: DayPlan[], weeks: WeekRec[], today: string): Insight[] {
  const out: Insight[] = [];
  const from = addDays(today, -7);
  const recent = plans.filter((x) => x.date >= from && x.date < today).sort((a, b) => a.date.localeCompare(b.date));
  const duro = p.tone === 'duro';

  // Áreas que vienen fallando.
  const areas: Area[] = ['caja', 'experimento', 'salud', 'social', 'imagen', 'fijo'];
  for (const a of areas) {
    const its = recent.flatMap((d) => d.items.filter((i) => i.area === a));
    if (its.length < 3) continue;
    const ok = its.filter((i) => i.done).length;
    if (ok / its.length < 0.6) {
      const label = a === 'caja' ? 'lo que genera caja (clientes, cobros)' : AREA[a].label.toLowerCase();
      out.push({
        id: 'area_' + a,
        level: a === 'caja' ? 3 : 2,
        title: `Venís fallando en ${label}`,
        evidence: `Cumpliste ${ok} de ${its.length} en los últimos 7 días.`,
        fixes: AREA_FIXES[a],
      });
    }
  }

  // Excusa repetida.
  const exc = new Map<Excuse, number>();
  plans.filter((x) => x.date >= addDays(today, -14) && x.excuse).forEach((x) => exc.set(x.excuse!, (exc.get(x.excuse!) ?? 0) + 1));
  const top = [...exc.entries()].sort((a, b) => b[1] - a[1])[0];
  if (top && top[1] >= 2) {
    out.push({
      id: 'excuse_' + top[0],
      level: top[1] >= 4 ? 3 : 2,
      title: duro ? `Tu excusa favorita: "${EXCUSE_LABEL[top[0]]}"` : `Patrón: "${EXCUSE_LABEL[top[0]]}"`,
      evidence: `La usaste ${top[1]} veces en 14 días.`,
      fixes: EXCUSE_FIX[top[0]],
    });
  }

  // Nunca fallar dos veces (caja).
  const y1 = plans.find((x) => x.date === addDays(today, -1));
  const y2 = plans.find((x) => x.date === addDays(today, -2));
  const cajaMiss = (d?: DayPlan) => !!d && d.items.some((i) => i.area === 'caja' && i.minutes > 0 && !i.done && !/^Jornada/.test(i.title));
  if (cajaMiss(y1) && cajaMiss(y2)) {
    out.push({
      id: 'twice',
      level: 3,
      title: 'Dos días seguidos sin buscar clientes',
      evidence: 'Fallar un día es un accidente; dos es el comienzo de un hábito nuevo.',
      fixes: ['Hoy, antes que cualquier otra cosa, hacé el mínimo: 1 mensaje a un cliente posible.'],
    });
  }

  // Plata: brecha contra el mínimo.
  const need = weeklyNeeded(p);
  const last = weeks.filter((w) => w.income != null && w.weekStart < weekStart(today)).sort((a, b) => b.weekStart.localeCompare(a.weekStart)).slice(0, 4);
  if (last.length >= 2) {
    const avg = last.reduce((a, w) => a + (w.income ?? 0), 0) / last.length;
    if (avg < need) {
      out.push({
        id: 'gap',
        level: 2,
        title: duro ? 'La plata no alcanza y el plan tiene que reflejarlo' : 'Brecha de ingresos',
        evidence: `Promedio de ${last.length} semanas: $ ${Math.round(avg).toLocaleString('es-AR')} por semana. Para tu mínimo necesitás $ ${need.toLocaleString('es-AR')}.`,
        fixes: [
          'Hasta cerrar la brecha, los días libres empiezan con 2 h de clientes para El Roble. Sin excepciones.',
          'Priorizá contratos de mantenimiento mensual: ingreso recurrente que se acumula.',
          p.job !== 'no' ? 'Sostené las postulaciones a empleo: es la vía más rápida a un piso de ingreso.' : 'Revisá tus precios: ¿cuándo fue tu último aumento?',
        ],
      });
    }
  }

  // Saltar de experimento.
  const switched = p.expHistory.filter((h) => h.decision === 'cambiar' && daysBetween(h.end, today) <= 30).length;
  if (switched >= 2) {
    out.push({
      id: 'hopping',
      level: 2,
      title: 'Cambiás de idea antes de tener datos',
      evidence: `${switched} experimentos cambiados en 30 días.`,
      fixes: ['El próximo se termina aunque sea feo, y se decide con la respuesta de personas reales.'],
    });
  }
  if (p.experiment && p.experiment.end < today) {
    out.push({
      id: 'exp_due',
      level: 2,
      title: `Experimento vencido: ${p.experiment.name}`,
      evidence: `Pregunta: ${p.experiment.question}`,
      fixes: ['Decidí en Semana: seguir 7 días más, cambiar o cortar. Con lo que pasó, no con lo que imaginás.'],
    });
  }
  return out.sort((a, b) => b.level - a.level);
}

/** Días seguidos cumpliendo al menos una tarea de caja (sin contar hoy si no terminó). */
export function cajaStreak(plans: DayPlan[], today: string): number {
  const by = new Map(plans.map((x) => [x.date, x]));
  let n = 0;
  const ok = (d?: DayPlan) => !!d && d.items.some((i) => i.area === 'caja' && i.done);
  let d = ok(by.get(today)) ? today : addDays(today, -1);
  while (ok(by.get(d))) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

/* ------------------------------------------------------------------ */
/* Días fijos, registro diario, cambios de plan y asistente Eisenhower */
/* ------------------------------------------------------------------ */

/** Propuesta inicial de tareas fijas. El usuario la cambia en el test. */
export const DEFAULT_FIXED: FixedTask[] = [
  { id: 'fx-mkt', title: 'Armar calendario de marketing de la semana', day: 1, time: '09:00', minutes: 60 },
  { id: 'fx-fin', title: 'Finanzas personales: ingresos, gastos y ahorro', day: 0, time: '18:00', minutes: 30 },
  { id: 'fx-viandas', title: 'Compras y viandas de la semana', day: 0, time: '11:00', minutes: 120 },
  { id: 'fx-casa', title: 'Casa: limpieza y reparaciones', day: 6, time: '10:00', minutes: 90 },
  { id: 'fx-auto', title: 'Limpiar el auto', day: 6, time: '12:00', minutes: 45 },
  { id: 'fx-ropa', title: 'Lavar ropa', day: 3, time: '20:00', minutes: 20 },
];

export function withDefaults(p: Profile): Profile {
  return { ...p, incomeTarget: p.incomeTarget ?? 4_000_000, fixed: p.fixed ?? DEFAULT_FIXED, phoneLimit: p.phoneLimit ?? 1 };
}

export const EMPTY_LOG: DayLog = { messages: 0, focusH: 0, social: false, phoneH: 0, gym: false, sleepH: 0 };

export type ChangeReason = NonNullable<DayPlan['changed']>;

/**
 * "Hoy cambió el día": reacomoda el plan sin rearmar todo.
 *  - lluvia: no hay jornada afuera → esas horas van a clientes y a tareas fijas.
 *  - más trabajo: solo caja mínima y fijas cortas; secundarias afuera.
 *  - imprevisto: todo a versión mínima, máximo 3 cosas.
 */
export function replan(items: PlanItem[], reason: ChangeReason, date: string): PlanItem[] {
  const pending = items.filter((i) => !i.done);
  const done = items.filter((i) => i.done);
  if (reason === 'lluvia') {
    const out = pending.filter((i) => !/^Jornada/.test(i.title));
    if (!out.some((i) => i.area === 'caja' && i.minutes >= 90))
      out.unshift({ id: iid(date), area: 'caja', title: 'Día de lluvia: 2 h de clientes (mensajes, presupuestos, seguimiento)', minutes: 120, min: '15 min: 3 mensajes', done: false });
    out.push({ id: iid(date), area: 'caja', title: 'Reprogramar con los clientes los trabajos de hoy', minutes: 20, min: 'Avisar al primer cliente', done: false });
    return [...done, ...out];
  }
  if (reason === 'mas_trabajo') {
    // Se conserva qué es cada tarea; solo baja a su versión corta (el mínimo se ve en "¿Qué hago ahora?").
    return [...done, ...pending.filter((i) => i.area === 'caja' || i.area === 'fijo').map((i) => (/^Jornada/.test(i.title) ? i : { ...i, minutes: Math.min(i.minutes, 15) }))];
  }
  return [...done, ...pending.slice(0, 3).map((i) => ({ ...i, minutes: Math.min(i.minutes, 15) }))];
}

/* Asistente: separa la lista, sugiere área y cuadrante; el usuario corrige con un toque. */

const KW: [Area, RegExp][] = [
  ['caja', /client|presupuest|cobr|factur|vend|venta|mensaj|prospect|roble|marketing|publicar|precio|propuesta|llamar a|seguimiento|empleo|cv|postul|consultor|inmobiliari|consorcio/i],
  ['social', /amig|evento|cumple|salida|grupo|club|reuni[oó]n|conocer|familia|novia|cita|after|asado/i],
  ['salud', /gym|gimnas|m[eé]dic|turno|correr|caminar|vianda|comida|dormir|dentista|f[uú]tbol|entren/i],
  ['experimento', /canci[oó]n|app|libro|curso|videojuego|juego/i],
  ['fijo', /limpi|lavar|ropa sucia|reparar|arregl|super|compras|banco|tr[aá]mite|pagar|factura de|impuesto/i],
  ['imagen', /ropa|corte|pelo|barba|zapatill|outfit/i],
];
const URGENT = /\bhoy\b|ma[nñ]ana|urgente|vence|antes de|ya\b|\d{1,2}\s?(hs|h)\b/i;

export function splitTasks(text: string): string[] {
  return text
    .split(/\n|;|•/)
    .map((t) => t.replace(/^\s*([-*·]|\d+[.)])\s*/, '').trim())
    .filter((t) => t.length > 1);
}

export function guessArea(text: string): Area {
  for (const [a, re] of KW) if (re.test(text)) return a;
  return 'extra';
}

/** Prioridad por área según tus metas: plata (caja e ingreso extra), después relaciones, después salud. */
export const AREA_RANK: Record<Area, number> = { caja: 0, experimento: 1, social: 2, salud: 3, fijo: 4, imagen: 5, extra: 6 };

export function suggestQuadrant(text: string, area: Area): Quadrant {
  if (area === 'experimento') return 'idea';
  // Tareas de la casa: importantes pero se agendan en su día fijo, salvo que sean urgentes.
  const important = area === 'caja' || area === 'social' || area === 'salud' || area === 'fijo';
  return quadrant(important, URGENT.test(text));
}

/* Hábitos: menos fricción para los buenos, más para los malos (Hábitos Atómicos, 3ª ley invertida). */
export const PHONE_FRICTION = [
  'De noche el celular carga fuera de la pieza. Despertador aparte.',
  'Sacá de la pantalla de inicio las apps de redes y de video: que abrirlas cueste 3 pasos.',
  'Activá la escala de grises en Bienestar digital; la pantalla engancha mucho menos.',
  'Poné límites de app en Bienestar digital (30 min para redes) y un modo concentración en tus horas de trabajo.',
  'Durante el bloque de trabajo el celular queda en otra habitación, en silencio.',
];

export const GOOD_HABIT_EASIER: Record<'messages' | 'focus' | 'gym' | 'social', string[]> = {
  messages: [
    'Dejá armada la noche anterior la lista de 10 contactos y un mensaje modelo para copiar y pegar.',
    'Apilalo: "Después del primer mate, mando 3 mensajes". Antes de abrir redes.',
  ],
  focus: [
    'Elegí la franja de mañana a la mañana, según el clima y el trabajo, y cargala en el calendario.',
    'Empezá con 25 minutos y la versión mínima. Arrancar es lo que cuesta.',
  ],
  gym: ['Bolso del gym armado y en la puerta.', 'Mismo día y hora fija: que no haya que decidir.'],
  social: [
    'Buscá el evento de la semana el domingo y anotalo con horario. Un evento nuevo por semana.',
    'Ir a lo mismo todas las semanas (grupo, club) baja la fricción: no hay que decidir cada vez.',
  ],
};

/** Coach del registro diario: compara con tus metas y propone cómo facilitarlas. */
export function logCoach(p: Profile, plans: DayPlan[], today: string): Insight[] {
  const out: Insight[] = [];
  const from = addDays(today, -7);
  const logs = plans.filter((x) => x.date >= from && x.date < today && x.log).map((x) => x.log!);
  if (logs.length < 3) return out;
  const avg = (f: (l: DayLog) => number) => logs.reduce((a, l) => a + f(l), 0) / logs.length;
  const limit = p.phoneLimit ?? 1;
  const phone = avg((l) => l.phoneH);
  const focus = avg((l) => l.focusH);
  const msgs = logs.reduce((a, l) => a + l.messages, 0);
  if (phone > limit) {
    out.push({
      id: 'phone', level: phone >= limit * 3 || phone >= 3 ? 3 : 2,
      title: 'El celular te está comiendo el día',
      evidence: `Promedio ${phone.toFixed(1).replace('.', ',')} h/día de ocio (tu límite: ${limit} h). Trabajo enfocado: ${focus.toFixed(1).replace('.', ',')} h/día.`,
      fixes: PHONE_FRICTION.slice(0, 4),
    });
  }
  if (msgs < logs.length * 3) {
    out.push({
      id: 'messages', level: 3,
      title: 'Pocos mensajes a clientes',
      evidence: `${msgs} mensajes en ${logs.length} días registrados. Sin mensajes no hay presupuestos.`,
      fixes: GOOD_HABIT_EASIER.messages,
    });
  }
  if (focus < 2) {
    out.push({ id: 'focus', level: 2, title: 'Poco trabajo enfocado', evidence: `Promedio ${focus.toFixed(1).replace('.', ',')} h/día.`, fixes: GOOD_HABIT_EASIER.focus });
  }
  const ws = weekStart(today);
  const socialWeek = plans.filter((x) => x.date >= ws && x.log?.social).length;
  if (fromISO(today).getDay() >= 4 && socialWeek === 0) {
    out.push({ id: 'social', level: 1, title: 'Todavía no fuiste a ningún evento esta semana', evidence: 'Meta: 1 evento o actividad nueva por semana.', fixes: GOOD_HABIT_EASIER.social });
  }
  return out;
}

/* Google Calendar */

const pad = (n: number) => String(n).padStart(2, '0');
function gcalStamp(date: string, time: string, addMin = 0): string {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const t = new Date(y, m - 1, d, hh, mm + addMin);
  return `${t.getFullYear()}${pad(t.getMonth() + 1)}${pad(t.getDate())}T${pad(t.getHours())}${pad(t.getMinutes())}00`;
}

/** Link que abre Google Calendar con el evento precargado. No requiere permisos. */
export function gcalLink(title: string, date: string, time: string, minutes: number): string {
  const q = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${gcalStamp(date, time)}/${gcalStamp(date, time, Math.max(15, minutes))}`,
    ctz: 'America/Argentina/Buenos_Aires',
    details: 'Creado desde Yo Cumplo',
  });
  return 'https://calendar.google.com/calendar/render?' + q.toString();
}

export interface CalEvent {
  title: string;
  start: string; // HH:MM o '' si es de día completo
  end: string;
  allDay: boolean;
}

const DOW = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

/** Lee un feed iCal y devuelve los eventos de `date` (incluye recurrencias diarias/semanales simples). */
export function eventsForDate(ics: string, date: string): CalEvent[] {
  const lines = ics.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const out: CalEvent[] = [];
  let ev: Record<string, string> | null = null;
  const exdates: string[] = [];
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { ev = {}; exdates.length = 0; continue; }
    if (line === 'END:VEVENT' && ev) {
      const e = parseEvent(ev, [...exdates], date);
      if (e) out.push(e);
      ev = null;
      continue;
    }
    if (!ev) continue;
    const i = line.indexOf(':');
    if (i < 0) continue;
    const key = line.slice(0, i);
    const val = line.slice(i + 1);
    const name = key.split(';')[0];
    if (name === 'EXDATE') exdates.push(...val.split(','));
    else ev[name] = name === 'DTSTART' || name === 'DTEND' ? key + ':' + val : val;
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}

function parseDT(raw: string): { date: string; time: string; allDay: boolean } {
  const val = raw.slice(raw.lastIndexOf(':') + 1);
  const allDay = /VALUE=DATE(?!-)/.test(raw) || /^\d{8}$/.test(val);
  const y = +val.slice(0, 4), m = +val.slice(4, 6), d = +val.slice(6, 8);
  if (allDay) return { date: `${y}-${pad(m)}-${pad(d)}`, time: '', allDay };
  const hh = +val.slice(9, 11), mi = +val.slice(11, 13);
  const dt = val.endsWith('Z') ? new Date(Date.UTC(y, m - 1, d, hh, mi)) : new Date(y, m - 1, d, hh, mi);
  return { date: `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`, time: `${pad(dt.getHours())}:${pad(dt.getMinutes())}`, allDay };
}

function parseEvent(ev: Record<string, string>, exdates: string[], date: string): CalEvent | null {
  if (!ev.DTSTART || ev.STATUS === 'CANCELLED') return null;
  const st = parseDT(ev.DTSTART);
  const en = ev.DTEND ? parseDT(ev.DTEND) : st;
  const title = (ev.SUMMARY ?? 'Evento').replace(/\\,/g, ',').replace(/\\n/g, ' ');
  const res = { title, start: st.time, end: en.time, allDay: st.allDay };
  if (exdates.some((x) => x.startsWith(date.replace(/-/g, '')))) return null;
  if (!ev.RRULE) return st.date === date || (st.allDay && st.date <= date && en.date > date) ? res : null;
  if (date < st.date) return null;
  const r = Object.fromEntries(ev.RRULE.split(';').map((kv) => kv.split('=')));
  if (r.UNTIL && date.replace(/-/g, '') > r.UNTIL.slice(0, 8)) return null;
  const interval = Number(r.INTERVAL ?? 1);
  const diff = daysBetween(st.date, date);
  if (r.FREQ === 'DAILY') return diff % interval === 0 ? res : null;
  if (r.FREQ === 'WEEKLY') {
    const days = r.BYDAY ? r.BYDAY.split(',') : [DOW[fromISO(st.date).getDay()]];
    const weeks = Math.floor(daysBetween(weekStart(st.date), weekStart(date)) / 7);
    return days.includes(DOW[fromISO(date).getDay()]) && weeks % interval === 0 ? res : null;
  }
  if (r.FREQ === 'MONTHLY' && !r.BYDAY) return date.slice(8) === st.date.slice(8) ? res : null;
  if (r.FREQ === 'YEARLY') return date.slice(5) === st.date.slice(5) ? res : null;
  return null;
}

/* ------------------------------------------------------------------ */
/* Versión 1 con entrega + Mostrar antes de pulir                      */
/* ------------------------------------------------------------------ */

/**
 * Un entregable: algo que se termina y se muestra. Se define "suficientemente bueno"
 * y un tiempo máximo antes de empezar; al agotarse, se entrega como está.
 * Se mide cuántas personas lo vieron, no cuántas horas llevó.
 */
export interface Deliverable extends Base {
  kind: 'sdeliv';
  title: string;
  good: string;
  maxMin: number;
  audience: string;
  showBy: string;
  spentMin: number;
  graceUsed: boolean;
  status: 'open' | 'shipped' | 'dropped';
  seen: number;
  v2?: string;
  shippedAt?: string;
}

export const FOCUS_BLOCK_MIN = 50;
export const GRACE_MIN = 25;

export function needsDeliverable(it: PlanItem): boolean {
  return !!it.deliverable || it.area === 'experimento';
}

export function delivState(d: Deliverable, today: string): 'ok' | 'time_up' | 'late' {
  if (d.spentMin >= d.maxMin + (d.graceUsed ? GRACE_MIN : 0)) return 'time_up';
  if (d.showBy < today) return 'late';
  return 'ok';
}

/** El coach del perfeccionismo: horas sin que nadie lo vea, entregas vencidas, tiempo agotado. */
export function delivCoach(delivs: Deliverable[], today: string): Insight[] {
  const out: Insight[] = [];
  for (const d of delivs.filter((x) => x.status === 'open')) {
    const st = delivState(d, today);
    const h = (d.spentMin / 60).toFixed(1).replace('.', ',');
    if (st === 'time_up') {
      out.push({
        id: 'deliv_time_' + d.id, level: 3,
        title: `Se terminó el tiempo de "${d.title}"`,
        evidence: `Le dedicaste ${h} h de ${(d.maxMin / 60).toFixed(1).replace('.', ',')} h previstas.`,
        fixes: [`Entregalo como está: mostrásela hoy a ${d.audience || '3 personas'}.`, 'Anotá qué mejorarías en una versión 2. Lo perfecto llega iterando con respuestas reales, no puliendo solo.'],
      });
    } else if (d.spentMin >= 180 && d.seen === 0) {
      out.push({
        id: 'deliv_unseen_' + d.id, level: 3,
        title: `Llevás ${h} h en "${d.title}" y nadie lo vio`,
        evidence: `Tenías que mostrarlo a ${d.audience || 'alguien'} antes del ${d.showBy}.`,
        fixes: ['Hoy, antes de seguir: mostrá lo que tenés a 3 personas y preguntá qué les sirve.', 'Lo que no se muestra no existe para el mercado.'],
      });
    } else if (st === 'late') {
      out.push({
        id: 'deliv_late_' + d.id, level: 2,
        title: `"${d.title}" tenía que mostrarse el ${d.showBy}`,
        evidence: d.spentMin ? `Llevás ${h} h.` : 'Todavía no empezaste.',
        fixes: ['Mostrá la versión que tengas hoy, aunque sea fea.', 'Si ya no te importa, descartala: arrastrarla también cuesta.'],
      });
    }
  }
  const shipped = delivs.filter((x) => x.status === 'shipped' && x.shippedAt && daysBetween(x.shippedAt, today) <= 30);
  const unseen = shipped.filter((x) => x.seen === 0);
  if (shipped.length >= 2 && unseen.length / shipped.length >= 0.5) {
    out.push({
      id: 'deliv_noaudience', level: 2,
      title: 'Terminás cosas que no ve nadie',
      evidence: `${unseen.length} de ${shipped.length} entregas del último mes las vieron 0 personas.`,
      fixes: ['Antes de empezar el próximo, conseguí 3 personas que quieran verlo (mensaje, grupo, cliente).', 'Elegí proyectos donde ya sabés quién lo va a usar.'],
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Fechas límite                                                        */
/* ------------------------------------------------------------------ */

const DOW_ES: [RegExp, number][] = [
  [/\bdomingo\b/i, 0], [/\blunes\b/i, 1], [/\bmartes\b/i, 2], [/\bmi[eé]rcoles\b/i, 3],
  [/\bjueves\b/i, 4], [/\bviernes\b/i, 5], [/\bs[aá]bado\b/i, 6],
];

/** Detecta una fecha límite escrita en la tarea: "hoy", "mañana", "el viernes", "15/10". */
export function guessDue(text: string, today: string): string | undefined {
  if (/\bhoy\b/i.test(text)) return today;
  if (/\bpasado ma[nñ]ana\b/i.test(text)) return addDays(today, 2);
  if (/\bma[nñ]ana\b/i.test(text)) return addDays(today, 1);
  const m = text.match(/\b(\d{1,2})\/(\d{1,2})\b/);
  if (m) {
    const y = Number(today.slice(0, 4));
    const cand = `${y}-${String(+m[2]).padStart(2, '0')}-${String(+m[1]).padStart(2, '0')}`;
    if (+m[2] >= 1 && +m[2] <= 12 && +m[1] >= 1 && +m[1] <= 31) return cand < today ? `${y + 1}${cand.slice(4)}` : cand;
  }
  for (const [re, dow] of DOW_ES) {
    if (re.test(text)) {
      const diff = (dow - fromISO(today).getDay() + 7) % 7;
      return addDays(today, diff === 0 ? 7 : diff);
    }
  }
  return undefined;
}

/** Con fecha límite en 2 días o menos, lo importante pasa a "Hacer hoy". */
export function quadrantWithDue(q: Quadrant, due: string | undefined, today: string): Quadrant {
  if (!due || q === 'idea' || q === 'eliminar') return q;
  const soon = daysBetween(today, due) <= 2;
  if (soon && q === 'agendar') return 'hacer';
  return q;
}

export function dueLabel(due: string, today: string): { text: string; tone: 'late' | 'soon' | 'ok' } {
  const d = daysBetween(today, due);
  if (d < 0) return { text: `venció hace ${-d} d`, tone: 'late' };
  if (d === 0) return { text: 'vence hoy', tone: 'soon' };
  if (d === 1) return { text: 'vence mañana', tone: 'soon' };
  return { text: `vence en ${d} d`, tone: d <= 3 ? 'soon' : 'ok' };
}

export function dueCoach(notes: Note[], today: string): Insight[] {
  const late = notes.filter((n) => n.status === 'open' && n.due && n.due < today && n.quadrant !== 'eliminar');
  if (!late.length) return [];
  return [{
    id: 'due_late', level: 2,
    title: `${late.length === 1 ? 'Una fecha límite vencida' : late.length + ' fechas límite vencidas'}`,
    evidence: late.slice(0, 3).map((n) => n.text).join(' · '),
    fixes: ['Decidí hoy cada una: hacerla (pasala a Hoy), reprogramarla con fecha nueva o soltarla.', 'Una fecha vencida que se arrastra genera ruido mental todos los días.'],
  }];
}
