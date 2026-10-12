import type { Store } from './store';
import { addDays, pretty, today, weekStart } from './dates';
import { AREA, EXCUSE_LABEL, QUADRANT_LABEL, dayName, logCoach, planId, simpleCoach, weekId, weeklyNeeded, type Area, type Profile, type Quadrant } from './simple';

export interface AssistantAction {
  kind: 'hoy' | 'ordenar';
  title: string;
  area: Area;
  quadrant: Quadrant;
  minutes: number;
  minimo: string;
}

export interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
  actions?: AssistantAction[];
  applied?: boolean[];
}

const money = (n: number) => '$ ' + Math.round(n).toLocaleString('es-AR');

/** Resumen de tus datos que recibe el asistente. Solo hechos registrados, nada inventado. */
export function buildContext(s: Store, p: Profile): string {
  const d = today();
  const plan = s.get('splan', planId(d));
  const week = s.get('sweek', weekId(weekStart(d)));
  const plans = s.all('splan');
  const lines: string[] = [];
  lines.push(`Hoy: ${pretty(d)} (${d}).`);
  lines.push(`Ingresos: hoy ~${money(p.incomeNow)}/mes; mínimo ${money(p.incomeMin)}/mes; meta 3 meses ${money(p.incomeTarget ?? 4_000_000)}/mes. Necesita ${money(weeklyNeeded(p))}/semana para el mínimo.`);
  lines.push(`Trabaja en El Roble (jardinería) los días: ${p.robleDays.map(dayName).join(', ') || 'sin definir'}. Busca empleo: ${p.job}.`);
  lines.push(`Excusas frecuentes: ${p.excuses.map((e) => EXCUSE_LABEL[e]).join(', ')}. Límite de celular de ocio: ${p.phoneLimit ?? 1} h/día.`);
  if (p.experiment) lines.push(`Experimento activo: ${p.experiment.name} (${p.experiment.question}) hasta ${p.experiment.end}.`);
  lines.push(`Ideas de ingreso extra en espera: ${p.ideas.join(', ')}.`);
  if (p.fixed?.length) lines.push(`Tareas fijas: ${p.fixed.map((f) => `${f.title} (${dayName(f.day)} ${f.time})`).join('; ')}.`);
  if (plan) {
    lines.push(`Plan de hoy${plan.energy ? ` (energía: ${plan.energy})` : ''}:`);
    for (const i of plan.items) lines.push(`- [${i.done ? 'x' : ' '}] ${i.time ? i.time + ' ' : ''}${i.title} (${AREA[i.area].label}, ${i.minutes} min)`);
  }
  if (week) {
    lines.push(`Semana: plata registrada ${week.income == null ? 'sin cargar' : money(week.income)}. Resultados: ${week.results.filter((r) => r.text).map((r) => `${r.done ? '[x]' : '[ ]'} ${r.text}`).join('; ') || 'sin definir'}.`);
  }
  const logs = plans.filter((x) => x.date >= addDays(d, -7) && x.date < d && x.log);
  if (logs.length) {
    const sum = (f: (l: NonNullable<(typeof logs)[0]['log']>) => number) => logs.reduce((a, x) => a + f(x.log!), 0);
    lines.push(`Últimos ${logs.length} días registrados: ${sum((l) => l.messages)} mensajes a clientes, ${sum((l) => l.focusH)} h de foco, ${logs.filter((x) => x.log!.social).length} eventos sociales, ${(sum((l) => l.phoneH) / logs.length).toFixed(1)} h/día de celular, ${logs.filter((x) => x.log!.gym).length} días de gym.`);
  }
  const misses = plans.filter((x) => x.date >= addDays(d, -14) && x.excuse).map((x) => EXCUSE_LABEL[x.excuse!]);
  if (misses.length) lines.push(`Excusas registradas en 14 días: ${misses.join(', ')}.`);
  const insights = [...simpleCoach(p, plans, s.all('sweek'), d), ...logCoach(p, plans, d)];
  if (insights.length) lines.push(`Alertas del coach: ${insights.map((i) => `${i.title} (${i.evidence})`).join(' | ')}.`);
  const notes = s.all('snote').filter((n) => n.status === 'open');
  if (notes.length) lines.push(`Pendientes en Ordenar: ${notes.slice(0, 25).map((n) => `${n.text} [${QUADRANT_LABEL[n.quadrant ?? 'idea'].title}]`).join('; ')}.`);
  return lines.join('\n');
}
