import type { HabitLog, ResultLog, Task, Day } from './types';
import type { Snapshot } from './model';
import { goalProgress } from './model';
import { inRange } from './dates';

/**
 * Gamificación sobria. Tres cuentas separadas:
 *  - actividad: lo que hiciste (tareas, hábitos, cierres)
 *  - resultado: lo que cambió (contactos, propuestas, clientes, ingresos)
 *  - estratégico: % de avance de objetivos (no son puntos, es el progreso real)
 * La preparación tiene tope diario para que no sustituya resultados.
 */

export const PREP_DAILY_CAP = 9;

export function taskPoints(t: Task): number {
  if (t.status !== 'done') return 0;
  let p = t.type === 'result' ? 10 : t.type === 'prep' ? 3 : 2;
  if (t.evidence && t.evidence.trim().length >= 3) p += t.type === 'prep' ? 1 : 5;
  if (t.commercial) p += 5;
  if (t.avoided) p += 10;
  return p;
}

export function resultPoints(r: ResultLog): number {
  switch (r.type) {
    case 'contact':
      return Math.min(20, 2 * Math.max(1, r.qty));
    case 'proposal':
      return 10 * Math.max(1, r.qty);
    case 'client':
      return 30 * Math.max(1, r.qty);
    case 'income':
      return 15;
    case 'saving':
      return (r.amount ?? 0) > 0 ? 5 : 0;
    case 'other':
      return 2;
  }
}

export function habitPoints(l: HabitLog): number {
  return l.status === 'done' ? 2 : l.status === 'min' ? 1 : 0;
}

export const CLOSE_POINTS = 3;

export interface PointsSummary {
  activity: number;
  results: number;
  total: number;
  importantDone: number;
  commercialDone: number;
  avoidedDone: number;
  prepDone: number;
}

export function pointsBetween(s: Snapshot, from: string, to: string): PointsSummary {
  const tasks = s.tasks.filter((t) => t.status === 'done' && inRange(t.doneAt, from, to));
  let activity = 0;
  const prepByDay = new Map<string, number>();
  for (const t of tasks) {
    const p = taskPoints(t);
    if (t.type === 'prep') {
      const used = prepByDay.get(t.doneAt!) ?? 0;
      const add = Math.max(0, Math.min(p, PREP_DAILY_CAP - used));
      prepByDay.set(t.doneAt!, used + add);
      activity += add;
    } else activity += p;
  }
  activity += s.habitLogs.filter((l) => inRange(l.date, from, to)).reduce((a, l) => a + habitPoints(l), 0);
  activity += s.days.filter((d: Day) => d.closed && inRange(d.date, from, to)).length * CLOSE_POINTS;
  const results = s.results.filter((r) => inRange(r.date, from, to)).reduce((a, r) => a + resultPoints(r), 0);
  return {
    activity,
    results,
    total: activity + results,
    importantDone: tasks.filter((t) => t.type === 'result' || t.importance === 3).length,
    commercialDone: tasks.filter((t) => t.commercial).length,
    avoidedDone: tasks.filter((t) => t.avoided).length,
    prepDone: tasks.filter((t) => t.type === 'prep').length,
  };
}

export function balance(s: Snapshot): number {
  const earned = pointsBetween(s, '0000-01-01', '9999-12-31').total;
  return earned - s.redemptions.reduce((a, r) => a + r.cost, 0);
}

/** Avance estratégico medio de los objetivos con meta numérica (0..1) o null. */
export function strategicProgress(s: Snapshot): number | null {
  const ps = s.goals
    .filter((g) => g.status === 'active')
    .map((g) => goalProgress(g, s.results))
    .filter((p): p is number => p != null);
  return ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : null;
}

export interface Achievement {
  id: string;
  title: string;
  detail: string;
}

/** Logros verificables: se derivan de registros, no se pueden "marcar". */
export function achievements(s: Snapshot): Achievement[] {
  const out: Achievement[] = [];
  const count = (type: ResultLog['type']) => s.results.filter((r) => r.type === type).reduce((a, r) => a + Math.max(1, r.qty), 0);
  const contacts = count('contact');
  const clients = count('client');
  const proposals = count('proposal');
  const avoided = s.tasks.filter((t) => t.status === 'done' && t.avoided).length;
  const closes = s.days.filter((d) => d.closed).length;
  const add = (cond: boolean, id: string, title: string, detail: string) => cond && out.push({ id, title, detail });
  add(contacts >= 1, 'c1', 'Primer contacto comercial', 'Te expusiste al rechazo.');
  add(contacts >= 25, 'c25', '25 contactos comerciales', `${contacts} contactos registrados.`);
  add(contacts >= 100, 'c100', '100 contactos comerciales', 'Volumen real de prospección.');
  add(proposals >= 1, 'p1', 'Primera propuesta enviada', `${proposals} propuestas en total.`);
  add(clients >= 1, 'k1', 'Primer cliente nuevo', `${clients} clientes registrados.`);
  add(avoided >= 1, 'a1', 'Enfrentaste algo que evitabas', `${avoided} tareas evitadas completadas.`);
  add(avoided >= 10, 'a10', '10 tareas evitadas completadas', 'El patrón de evitación está cediendo.');
  add(closes >= 7, 'd7', '7 cierres diarios', `${closes} días cerrados.`);
  add(closes >= 30, 'd30', 'Ciclo de 30 cierres', 'Completaste el ciclo inicial.');
  add(s.projects.some((p) => p.status === 'closed'), 'pc', 'Proyecto cerrado con decisión', 'Terminar también es cerrar con datos.');
  add(s.reviews.length >= 4, 'w4', '4 revisiones semanales', 'Un mes de ajustes basados en datos.');
  return out;
}
