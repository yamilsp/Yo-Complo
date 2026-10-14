// Función de Vercel: asistente de Yo Cumplo con Claude Haiku 5.5.
// La clave ANTHROPIC_API_KEY vive solo en Vercel (variable de entorno), nunca en la app.
// Solo responde a usuarios con sesión de Supabase (y, si se define, a los emails de ALLOWED_EMAILS).
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { anthropicError, bad, parseBody, requireUser } from './_auth.js';
const MAX_TURNS = 20;
const MAX_CHARS = 4000;

const AREAS = ['caja', 'social', 'salud', 'experimento', 'imagen', 'fijo', 'extra'];

const Reply = z.object({
  reply: z.string(),
  actions: z.array(
    z.object({
      // Texto con valores sugeridos: si el modelo se desvía, la app lo normaliza en vez de fallar.
      kind: z.string().describe('hoy | ordenar'),
      title: z.string(),
      area: z.string().describe(AREAS.join(' | ')),
      quadrant: z.string().describe('hacer | agendar | delegar | eliminar | idea'),
      minutes: z.number().int(),
      minimo: z.string(),
    }),
  ),
});

const SYSTEM = `Sos el asistente personal de Yo Cumplo, una app de ejecución. Hablás en castellano rioplatense (voseo), corto y directo.

Tu trabajo: ayudar al usuario a decidir qué hacer, priorizar y cumplir. No motivás con frases vacías ni le das la razón: señalás con sus datos lo que está evitando y proponés acciones concretas y verificables.

Prioridad de sus metas, en este orden: 1) plata (caja: clientes de El Roble, cobros, presupuestos, empleo), 2) relaciones (eventos, gente nueva), 3) salud.

Herramientas que usás:
- Matriz de Eisenhower: hacer hoy (importante y urgente), agendar (importante, no urgente), delegar (urgente, no importante), eliminar (ninguna). Las ideas nuevas de negocio van a "idea" (en espera): una sola idea se prueba por vez.
- Hábitos Atómicos: hacerlo obvio, atractivo, fácil (regla de 2 minutos, versión mínima) y satisfactorio; nunca fallar dos veces; diseño del entorno. Para malos hábitos (celular), aumentar la fricción.
- El Efecto Compuesto: pequeñas acciones constantes y medir la tendencia.

Reglas:
- Usá solo los datos del bloque <contexto>. No inventes números ni hechos.
- Si te pasan una lista de tareas, clasificá cada una y proponé como máximo 3 para "hoy" (al menos una de caja si existe). El resto va a "ordenar" con su cuadrante.
- Cada acción: título concreto (verbo + qué + cuánto), minutos realistas y una versión mínima de 2 minutos.
- Si no hace falta proponer acciones, devolvé la lista vacía.
- Respuesta ("reply"): máximo 6 líneas. Sin títulos ni markdown pesado; podés usar guiones.
- Las acciones son propuestas: el usuario las confirma en la app.
- Tiende al perfeccionismo, a querer hacer todo a la vez y a invertir horas en cosas que nadie ve. Para proyectos o contenidos: proponé una versión 1 chica con tiempo máximo y a quién mostrársela antes de seguir. Una sola cosa por vez.`;

export default async function handler(req, res) {
  if (!(await requireUser(req, res))) return;

  const body = parseBody(req);
  const history = Array.isArray(body.messages) ? body.messages : [];
  const context = typeof body.context === 'string' ? body.context.slice(0, 12000) : '';
  const turns = history
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-MAX_TURNS)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));
  while (turns.length && turns[0].role !== 'user') turns.shift();
  if (!turns.length || turns[turns.length - 1].role !== 'user') return bad(res, 400, 'Falta tu mensaje.');

  // El contexto del día va en el último mensaje del usuario: el prompt de sistema queda fijo.
  const last = turns[turns.length - 1];
  last.content = `<contexto>\n${context}\n</contexto>\n\n${last.content}`;

  const client = new Anthropic();
  try {
    const response = await client.messages.parse({
      model: 'claude-haiku-5-5',
      max_tokens: 4096,
      system: SYSTEM,
      output_config: { effort: 'low', format: zodOutputFormat(Reply) },
      messages: turns,
    });
    if (response.stop_reason === 'refusal') return res.status(200).json({ reply: 'No puedo ayudarte con eso. Probá reformularlo.', actions: [] });
    if (response.stop_reason === 'max_tokens' || !response.parsed_output) return bad(res, 502, 'La respuesta salió incompleta. Probá de nuevo con un mensaje más corto.');
    const out = response.parsed_output;
    const actions = out.actions.slice(0, 10).map((a) => ({
      kind: a.kind === 'hoy' ? 'hoy' : 'ordenar',
      title: a.title.slice(0, 200),
      area: AREAS.includes(a.area) ? a.area : 'extra',
      quadrant: ['hacer', 'agendar', 'delegar', 'eliminar', 'idea'].includes(a.quadrant) ? a.quadrant : 'agendar',
      minutes: Math.max(5, Math.min(240, a.minutes || 30)),
      minimo: a.minimo.slice(0, 120) || 'Empezar 2 minutos',
    }));
    return res.status(200).json({ reply: out.reply, actions });
  } catch (error) {
    return anthropicError(Anthropic, res, error);
  }
}
