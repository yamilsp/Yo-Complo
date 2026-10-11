import type { Store } from './store';
import type { Habit, HabitLog, MissCause, Project, ProjectStatus, Task } from './types';
import { ensureDay, habitLogId, slotConflict } from './model';
import { addDays } from './dates';

/** Mutaciones de dominio usadas por la interfaz. Validan reglas antes de escribir. */

export function newTask(s: Store, p: Partial<Task> & { title: string }): Task {
  const title = p.title.trim();
  if (!title) throw new Error('La acción necesita un nombre.');
  return s.create('task', {
    kind: 'task',
    type: 'result',
    commercial: false,
    avoided: false,
    importance: 2,
    impact: 2,
    estimateMin: 45,
    energy: 'high',
    status: 'todo',
    postponeCount: 0,
    ...p,
    title,
  });
}

export function completeTask(s: Store, id: string, date: string, evidence?: string) {
  s.update('task', id, { status: 'done', doneAt: date, evidence: evidence?.trim() || undefined, startedAt: undefined });
}

export function reopenTask(s: Store, id: string) {
  s.update('task', id, { status: 'todo', doneAt: undefined });
}

/** Posterga y lleva la cuenta: el coach usa ese contador para detectar evitación. */
export function postpone(s: Store, id: string, to: string, today: string) {
  const t = s.get('task', id);
  if (!t) return;
  s.update('task', id, { plannedFor: to, postponeCount: t.postponeCount + 1 });
  unprioritize(s, id, today);
}

export function delegate(s: Store, id: string, who: string, today: string) {
  s.update('task', id, { status: 'delegated', delegatedTo: who.trim() || 'alguien' });
  unprioritize(s, id, today);
}

export function drop(s: Store, id: string, today: string) {
  s.update('task', id, { status: 'dropped' });
  unprioritize(s, id, today);
}

export function unprioritize(s: Store, id: string, date: string) {
  const d = ensureDay(s, date);
  if (d.priorities.includes(id)) s.update('day', d.id, { priorities: d.priorities.filter((x) => x !== id) });
}

export function setPriorities(s: Store, date: string, ids: string[], max: number) {
  if (ids.length > max) throw new Error(`Máximo ${max} prioridades. Elegí cuál sale.`);
  const d = ensureDay(s, date);
  s.update('day', d.id, { priorities: ids });
  for (const id of ids) {
    const t = s.get('task', id);
    if (t && t.plannedFor !== date) s.update('task', id, { plannedFor: date });
  }
}

export function logHabit(s: Store, h: Habit, date: string, status: HabitLog['status'], reason?: MissCause) {
  const id = habitLogId(h.id, date);
  const cur = s.get('habitLog', id);
  if (cur && cur.status === status && cur.reason === reason) {
    s.remove(id);
    return;
  }
  s.create('habitLog', { id, kind: 'habitLog', habitId: h.id, date, status, reason });
}

/**
 * Cambia el estado de un proyecto respetando el cupo: 1 principal y 1 secundario activos.
 * Si hay conflicto, devuelve el proyecto que ocupa el cupo para que el usuario decida.
 */
export function activateProject(s: Store, p: Project): Project | undefined {
  const c = slotConflict(s.all('project'), p.role, p.id);
  if (c) return c;
  s.update('project', p.id, { status: 'active' });
  return undefined;
}

export function setProjectStatus(s: Store, id: string, status: ProjectStatus, note?: string) {
  s.update('project', id, { status, statusNote: note });
}

export interface CloseInput {
  date: string;
  doneIds: string[];
  missCause?: MissCause;
  firstActionId?: string;
  firstActionTitle?: string;
}

/** Cierre diario: marca prioridades, registra causa y deja lista la primera acción de mañana. */
export function closeDay(s: Store, input: CloseInput) {
  const d = ensureDay(s, input.date);
  for (const id of d.priorities) {
    const t = s.get('task', id);
    if (!t) continue;
    const isDone = input.doneIds.includes(id);
    if (isDone && t.status !== 'done') completeTask(s, id, input.date, t.evidence);
    if (!isDone && t.status === 'done' && t.doneAt === input.date) reopenTask(s, id);
    // Una prioridad no cumplida pasa sola al día siguiente y cuenta como postergación.
    if (!isDone && t.status !== 'dropped' && t.status !== 'delegated' && !d.closed)
      s.update('task', id, { postponeCount: (s.get('task', id)?.postponeCount ?? 0) + 1 });
  }
  const tomorrow = addDays(input.date, 1);
  let firstId = input.firstActionId;
  if (!firstId && input.firstActionTitle?.trim()) firstId = newTask(s, { title: input.firstActionTitle, plannedFor: tomorrow }).id;
  if (firstId) {
    const t = s.get('task', firstId);
    if (t && t.plannedFor !== tomorrow) s.update('task', firstId, { plannedFor: tomorrow });
    const nd = ensureDay(s, tomorrow);
    if (!nd.priorities.includes(firstId)) s.update('day', nd.id, { priorities: [firstId, ...nd.priorities].slice(0, 3) });
  }
  const doneCount = d.priorities.filter((id) => input.doneIds.includes(id)).length;
  s.update('day', d.id, {
    closed: true,
    missCause: doneCount < d.priorities.length ? input.missCause : undefined,
    firstActionTomorrowId: firstId,
    plannedCount: d.priorities.length,
    doneCount,
  });
}
