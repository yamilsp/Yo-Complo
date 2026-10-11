import type { Energy, Project, Task } from './types';
import { daysBetween } from './dates';

export interface PlanCtx {
  today: string;
  energy: Energy;
  availableMin: number;
  realism: number;
  projects: Project[];
  /** Días seguidos en modo baja energía antes de hoy. */
  lowStreak: number;
}

export interface Scored {
  task: Task;
  score: number;
  reasons: string[];
}

/** Puntaje de urgencia y su motivo, en función de la fecha límite real. */
export function urgency(t: Task, today: string): [number, string | null] {
  if (!t.dueDate) return [0, null];
  const d = daysBetween(today, t.dueDate);
  if (d < 0) return [6, `Vencida hace ${-d} d`];
  if (d === 0) return [5, 'Vence hoy'];
  if (d <= 2) return [3, `Vence en ${d} d`];
  if (d <= 7) return [1, null];
  return [0, null];
}

/**
 * Valor de una tarea. Pondera importancia e impacto económico, urgencia real,
 * si produce resultado (no solo preparación) y si es algo que se suele evitar.
 * Eisenhower como apoyo: importancia × urgencia, pero lo importante pesa más.
 */
export function scoreTask(t: Task, ctx: PlanCtx): Scored {
  const reasons: string[] = [];
  let s = t.importance * 3 + t.impact * 3;
  if (t.impact === 3) reasons.push('Impacto económico alto');
  else if (t.importance === 3) reasons.push('Muy importante para tus objetivos');

  const [u, ur] = urgency(t, ctx.today);
  s += u;
  if (ur) reasons.push(ur);

  if (t.type === 'result') {
    s += 3;
    reasons.push('Produce resultado, no es preparación');
  } else if (t.type === 'prep') {
    s -= 1;
  }
  if (t.commercial) {
    s += 2;
    reasons.push('Acción comercial');
  }
  if (t.avoided) {
    s += 2;
    reasons.push('La venís evitando');
  }
  const p = ctx.projects.find((x) => x.id === t.projectId);
  if (p && p.status === 'active' && p.role === 'main') {
    s += 2;
    reasons.push('Proyecto principal');
  }
  if (p && p.status !== 'active') {
    s -= 4;
    reasons.push('Su proyecto no está activo');
  }
  if (t.postponeCount >= 3) reasons.push(`Postergada ${t.postponeCount} veces`);
  if (ctx.energy === 'low' && t.energy === 'high') {
    s -= 4;
    reasons.push('Requiere energía alta y hoy tenés poca');
  }
  return { task: t, score: s, reasons };
}

/** Minutos de trabajo enfocado que realmente se pueden esperar hoy. */
export function capacity(availableMin: number, realism: number): number {
  return Math.round(availableMin * realism);
}

export function load(tasks: Task[]): number {
  return tasks.reduce((a, t) => a + (t.estimateMin || 0), 0);
}

export function maxPriorities(energy: Energy): number {
  return energy === 'low' ? 2 : 3;
}

/** Tareas candidatas para hoy: pendientes, no planificadas a futuro. */
export function candidates(tasks: Task[], today: string): Task[] {
  return tasks.filter((t) => t.status === 'todo' && (!t.plannedFor || t.plannedFor <= today));
}

export interface Proposal {
  picks: Scored[];
  capacityMin: number;
  loadMin: number;
  notes: string[];
}

/**
 * Propone las prioridades del día. No asume que se puede hacer todo:
 * elige pocas, respeta la capacidad realista y exige al menos una de resultado.
 */
export function proposePlan(tasks: Task[], ctx: PlanCtx): Proposal {
  const cap = capacity(ctx.availableMin, ctx.realism);
  const scored = candidates(tasks, ctx.today)
    .map((t) => scoreTask(t, ctx))
    .sort((a, b) => b.score - a.score || a.task.estimateMin - b.task.estimateMin);
  const max = maxPriorities(ctx.energy);
  const notes: string[] = [];
  const picks: Scored[] = [];
  let used = 0;

  for (const sc of scored) {
    if (picks.length >= max) break;
    const est = sc.task.estimateMin || 30;
    if (picks.length === 0 || used + est <= cap) {
      picks.push(sc);
      used += est;
    }
  }

  if (picks.length && picks[0].task.estimateMin > cap) {
    notes.push(`"${picks[0].task.title}" no entra en tu capacidad de hoy (${cap} min). Dividila en un paso de 60 min o menos.`);
  }

  // Al menos una prioridad debe producir resultado si existe alguna disponible.
  if (picks.length && !picks.some((p) => p.task.type === 'result')) {
    const best = scored.find((s) => s.task.type === 'result' && !picks.includes(s));
    if (best) {
      const out = picks.length >= max ? picks.pop() : undefined;
      if (out) used -= out.task.estimateMin || 30;
      picks.push(best);
      used += best.task.estimateMin || 30;
      notes.push('Agregué una tarea de resultado: un día solo de preparación no te acerca a tus objetivos.');
    }
  }

  if (ctx.energy === 'low') {
    notes.push(
      ctx.lowStreak >= 2
        ? `Es el ${ctx.lowStreak + 1}º día seguido con plan mínimo. El plan mínimo es para un mal día, no para tu semana: revisá sueño y carga, y mañana volvé al plan normal.`
        : 'Plan mínimo: 1 o 2 acciones importantes. Cumplilas y el día cuenta.',
    );
  }
  if (!scored.length) notes.push('No hay acciones pendientes. Definí la próxima acción concreta de tu proyecto principal.');
  return { picks, capacityMin: cap, loadMin: used, notes };
}

/** Si no hay nada definido, propone una acción concreta según los proyectos activos. */
export function fallbackAction(projects: Project[]): { title: string; why: string } {
  const main = projects.find((p) => p.status === 'active' && p.role === 'main');
  if (main?.isExperiment)
    return {
      title: `Contactar a 5 potenciales clientes de "${main.title}" y registrar las respuestas`,
      why: 'Un experimento se valida con respuestas del mercado, no con más desarrollo.',
    };
  if (main)
    return {
      title: `Definir y ejecutar el próximo paso de "${main.title}" que pueda ver un cliente (60 min)`,
      why: 'Tu proyecto principal no tiene una acción pendiente.',
    };
  const income = projects.find((p) => p.status === 'active' && p.role === 'income');
  if (income)
    return {
      title: `Pedir 3 referidos o presupuestos nuevos para "${income.title}"`,
      why: 'Mientras no haya proyecto de crecimiento, el ingreso actual es la palanca más directa.',
    };
  return {
    title: 'Elegir un proyecto principal y escribir su primera acción concreta',
    why: 'Sin proyecto principal, cualquier tarea parece igual de importante.',
  };
}
