import { describe, expect, it } from 'vitest';
import { createMemoryStore } from './store';
import { proposePlan, scoreTask, type PlanCtx } from './priority';
import { pointsBetween, PREP_DAILY_CAP, achievements } from './points';
import { coach } from './coach';
import { closeDay, newTask, setPriorities } from './actions';
import { ensureDay, goalCurrent, goalProgress, slotConflict, snapshot } from './model';
import { addDays, weekStart } from './dates';
import { exportJSON, parseBackup } from './export';
import type { AnyRec, Goal, Task } from './types';

const T = '2026-10-14'; // miércoles

function ctx(p: Partial<PlanCtx> = {}): PlanCtx {
  return { today: T, energy: 'normal', availableMin: 300, realism: 0.6, projects: [], lowStreak: 0, ...p };
}

describe('store', () => {
  it('merge: gana la última escritura', () => {
    const s = createMemoryStore();
    const t = newTask(s, { title: 'A' });
    s.merge([{ ...t, title: 'vieja', updatedAt: t.updatedAt - 10 } as AnyRec]);
    expect(s.get('task', t.id)!.title).toBe('A');
    s.merge([{ ...t, title: 'nueva', updatedAt: t.updatedAt + 10 } as AnyRec]);
    expect(s.get('task', t.id)!.title).toBe('nueva');
    expect(s.pendingCount()).toBe(0);
  });

  it('markClean no limpia un registro modificado durante la subida', () => {
    const s = createMemoryStore();
    const t = newTask(s, { title: 'A' });
    const sent = s.dirtyRecords();
    s.update('task', t.id, { title: 'B' });
    s.markClean(sent);
    expect(s.pendingCount()).toBe(1);
  });

  it('borrado lógico', () => {
    const s = createMemoryStore();
    const t = newTask(s, { title: 'A' });
    s.remove(t.id);
    expect(s.all('task')).toHaveLength(0);
    expect(s.dump()).toHaveLength(1);
  });

  it('rechaza acción sin nombre', () => {
    expect(() => newTask(createMemoryStore(), { title: '  ' })).toThrow();
  });
});

describe('prioridad', () => {
  const mk = (s: ReturnType<typeof createMemoryStore>, p: Partial<Task> & { title: string }) => newTask(s, p);

  it('no propone más de 3 ni excede la capacidad realista', () => {
    const s = createMemoryStore();
    for (let i = 0; i < 10; i++) mk(s, { title: 'T' + i, estimateMin: 60 });
    const p = proposePlan(s.all('task'), ctx());
    expect(p.picks.length).toBeLessThanOrEqual(3);
    expect(p.loadMin).toBeLessThanOrEqual(p.capacityMin);
    expect(p.capacityMin).toBe(180);
  });

  it('energía baja: máximo 2 y advierte cuando se repite', () => {
    const s = createMemoryStore();
    for (let i = 0; i < 5; i++) mk(s, { title: 'T' + i, estimateMin: 20 });
    const p = proposePlan(s.all('task'), ctx({ energy: 'low', lowStreak: 2 }));
    expect(p.picks.length).toBeLessThanOrEqual(2);
    expect(p.notes.join(' ')).toMatch(/no para tu semana/);
  });

  it('exige al menos una tarea de resultado', () => {
    const s = createMemoryStore();
    for (let i = 0; i < 4; i++) mk(s, { title: 'Prep' + i, type: 'prep', importance: 3, impact: 3, estimateMin: 30 });
    mk(s, { title: 'Llamar cliente', type: 'result', importance: 1, impact: 1, estimateMin: 30 });
    const p = proposePlan(s.all('task'), ctx());
    expect(p.picks.some((x) => x.task.type === 'result')).toBe(true);
  });

  it('urgencia y evitación suben el puntaje; energía alta en día bajo lo baja', () => {
    const s = createMemoryStore();
    const base = mk(s, { title: 'X' });
    const urgent = mk(s, { title: 'Y', dueDate: T, avoided: true });
    expect(scoreTask(urgent, ctx()).score).toBeGreaterThan(scoreTask(base, ctx()).score);
    expect(scoreTask(base, ctx({ energy: 'low' })).score).toBeLessThan(scoreTask(base, ctx()).score);
  });

  it('ignora tareas planificadas para el futuro', () => {
    const s = createMemoryStore();
    mk(s, { title: 'futura', plannedFor: addDays(T, 3) });
    expect(proposePlan(s.all('task'), ctx()).picks).toHaveLength(0);
  });

  it('setPriorities rechaza una cuarta prioridad', () => {
    const s = createMemoryStore();
    const ids = [1, 2, 3, 4].map((i) => mk(s, { title: 'T' + i }).id);
    expect(() => setPriorities(s, T, ids, 3)).toThrow(/Máximo 3/);
  });
});

describe('puntos', () => {
  it('la preparación tiene tope diario y no reemplaza resultados', () => {
    const s = createMemoryStore();
    for (let i = 0; i < 10; i++) {
      const t = newTask(s, { title: 'p' + i, type: 'prep' });
      s.update('task', t.id, { status: 'done', doneAt: T });
    }
    const p = pointsBetween(snapshot(s), T, T);
    expect(p.activity).toBe(PREP_DAILY_CAP);
    expect(p.results).toBe(0);
  });

  it('enfrentar una tarea evitada y con evidencia vale más', () => {
    const s = createMemoryStore();
    const a = newTask(s, { title: 'a', type: 'result' });
    const b = newTask(s, { title: 'b', type: 'result', avoided: true, commercial: true });
    s.update('task', a.id, { status: 'done', doneAt: T });
    s.update('task', b.id, { status: 'done', doneAt: addDays(T, 1), evidence: '5 enviados' });
    expect(pointsBetween(snapshot(s), addDays(T, 1), addDays(T, 1)).activity).toBeGreaterThan(pointsBetween(snapshot(s), T, T).activity * 2);
  });

  it('logros se derivan de registros', () => {
    const s = createMemoryStore();
    expect(achievements(snapshot(s))).toHaveLength(0);
    s.create('result', { kind: 'result', date: T, type: 'client', qty: 1 });
    expect(achievements(snapshot(s)).map((a) => a.id)).toContain('k1');
  });
});

describe('objetivos y proyectos', () => {
  it('ahorro USD se calcula desde la base y los registros', () => {
    const s = createMemoryStore();
    const g = s.create('goal', {
      kind: 'goal', title: 'Auto', horizon: '30d', metric: 'ahorro', unit: 'USD', source: 'savings_usd', baseline: 1000,
      target: 3000, manualCurrent: 0, startDate: T, reviewDate: addDays(T, 30), status: 'active',
    }) as Goal;
    s.create('result', { kind: 'result', date: T, type: 'saving', qty: 1, amount: 500, currency: 'USD' });
    s.create('result', { kind: 'result', date: T, type: 'saving', qty: 1, amount: 99999, currency: 'ARS' });
    s.create('result', { kind: 'result', date: addDays(T, -1), type: 'saving', qty: 1, amount: 700, currency: 'USD' });
    expect(goalCurrent(g, s.all('result'))).toBe(1500);
    expect(goalProgress(g, s.all('result'))).toBe(0.25);
  });

  it('sin meta numérica no inventa progreso', () => {
    const s = createMemoryStore();
    const g = s.create('goal', {
      kind: 'goal', title: 'Social', horizon: 'long', metric: '', unit: '', source: 'manual', baseline: 0,
      target: null, manualCurrent: 0, startDate: T, reviewDate: T, status: 'active',
    }) as Goal;
    expect(goalProgress(g, [])).toBeNull();
  });

  it('cupo: un solo proyecto principal activo', () => {
    const s = createMemoryStore();
    s.create('project', { kind: 'project', title: 'A', role: 'main', status: 'active', isExperiment: false });
    expect(slotConflict(s.all('project'), 'main')?.title).toBe('A');
    expect(slotConflict(s.all('project'), 'income')).toBeUndefined();
  });
});

describe('cierre diario', () => {
  it('registra cumplimiento, posterga lo no hecho y prepara mañana', () => {
    const s = createMemoryStore();
    const a = newTask(s, { title: 'a' });
    const b = newTask(s, { title: 'b' });
    setPriorities(s, T, [a.id, b.id], 3);
    closeDay(s, { date: T, doneIds: [a.id], missCause: 'avoidance', firstActionId: b.id });
    const d = ensureDay(s, T);
    expect(d.closed).toBe(true);
    expect([d.plannedCount, d.doneCount]).toEqual([2, 1]);
    expect(s.get('task', a.id)!.status).toBe('done');
    expect(s.get('task', b.id)!.postponeCount).toBe(1);
    expect(ensureDay(s, addDays(T, 1)).priorities[0]).toBe(b.id);
  });

  it('crea la primera acción de mañana desde texto', () => {
    const s = createMemoryStore();
    closeDay(s, { date: T, doneIds: [], firstActionTitle: 'Llamar a 3 clientes' });
    const t = s.all('task').find((x) => x.title === 'Llamar a 3 clientes');
    expect(t?.plannedFor).toBe(addDays(T, 1));
  });
});

describe('coach', () => {
  it('sin datos no opina', () => {
    expect(coach(snapshot(createMemoryStore()), T)).toHaveLength(0);
  });

  it('detecta preparación sin acciones comerciales', () => {
    const s = createMemoryStore();
    s.create('project', { kind: 'project', title: 'App', role: 'main', status: 'active', isExperiment: true });
    for (let i = 0; i < 3; i++) {
      const t = newTask(s, { title: 'mejorar ' + i, type: 'prep', estimateMin: 80 });
      s.update('task', t.id, { status: 'done', doneAt: addDays(T, -i) });
    }
    const f = coach(snapshot(s), T);
    expect(f[0].id).toBe('prep_no_sales');
    expect(f[0].action).toMatch(/5 potenciales clientes/);
  });

  it('detecta sobreplanificación con al menos 3 cierres', () => {
    const s = createMemoryStore();
    for (let i = 1; i <= 3; i++) {
      const d = ensureDay(s, addDays(T, -i));
      s.update('day', d.id, { closed: true, plannedCount: 3, doneCount: 1 });
    }
    expect(coach(snapshot(s), T).map((x) => x.id)).toContain('overplanning');
  });

  it('escala cuando el patrón se repite la semana siguiente', () => {
    const s = createMemoryStore();
    for (let i = 1; i <= 13; i++) {
      const d = ensureDay(s, addDays(T, -i));
      s.update('day', d.id, { closed: true, plannedCount: 3, doneCount: 0 });
    }
    const f = coach(snapshot(s), T).find((x) => x.id === 'overplanning')!;
    expect(f.title).toMatch(/Segunda semana/);
    expect(f.severity).toBe(3);
  });

  it('causa repetida produce corrección concreta', () => {
    const s = createMemoryStore();
    for (let i = 0; i < 3; i++) s.create('obstacle', { kind: 'obstacle', date: addDays(T, -i), cause: 'avoidance' });
    const f = coach(snapshot(s), T).find((x) => x.id === 'cause_avoidance')!;
    expect(f.action).toMatch(/15 minutos/);
  });
});

describe('fechas y respaldo', () => {
  it('semana empieza el lunes', () => {
    expect(weekStart('2026-10-14')).toBe('2026-10-12');
    expect(weekStart('2026-10-18')).toBe('2026-10-12');
  });

  it('respaldo JSON ida y vuelta, y rechaza basura', () => {
    const s = createMemoryStore();
    newTask(s, { title: 'x' });
    expect(parseBackup(exportJSON(s))).toHaveLength(1);
    expect(() => parseBackup('{}')).toThrow();
    expect(() => parseBackup('no json')).toThrow();
  });
});

import { parseNum } from './dates';
describe('parseNum', () => {
  it('entiende formato argentino', () => {
    expect(parseNum('1.500.000')).toBe(1500000);
    expect(parseNum('1500,50')).toBe(1500.5);
    expect(parseNum('$ 2.000')).toBe(2000);
    expect(parseNum('US$ 300')).toBe(300);
    expect(parseNum('1.5')).toBe(1.5);
    expect(parseNum('-200')).toBe(-200);
    expect(parseNum('')).toBeNull();
    expect(parseNum('abc')).toBeNull();
  });
});
