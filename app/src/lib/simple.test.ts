import { describe, expect, it } from 'vitest';
import { cajaStreak, generatePlan, quadrant, simpleCoach, weeklyNeeded, type DayPlan, type Profile, type PlanItem } from './simple';
import { DEFAULT_PROFILE } from '../simple/Wizard';
import { addDays } from './dates';

const P: Profile = { ...DEFAULT_PROFILE, id: 'sprofile', kind: 'sprofile', createdAt: 0, updatedAt: 0, experiment: { idea: 'Canción', name: 'Publicar 1 canción', question: 'q', start: '2026-10-12', end: '2026-10-19' } };
const MON = '2026-10-12';

function plan(date: string, items: Partial<PlanItem>[], extra: Partial<DayPlan> = {}): DayPlan {
  return {
    id: 'p' + date, kind: 'splan', createdAt: 0, updatedAt: 0, date, closed: true,
    items: items.map((x, i) => ({ id: date + i, area: 'caja', title: 'x', min: 'm', minutes: 60, done: false, ...x })),
    ...extra,
  };
}

describe('plan del día', () => {
  it('día libre: caja primero con 2 h y experimento', () => {
    const items = generatePlan(P, MON); // lunes, no es día de Roble
    expect(items[0].area).toBe('caja');
    expect(items[0].minutes).toBe(120);
    expect(items.some((i) => i.area === 'experimento')).toBe(true);
    expect(items.filter((i) => i.area !== 'caja').length).toBeLessThanOrEqual(3);
  });

  it('día de Roble: jornada + 30 min de prospección, máx. 2 secundarias, sin experimento', () => {
    const items = generatePlan(P, addDays(MON, 1)); // martes
    expect(items[0].title).toMatch(/Jornada/);
    expect(items[1].minutes).toBe(30);
    expect(items.some((i) => i.area === 'experimento')).toBe(false);
    expect(items.filter((i) => i.area !== 'caja').length).toBeLessThanOrEqual(2);
  });

  it('fútbol el día elegido', () => {
    expect(generatePlan(P, addDays(MON, 2)).some((i) => i.title === 'Fútbol')).toBe(true);
  });

  it('cada ítem tiene versión mínima', () => {
    for (let i = 0; i < 7; i++) generatePlan(P, addDays(MON, i)).forEach((it) => expect(it.min.length).toBeGreaterThan(0));
  });

  it('meta semanal derivada del mínimo mensual', () => {
    expect(weeklyNeeded(P)).toBe(Math.round(2_000_000 / 4.33));
  });
});

describe('eisenhower', () => {
  it('cuadrantes', () => {
    expect(quadrant(true, true)).toBe('hacer');
    expect(quadrant(true, false)).toBe('agendar');
    expect(quadrant(false, true)).toBe('delegar');
    expect(quadrant(false, false)).toBe('eliminar');
  });
});

describe('coach simple', () => {
  it('sin datos no opina', () => {
    expect(simpleCoach(P, [], [], MON)).toHaveLength(0);
  });

  it('detecta fallas en caja y propone facilitarlo', () => {
    const plans = [1, 2, 3, 4].map((i) => plan(addDays(MON, -i), [{ done: i === 4 }]));
    const f = simpleCoach(P, plans, [], MON);
    const caja = f.find((x) => x.id === 'area_caja')!;
    expect(caja.evidence).toMatch(/1 de 4/);
    expect(caja.fixes.join(' ')).toMatch(/2 minutos/);
  });

  it('nunca fallar dos veces', () => {
    const plans = [1, 2].map((i) => plan(addDays(MON, -i), [{ done: false, title: 'Clientes Roble' }]));
    expect(simpleCoach(P, plans, [], MON).some((x) => x.id === 'twice')).toBe(true);
  });

  it('excusa repetida con respuesta específica', () => {
    const plans = [1, 2, 3].map((i) => plan(addDays(MON, -i), [{ done: true }], { excuse: 'plata' }));
    const f = simpleCoach(P, plans, [], MON).find((x) => x.id === 'excuse_plata')!;
    expect(f.title).toMatch(/Realmente voy a ganar plata/);
    expect(f.fixes[0]).toMatch(/datos/);
  });

  it('brecha de ingresos con 2 semanas registradas', () => {
    const weeks = [7, 14].map((d) => ({ id: 'w' + d, kind: 'sweek' as const, createdAt: 0, updatedAt: 0, weekStart: addDays(MON, -d), income: 250000, results: [] }));
    expect(simpleCoach(P, [], weeks, MON).some((x) => x.id === 'gap')).toBe(true);
  });

  it('racha de caja', () => {
    const plans = [1, 2, 3].map((i) => plan(addDays(MON, -i), [{ done: true }]));
    expect(cajaStreak(plans, MON)).toBe(3);
  });
});
