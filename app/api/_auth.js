// Compartido por las funciones de IA (los archivos con "_" no son rutas en Vercel).
// Exige sesión de Supabase y, si se define ALLOWED_EMAILS, que el email esté en la lista.
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://wdpdjnxoadtdeytraxun.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_bcy1I7sP1Ek9UQQNgwAA8w_WQE64qpQ';

export function bad(res, code, msg) {
  return res.status(code).json({ error: msg });
}

/** Devuelve el usuario o responde el error y devuelve null. */
export async function requireUser(req, res) {
  if (req.method !== 'POST') return bad(res, 405, 'Método no permitido'), null;
  if (!process.env.ANTHROPIC_API_KEY)
    return bad(res, 503, 'La IA todavía no está activada: falta cargar la clave de Anthropic (ANTHROPIC_API_KEY) en Vercel y redeployar.'), null;
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return bad(res, 401, 'Iniciá sesión en Ajustes para usar la IA.'), null;
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) return bad(res, 401, 'Tu sesión venció. Volvé a iniciar sesión en Ajustes.'), null;
  const allowed = (process.env.ALLOWED_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (allowed.length && !allowed.includes((data.user.email || '').toLowerCase())) return bad(res, 403, 'Este usuario no tiene acceso a la IA.'), null;
  return data.user;
}

export function parseBody(req) {
  return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
}

/** Traduce errores del SDK de Anthropic a mensajes claros. */
export function anthropicError(Anthropic, res, error) {
  if (error instanceof Anthropic.AuthenticationError) return bad(res, 500, 'La clave de Anthropic no es válida. Revisala en Vercel.');
  if (error instanceof Anthropic.PermissionDeniedError) return bad(res, 500, 'La clave de Anthropic no tiene permiso para este modelo.');
  if (error instanceof Anthropic.RateLimitError) return bad(res, 429, 'Demasiados pedidos seguidos. Esperá un minuto.');
  if (error instanceof Anthropic.BadRequestError) {
    const m = String(error.message || '');
    if (/credit|balance|billing/i.test(m)) return bad(res, 402, 'Te quedaste sin crédito en Anthropic. Cargá saldo en console.anthropic.com → Billing.');
    return bad(res, 400, 'Pedido inválido: ' + m.slice(0, 160));
  }
  if (error instanceof Anthropic.APIError) return bad(res, 502, `Error de Anthropic (${error.status}). Probá de nuevo.`);
  return bad(res, 502, 'No se pudo contactar a la IA.');
}
