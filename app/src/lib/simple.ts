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

export type Area = 'caja' | 'experimento' | 'salud' | 'social' | 'imagen' | 'extra';
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
}

export interface PlanItem {
  id: string;
  area: Area;
  title: string;
  minutes: number;
  min: string;
  done: boolean;
}

export interface DayPlan extends Base {
  kind: 'splan';
  date: string;
  items: PlanItem[];
  energy?: Energy;
  closed: boolean;
  excuse?: Excuse;
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
  status: 'open' | 'done' | 'archived';
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

  // Días de Roble: máximo 2 secundarias; días libres: máximo 3.
  const all = [...items, ...sec.slice(0, roble ? 2 : 3)];
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
  const areas: Area[] = ['caja', 'experimento', 'salud', 'social', 'imagen'];
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
