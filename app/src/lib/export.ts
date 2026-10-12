import type { Store } from './store';
import type { AnyRec, Kind } from './types';

const KINDS: Kind[] = ['goal', 'project', 'task', 'idea', 'habit', 'habitLog', 'day', 'result', 'obstacle', 'review', 'reward', 'redemption', 'settings', 'sprofile', 'splan', 'sweek', 'snote', 'sdeliv'];

export function exportJSON(s: Store): string {
  return JSON.stringify({ app: 'yo-complo', version: 1, exportedAt: new Date().toISOString(), records: s.dump() }, null, 2);
}

/** Valida y devuelve los registros de un respaldo JSON. Lanza error legible si no es válido. */
export function parseBackup(text: string): AnyRec[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('El archivo no es un JSON válido.');
  }
  const recs = (data as { records?: unknown }).records;
  if (!Array.isArray(recs)) throw new Error('No es un respaldo de Yo Complo (falta "records").');
  for (const r of recs) {
    const x = r as Partial<AnyRec>;
    if (typeof x.id !== 'string' || !KINDS.includes(x.kind as Kind) || typeof x.updatedAt !== 'number')
      throw new Error('Respaldo con registros inválidos.');
  }
  return recs as AnyRec[];
}

function csvCell(v: unknown): string {
  if (v == null) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/** CSV de un tipo de registro (columnas = unión de campos). */
export function exportCSV(s: Store, kind: Kind): string {
  const rows = s.all(kind) as unknown as Record<string, unknown>[];
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))].filter((c) => c !== 'kind' && c !== 'deleted');
  return [cols.join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\n');
}

export function download(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export const CSV_KINDS: [Kind, string][] = [
  ['task', 'acciones'],
  ['result', 'resultados'],
  ['habitLog', 'registros-habitos'],
  ['day', 'dias'],
  ['goal', 'objetivos'],
  ['project', 'proyectos'],
  ['obstacle', 'obstaculos'],
];
