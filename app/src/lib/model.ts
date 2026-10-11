import type { Store } from './store';
import type {
  Day, Energy, Goal, Habit, HabitLog, Idea, Obstacle, Project, Redemption, ResultLog, Review, Reward, Settings, Task,
} from './types';
import { addDays, monthStart, inRange } from './dates';

/** Vista inmutable de los datos para las funciones puras (prioridad, puntos, coach). */
export interface Snapshot {
  goals: Goal[];
  projects: Project[];
  tasks: Task[];
  ideas: Idea[];
  habits: Habit[];
  habitLogs: HabitLog[];
  days: Day[];
  results: ResultLog[];
  obstacles: Obstacle[];
  reviews: Review[];
  rewards: Reward[];
  redemptions: Redemption[];
  settings: Settings;
}

export const DEFAULT_SETTINGS: Omit<Settings, 'id' | 'kind' | 'createdAt' | 'updatedAt'> = {
  name: '',
  defaultAvailableMin: 240,
  realism: 0.6,
  usdRate: 0,
};

export function getSettings(s: Store): Settings {
  return (
    s.get('settings', 'settings') ?? {
      ...DEFAULT_SETTINGS,
      id: 'settings',
      kind: 'settings',
      createdAt: 0,
      updatedAt: 0,
    }
  );
}

export function saveSettings(s: Store, patch: Partial<Settings>) {
  if (s.get('settings', 'settings')) s.update('settings', 'settings', patch);
  else s.create('settings', { ...DEFAULT_SETTINGS, ...patch, id: 'settings', kind: 'settings' });
}

export function snapshot(s: Store): Snapshot {
  return {
    goals: s.all('goal'),
    projects: s.all('project'),
    tasks: s.all('task'),
    ideas: s.all('idea'),
    habits: s.all('habit'),
    habitLogs: s.all('habitLog'),
    days: s.all('day'),
    results: s.all('result'),
    obstacles: s.all('obstacle'),
    reviews: s.all('review'),
    rewards: s.all('reward'),
    redemptions: s.all('redemption'),
    settings: getSettings(s),
  };
}

export const dayId = (date: string) => 'day-' + date;
export const habitLogId = (habitId: string, date: string) => `hl-${habitId}-${date}`;

export function getDay(s: Store, date: string): Day | undefined {
  return s.get('day', dayId(date));
}

/** Crea el día si no existe, heredando valores por defecto. */
export function ensureDay(s: Store, date: string): Day {
  return (
    getDay(s, date) ??
    s.create('day', {
      id: dayId(date),
      kind: 'day',
      date,
      energy: 'normal' as Energy,
      availableMin: getSettings(s).defaultAvailableMin,
      priorities: [],
      blocks: [],
      closed: false,
    })
  );
}

export function activeProjects(projects: Project[]) {
  return projects.filter((p) => p.status === 'active');
}

/** Proyecto que ocupa el cupo de su rol (principal y secundario tienen cupo 1). */
export function slotConflict(projects: Project[], role: Project['role'], exceptId?: string): Project | undefined {
  if (role !== 'main' && role !== 'secondary') return undefined;
  return projects.find((p) => p.status === 'active' && p.role === role && p.id !== exceptId);
}

/** Valor actual de un objetivo, calculado desde los registros cuando corresponde. */
export function goalCurrent(g: Goal, results: ResultLog[]): number {
  const since = (r: ResultLog) => r.date >= g.startDate;
  const sum = (pred: (r: ResultLog) => boolean, f: (r: ResultLog) => number) =>
    results.filter((r) => since(r) && pred(r)).reduce((a, r) => a + f(r), 0);
  switch (g.source) {
    case 'manual':
      return g.manualCurrent;
    case 'income_ars':
      return g.baseline + sum((r) => r.type === 'income' && (r.currency ?? 'ARS') === 'ARS', (r) => r.amount ?? 0);
    case 'savings_ars':
      return g.baseline + sum((r) => r.type === 'saving' && (r.currency ?? 'ARS') === 'ARS', (r) => r.amount ?? 0);
    case 'savings_usd':
      return g.baseline + sum((r) => r.type === 'saving' && r.currency === 'USD', (r) => r.amount ?? 0);
    case 'clients':
      return g.baseline + sum((r) => r.type === 'client', (r) => r.qty || 1);
    case 'contacts':
      return g.baseline + sum((r) => r.type === 'contact', (r) => r.qty || 1);
    case 'proposals':
      return g.baseline + sum((r) => r.type === 'proposal', (r) => r.qty || 1);
  }
}

/** Progreso 0..1 o null si no hay meta numérica definida. */
export function goalProgress(g: Goal, results: ResultLog[]): number | null {
  if (g.target == null || g.target === g.baseline) return null;
  const cur = goalCurrent(g, results);
  return Math.max(0, Math.min(1, (cur - g.baseline) / (g.target - g.baseline)));
}

export function moneySum(results: ResultLog[], type: 'income' | 'saving', currency: 'ARS' | 'USD', from: string, to: string) {
  return results
    .filter((r) => r.type === type && (r.currency ?? 'ARS') === currency && inRange(r.date, from, to))
    .reduce((a, r) => a + (r.amount ?? 0), 0);
}

export function monthRange(date: string): [string, string] {
  const from = monthStart(date);
  const d = new Date(Number(from.slice(0, 4)), Number(from.slice(5, 7)), 0);
  return [from, addDays(from, d.getDate() - 1)];
}

/** Días de baja energía consecutivos anteriores a `date`. */
export function lowEnergyStreak(days: Day[], date: string): number {
  const byDate = new Map(days.map((d) => [d.date, d]));
  let n = 0;
  for (let d = addDays(date, -1); byDate.get(d)?.energy === 'low'; d = addDays(d, -1)) n++;
  return n;
}

export function fmtMoney(n: number, currency: 'ARS' | 'USD' = 'ARS') {
  return (currency === 'USD' ? 'US$ ' : '$ ') + Math.round(n).toLocaleString('es-AR');
}
