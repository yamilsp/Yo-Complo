import { useSyncExternalStore } from 'react';
import type { AnyRec, Kind, RecOf } from './types';

/**
 * Almacén local-first. Cada registro es un documento con `updatedAt`;
 * los cambios quedan marcados como "dirty" hasta que la sincronización los sube.
 * Conflictos: gana la última escritura (por registro), suficiente para un solo usuario.
 */

const DATA_KEY = 'yc:v1:data';
const DIRTY_KEY = 'yc:v1:dirty';

interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

function memoryKV(): KV {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

type Draft<K extends Kind> = Omit<RecOf<K>, 'createdAt' | 'updatedAt' | 'id'> & { id?: string };

export class Store {
  private recs = new Map<string, AnyRec>();
  private dirty = new Set<string>();
  private listeners = new Set<() => void>();
  private cache = new Map<Kind, AnyRec[]>();
  version = 0;
  persistError: string | null = null;

  constructor(private kv: KV) {
    try {
      const raw = kv.getItem(DATA_KEY);
      if (raw) for (const r of JSON.parse(raw) as AnyRec[]) this.recs.set(r.id, r);
      const d = kv.getItem(DIRTY_KEY);
      if (d) for (const id of JSON.parse(d) as string[]) this.dirty.add(id);
    } catch (e) {
      this.persistError = 'No se pudieron leer los datos locales: ' + String(e);
    }
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  private changed() {
    this.version++;
    this.cache.clear();
    try {
      this.kv.setItem(DATA_KEY, JSON.stringify([...this.recs.values()]));
      this.kv.setItem(DIRTY_KEY, JSON.stringify([...this.dirty]));
      this.persistError = null;
    } catch (e) {
      this.persistError = 'No se pudo guardar localmente: ' + String(e);
    }
    this.listeners.forEach((l) => l());
  }

  all<K extends Kind>(kind: K): RecOf<K>[] {
    let list = this.cache.get(kind);
    if (!list) {
      list = [...this.recs.values()].filter((r) => r.kind === kind && !r.deleted);
      list.sort((a, b) => a.createdAt - b.createdAt);
      this.cache.set(kind, list);
    }
    return list as RecOf<K>[];
  }

  get<K extends Kind>(kind: K, id: string | undefined): RecOf<K> | undefined {
    if (!id) return undefined;
    const r = this.recs.get(id);
    return r && r.kind === kind && !r.deleted ? (r as RecOf<K>) : undefined;
  }

  create<K extends Kind>(kind: K, data: Draft<K>): RecOf<K> {
    const now = Date.now();
    const rec = { ...data, kind, id: data.id ?? uid(), createdAt: now, updatedAt: now } as unknown as RecOf<K>;
    const prev = this.recs.get(rec.id);
    if (prev) (rec as AnyRec).createdAt = prev.createdAt;
    this.recs.set(rec.id, rec);
    this.dirty.add(rec.id);
    this.changed();
    return rec;
  }

  update<K extends Kind>(kind: K, id: string, patch: Partial<RecOf<K>>): RecOf<K> | undefined {
    const prev = this.get(kind, id);
    if (!prev) return undefined;
    const rec = { ...prev, ...patch, id, kind, updatedAt: Math.max(Date.now(), prev.updatedAt + 1) } as RecOf<K>;
    this.recs.set(id, rec);
    this.dirty.add(id);
    this.changed();
    return rec;
  }

  remove(id: string) {
    const prev = this.recs.get(id);
    if (!prev) return;
    this.recs.set(id, { ...prev, deleted: true, updatedAt: Math.max(Date.now(), prev.updatedAt + 1) });
    this.dirty.add(id);
    this.changed();
  }

  dirtyRecords(): AnyRec[] {
    return [...this.dirty].map((id) => this.recs.get(id)).filter((r): r is AnyRec => !!r);
  }

  /** Marca como sincronizados solo si no cambiaron mientras se subían. */
  markClean(sent: AnyRec[]) {
    let touched = false;
    for (const s of sent) {
      const cur = this.recs.get(s.id);
      if (cur && cur.updatedAt === s.updatedAt) {
        this.dirty.delete(s.id);
        touched = true;
      }
    }
    if (touched) this.persistDirty();
  }

  private persistDirty() {
    try {
      this.kv.setItem(DIRTY_KEY, JSON.stringify([...this.dirty]));
    } catch {
      /* se reintenta en el próximo cambio */
    }
  }

  /** Fusiona registros remotos: gana el `updatedAt` mayor. Devuelve cuántos cambiaron. */
  merge(remote: AnyRec[]): number {
    let n = 0;
    for (const r of remote) {
      const cur = this.recs.get(r.id);
      if (!cur || r.updatedAt > cur.updatedAt) {
        this.recs.set(r.id, r);
        this.dirty.delete(r.id);
        n++;
      }
    }
    if (n) this.changed();
    return n;
  }

  /** Todos los registros, incluidos los borrados (para respaldo). */
  dump(): AnyRec[] {
    return [...this.recs.values()];
  }

  replaceAll(recs: AnyRec[], markDirty: boolean) {
    this.recs.clear();
    this.dirty.clear();
    for (const r of recs) {
      this.recs.set(r.id, r);
      if (markDirty) this.dirty.add(r.id);
    }
    this.changed();
  }

  pendingCount() {
    return this.dirty.size;
  }
}

function defaultKV(): KV {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('yc:probe', '1');
      localStorage.removeItem('yc:probe');
      return localStorage;
    }
  } catch {
    /* modo privado o bloqueado */
  }
  return memoryKV();
}

export const store = new Store(defaultKV());
export const createMemoryStore = () => new Store(memoryKV());

/** Re-renderiza el componente ante cualquier cambio en el almacén. */
export function useStore(): Store {
  useSyncExternalStore(store.subscribe, () => store.version);
  return store;
}
