import { createClient, type SupabaseClient, type Session } from '@supabase/supabase-js';
import { store } from './store';
import type { AnyRec } from './types';

/**
 * Sincronización con Supabase (Postgres). Tabla única `yc_records` con un documento
 * JSON por registro. Subimos lo pendiente y bajamos lo cambiado desde el último cursor.
 * Sin configuración, la app sigue funcionando en modo local.
 */

const CFG_KEY = 'yc:v1:supabase';
const CURSOR_KEY = 'yc:v1:cursor';

export interface SyncState {
  mode: 'local' | 'signed_out' | 'ready';
  busy: boolean;
  lastSync: number | null;
  error: string | null;
  email: string | null;
  /** Se abrió el link de "olvidé mi contraseña": hay que pedir la nueva. */
  recovery: boolean;
}

let state: SyncState = { mode: 'local', busy: false, lastSync: null, error: null, email: null, recovery: false };
const listeners = new Set<() => void>();
const set = (p: Partial<SyncState>) => {
  state = { ...state, ...p };
  listeners.forEach((l) => l());
};
export const syncState = () => state;
export const subscribeSync = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export function getConfig(): { url: string; key: string } | null {
  try {
    const raw = localStorage.getItem(CFG_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignorar */
  }
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  return url && key ? { url, key } : null;
}

export function saveConfig(url: string, key: string) {
  const u = url.trim().replace(/\/+$/, '');
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i.test(u)) throw new Error('La URL debe tener la forma https://xxxx.supabase.co');
  if (key.trim().length < 30) throw new Error('La clave anon/publishable parece incompleta.');
  localStorage.setItem(CFG_KEY, JSON.stringify({ url: u, key: key.trim() }));
  localStorage.removeItem(CURSOR_KEY);
  client = null;
  void initSync();
}

export function clearConfig() {
  localStorage.removeItem(CFG_KEY);
  localStorage.removeItem(CURSOR_KEY);
  client = null;
  set({ mode: 'local', email: null, error: null });
}

let client: SupabaseClient | null = null;
let session: Session | null = null;

function getClient(): SupabaseClient | null {
  if (client) return client;
  const cfg = getConfig();
  if (!cfg) return null;
  client = createClient(cfg.url, cfg.key, { auth: { persistSession: true, autoRefreshToken: true } });
  client.auth.onAuthStateChange((event, s) => {
    session = s;
    if (event === 'PASSWORD_RECOVERY') set({ recovery: true });
    set({ mode: s ? 'ready' : 'signed_out', email: s?.user.email ?? null });
    if (s) void syncNow();
  });
  return client;
}

export async function initSync() {
  const c = getClient();
  if (!c) return set({ mode: 'local' });
  const { data } = await c.auth.getSession();
  session = data.session;
  set({ mode: session ? 'ready' : 'signed_out', email: session?.user.email ?? null });
  if (session) await syncNow();
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function validate(email: string, password?: string) {
  if (!EMAIL_RE.test(email.trim())) throw new Error('Revisá el email: tiene que ser del tipo nombre@gmail.com, sin espacios.');
  if (password !== undefined && password.length < 6) throw new Error('La contraseña tiene que tener al menos 6 caracteres.');
}

/** Si el link de confirmación vuelve con error (vencido o ya usado), lo mostramos en vez de fallar en silencio. */
export function readAuthRedirectError(): string | null {
  const h = new URLSearchParams(location.hash.replace(/^#/, ''));
  const q = new URLSearchParams(location.search);
  const desc = h.get('error_description') || q.get('error_description');
  if (!desc) return null;
  history.replaceState(null, '', location.pathname);
  return /expired|invalid/i.test(desc)
    ? 'El link del email venció o ya se usó. Probá "Iniciar sesión"; si no entra, tocá "Reenviar email de confirmación".'
    : desc;
}

export async function signIn(email: string, password: string) {
  const c = getClient();
  if (!c) throw new Error('Primero configurá Supabase.');
  validate(email, password);
  const { error } = await c.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new Error(translateAuth(error.message));
}

export async function signUp(email: string, password: string): Promise<string> {
  const c = getClient();
  if (!c) throw new Error('Primero configurá Supabase.');
  validate(email, password);
  const { data, error } = await c.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: window.location.origin } });
  if (error) throw new Error(translateAuth(error.message));
  if (data.session) return 'Cuenta creada y sesión iniciada.';
  // Supabase no avisa si el email ya existe: devuelve un usuario sin identidades y no manda email.
  if (data.user && (data.user.identities?.length ?? 0) === 0)
    throw new Error('Ese email ya tiene cuenta. Tocá "Ya tengo cuenta" e iniciá sesión. Si no recordás la contraseña, usá "Olvidé mi contraseña".');
  return 'Te mandamos un email para confirmar la cuenta (mirá también en spam). Tocá el link y volvé a "Ya tengo cuenta".';
}

export async function resendConfirmation(email: string): Promise<string> {
  const c = getClient();
  if (!c) throw new Error('Primero configurá Supabase.');
  validate(email);
  const { error } = await c.auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: window.location.origin } });
  if (error) throw new Error(translateAuth(error.message));
  return 'Listo: te reenviamos el email de confirmación.';
}

export async function resetPassword(email: string): Promise<string> {
  const c = getClient();
  if (!c) throw new Error('Primero configurá Supabase.');
  validate(email);
  const { error } = await c.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
  if (error) throw new Error(translateAuth(error.message));
  return 'Te mandamos un email para elegir una contraseña nueva. Abrilo desde este mismo dispositivo.';
}

export async function updatePassword(password: string): Promise<string> {
  const c = getClient();
  if (!c) throw new Error('Primero configurá Supabase.');
  if (password.length < 6) throw new Error('La contraseña tiene que tener al menos 6 caracteres.');
  const { error } = await c.auth.updateUser({ password });
  if (error) throw new Error(translateAuth(error.message));
  set({ recovery: false });
  return 'Contraseña actualizada. Ya estás adentro.';
}

export async function signOut() {
  await getClient()?.auth.signOut();
}

function translateAuth(m: string): string {
  if (/invalid login/i.test(m)) return 'Email o contraseña incorrectos.';
  if (/not confirmed/i.test(m)) return 'Tenés que confirmar el email (revisá tu bandeja).';
  if (/password/i.test(m) && /6/.test(m)) return 'La contraseña debe tener al menos 6 caracteres.';
  if (/rate limit/i.test(m)) return 'Supabase limita los emails por hora. Esperá 1 hora, o desactivá "Confirm email" en Supabase (Authentication → Sign In / Providers → Email) y probá de nuevo.';
  if (/already registered|already exists/i.test(m)) return 'Ese email ya tiene cuenta: usá "Iniciar sesión".';
  if (/signups? not allowed|signup.*disabled/i.test(m)) return 'Los registros están desactivados en Supabase. Activá "Allow new users to sign up" en Authentication → Sign In / Providers.';
  if (/email.*(invalid|format)/i.test(m)) return 'El email no es válido. Revisá que no tenga espacios.';
  if (/fetch|network/i.test(m)) return 'Sin conexión con Supabase. Revisá internet o si el proyecto de Supabase está pausado.';
  if (/api key|apikey|jwt/i.test(m)) return 'La clave de Supabase no es válida. Revisá la URL y la publishable key.';
  return m;
}

let running: Promise<void> | null = null;

export function syncNow(): Promise<void> {
  if (running) return running;
  running = doSync().finally(() => (running = null));
  return running;
}

async function doSync() {
  const c = getClient();
  if (!c || !session) return;
  set({ busy: true });
  try {
    const userId = session.user.id;
    // Subir pendientes.
    const pending = store.dirtyRecords();
    for (let i = 0; i < pending.length; i += 300) {
      const chunk = pending.slice(i, i + 300);
      const rows = chunk.map((r) => ({
        user_id: userId,
        id: r.id,
        kind: r.kind,
        data: r,
        updated_at: r.updatedAt,
        deleted: !!r.deleted,
      }));
      const { error } = await c.from('yc_records').upsert(rows, { onConflict: 'user_id,id' });
      if (error) throw new Error(error.message);
      store.markClean(chunk);
    }
    // Bajar cambios (con solapamiento de 10 s para no perder escrituras concurrentes).
    let cursor = localStorage.getItem(CURSOR_KEY) ?? '1970-01-01T00:00:00Z';
    const since = new Date(new Date(cursor).getTime() - 10000).toISOString();
    let from = 0;
    for (;;) {
      const { data, error } = await c
        .from('yc_records')
        .select('data, server_ts')
        .gt('server_ts', since)
        .order('server_ts', { ascending: true })
        .range(from, from + 999);
      if (error) throw new Error(error.message);
      if (!data.length) break;
      store.merge(data.map((d) => d.data as AnyRec));
      const last = data[data.length - 1].server_ts as string;
      if (last > cursor) cursor = last;
      if (data.length < 1000) break;
      from += 1000;
    }
    localStorage.setItem(CURSOR_KEY, cursor);
    set({ busy: false, lastSync: Date.now(), error: null });
  } catch (e) {
    const msg = String((e as Error).message ?? e);
    set({
      busy: false,
      error: /relation .*yc_records.* does not exist|Could not find the table/i.test(msg)
        ? 'Falta crear la tabla en Supabase (paso 2 de la guía: pegar el SQL).'
        : /fetch/i.test(msg)
          ? 'Sin conexión. Los cambios quedan guardados y se suben después.'
          : msg,
    });
  }
}

/** Sincroniza al iniciar, tras cambios (con espera), al volver a la app y cada minuto. */
export function startAutoSync() {
  void initSync();
  let t: ReturnType<typeof setTimeout> | undefined;
  store.subscribe(() => {
    clearTimeout(t);
    t = setTimeout(() => void syncNow(), 2000);
  });
  window.addEventListener('online', () => void syncNow());
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void syncNow());
  setInterval(() => void syncNow(), 60000);
}

/** Token de la sesión actual (para llamar a funciones propias como el asistente). */
export async function getAccessToken(): Promise<string | null> {
  const c = getClient();
  if (!c) return null;
  const { data } = await c.auth.getSession();
  return data.session?.access_token ?? null;
}
