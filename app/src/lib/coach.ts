import type { MissCause } from './types';
import { CAUSE_FIX, CAUSE_LABEL } from './types';
import type { Snapshot } from './model';
import { lowEnergyStreak } from './model';
import { addDays, daysBetween, inRange } from './dates';

/**
 * Coach basado en reglas sobre datos reales. Cada hallazgo incluye la evidencia
 * que lo dispara y una corrección concreta y verificable. Si no hay datos, no opina.
 */
export interface Finding {
  id: string;
  severity: 1 | 2 | 3;
  title: string;
  evidence: string;
  action: string;
}

function windowFindings(s: Snapshot, today: string): Finding[] {
  const from = addDays(today, -6);
  const f: Finding[] = [];
  const done = s.tasks.filter((t) => t.status === 'done' && inRange(t.doneAt, from, today));
  const prep = done.filter((t) => t.type === 'prep');
  const prepMin = prep.reduce((a, t) => a + t.estimateMin, 0);
  const contacts = s.results
    .filter((r) => r.type === 'contact' && inRange(r.date, from, today))
    .reduce((a, r) => a + Math.max(1, r.qty), 0);
  const commercial = done.filter((t) => t.commercial).length + contacts;
  const results = s.results.filter((r) => inRange(r.date, from, today) && r.type !== 'saving');
  const hasGrowth = s.projects.some((p) => p.status === 'active' && (p.role === 'main' || p.role === 'secondary'));

  // 1. Preparación sin prueba de demanda.
  if (hasGrowth && (prep.length >= 3 || prepMin >= 180) && commercial === 0) {
    f.push({
      id: 'prep_no_sales',
      severity: 2,
      title: 'Preparás, pero no probás la demanda',
      evidence: `En 7 días completaste ${prep.length} tareas de preparación (~${Math.round(prepMin / 60)} h) y 0 acciones comerciales.`,
      action: 'Hoy, antes de seguir desarrollando, contactá a 5 potenciales clientes y registrá las respuestas.',
    });
  }

  // 2. Horas sin resultados.
  const workMin = done.reduce((a, t) => a + t.estimateMin, 0);
  if (workMin >= 600 && results.length === 0) {
    f.push({
      id: 'hours_no_results',
      severity: 2,
      title: 'Horas trabajadas no es lo mismo que resultados',
      evidence: `~${Math.round(workMin / 60)} h de tareas completadas y ningún resultado registrado (contactos, propuestas, clientes, ingresos).`,
      action: 'Definí qué resultado verificable vas a registrar esta semana y poné la acción que lo produce como prioridad 1 mañana.',
    });
  }

  // 3. Sobreplanificación.
  const closed = s.days.filter((d) => d.closed && inRange(d.date, from, today) && (d.plannedCount ?? 0) > 0);
  if (closed.length >= 3) {
    const planned = closed.reduce((a, d) => a + (d.plannedCount ?? 0), 0);
    const ok = closed.reduce((a, d) => a + (d.doneCount ?? 0), 0);
    if (ok / planned < 0.5) {
      f.push({
        id: 'overplanning',
        severity: 2,
        title: 'Planificás más de lo que cumplís',
        evidence: `Cumpliste ${ok} de ${planned} prioridades en ${closed.length} días (${Math.round((ok / planned) * 100)}%).`,
        action: 'Esta semana: máximo 2 prioridades por día. Subí a 3 solo después de cumplir 2 de 2 durante 3 días seguidos.',
      });
    }
  }

  // 4. Proyectos que se cambian antes de dar resultados.
  const recentGrowth = s.projects.filter(
    (p) => (p.role === 'main' || p.role === 'secondary') && daysBetween(new Date(p.createdAt).toISOString().slice(0, 10), today) <= 30,
  );
  if (recentGrowth.length >= 3) {
    f.push({
      id: 'project_hopping',
      severity: 2,
      title: 'Cambiás de proyecto antes de validar',
      evidence: `${recentGrowth.length} proyectos de crecimiento creados en 30 días.`,
      action: 'No actives otro proyecto hasta cumplir la fecha de revisión del actual con su criterio de éxito medido.',
    });
  }

  // 5. Ideas nuevas mientras no hay ejecución comercial.
  const newIdeas = s.ideas.filter((i) => daysBetween(new Date(i.createdAt).toISOString().slice(0, 10), today) <= 6);
  if (newIdeas.length >= 4 && commercial === 0) {
    f.push({
      id: 'idea_flood',
      severity: 1,
      title: 'Más ideas que ejecución',
      evidence: `${newIdeas.length} ideas nuevas esta semana y 0 acciones comerciales.`,
      action: 'Las ideas quedan en espera. Revisalas solo en la revisión semanal.',
    });
  }

  // 6. Causa de incumplimiento dominante.
  const causes = new Map<MissCause, number>();
  const bump = (c?: MissCause) => c && causes.set(c, (causes.get(c) ?? 0) + 1);
  const from14 = addDays(today, -13);
  s.obstacles.filter((o) => inRange(o.date, from14, today)).forEach((o) => bump(o.cause));
  s.days.filter((d) => inRange(d.date, from14, today)).forEach((d) => bump(d.missCause));
  s.habitLogs.filter((l) => inRange(l.date, from14, today)).forEach((l) => bump(l.reason));
  const top = [...causes.entries()].sort((a, b) => b[1] - a[1])[0];
  if (top && top[1] >= 3) {
    f.push({
      id: 'cause_' + top[0],
      severity: top[0] === 'avoidance' ? 3 : 2,
      title: `Causa repetida: ${CAUSE_LABEL[top[0]]}`,
      evidence: `Registrada ${top[1]} veces en 14 días.`,
      action: CAUSE_FIX[top[0]],
    });
  }
  return f;
}

function pointFindings(s: Snapshot, today: string): Finding[] {
  const f: Finding[] = [];

  // Tarea postergada repetidamente.
  const stuck = s.tasks.filter((t) => t.status === 'todo' && t.postponeCount >= 3).sort((a, b) => b.postponeCount - a.postponeCount)[0];
  if (stuck) {
    f.push({
      id: 'postponed',
      severity: stuck.postponeCount >= 5 ? 3 : 2,
      title: 'Una acción que pateás',
      evidence: `"${stuck.title}" fue postergada ${stuck.postponeCount} veces.`,
      action: stuck.avoided
        ? 'Hacela primero mañana: 15 minutos con temporizador. Si no podés, descartala: arrastrarla también cuesta.'
        : 'O está mal definida o la estás evitando. Dividila en un paso de 30 minutos, o marcala como "la evito" y hacela primero.',
    });
  }

  // Hábitos: nunca fallar dos veces.
  for (const h of s.habits.filter((x) => x.active)) {
    const y = s.habitLogs.find((l) => l.habitId === h.id && l.date === addDays(today, -1));
    const y2 = s.habitLogs.find((l) => l.habitId === h.id && l.date === addDays(today, -2));
    if (y?.status === 'miss' && y2?.status === 'miss') {
      f.push({
        id: 'habit_' + h.id,
        severity: 2,
        title: `"${h.title}" se está cayendo`,
        evidence: 'Dos días seguidos sin cumplir.',
        action: `Hoy hacé solo la versión mínima: ${h.minVersion || 'la más chica posible'}. No hace falta compensar.`,
      });
    }
  }

  // Plan mínimo como estándar.
  const today_ = s.days.find((d) => d.date === today);
  const streak = lowEnergyStreak(s.days, today) + (today_?.energy === 'low' ? 1 : 0);
  if (streak >= 3) {
    f.push({
      id: 'low_energy_std',
      severity: 2,
      title: 'El plan mínimo se está volviendo tu estándar',
      evidence: `${streak} días seguidos en baja energía.`,
      action: 'Revisá sueño y entrenamiento de esta semana. Mañana planificá 2 prioridades normales aunque cueste.',
    });
  }

  // Experimentos vencidos sin decisión.
  for (const p of s.projects.filter((x) => x.status === 'active' && x.isExperiment && x.deadline && x.deadline < today)) {
    f.push({
      id: 'exp_' + p.id,
      severity: 2,
      title: `Experimento vencido: ${p.title}`,
      evidence: `La fecha de revisión era ${p.deadline}. Criterio: ${p.successCriteria || 'sin definir'}.`,
      action: 'Decidí con datos: continuar (con nueva fecha), ajustar o cerrar. No lo dejes abierto por inercia.',
    });
  }

  // Objetivo de ingresos sin registros.
  const incomeGoal = s.goals.find((g) => g.status === 'active' && g.source === 'income_ars');
  const lastIncome = s.results.filter((r) => r.type === 'income').map((r) => r.date).sort().pop();
  if (incomeGoal && (!lastIncome || daysBetween(lastIncome, today) > 14)) {
    f.push({
      id: 'no_income_logs',
      severity: 1,
      title: 'Sin ingresos registrados en 14 días',
      evidence: `Tenés el objetivo "${incomeGoal.title}" pero no hay cobros registrados recientemente.`,
      action: 'Registrá cada cobro cuando ocurra (toma 10 segundos). Sin ese dato no se puede medir el avance.',
    });
  }

  // Cierre diario abandonado: simplificar.
  const lastClose = s.days.filter((d) => d.closed).map((d) => d.date).sort().pop();
  if (lastClose && daysBetween(lastClose, today) >= 3) {
    f.push({
      id: 'no_close',
      severity: 1,
      title: 'Dejaste de cerrar el día',
      evidence: `Último cierre: hace ${daysBetween(lastClose, today)} días.`,
      action: 'Volvé con lo mínimo: marcá qué prioridades hiciste y la primera acción de mañana. Nada más.',
    });
  }
  return f;
}

/** Hallazgos del coach, con exigencia creciente si el patrón se repite semana a semana. */
export function coach(s: Snapshot, today: string): Finding[] {
  const now = windowFindings(s, today);
  const prev = new Set(windowFindings(s, addDays(today, -7)).map((x) => x.id));
  const escalated = now.map((x) =>
    prev.has(x.id)
      ? { ...x, severity: Math.min(3, x.severity + 1) as Finding['severity'], title: 'Segunda semana seguida: ' + x.title.charAt(0).toLowerCase() + x.title.slice(1) }
      : x,
  );
  return [...escalated, ...pointFindings(s, today)].sort((a, b) => b.severity - a.severity);
}
