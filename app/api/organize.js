// Función de Vercel: ordena tareas con IA (Claude Haiku 5.5) según las metas del usuario.
// Recibe tareas y el contexto de la app; devuelve área, cuadrante de Eisenhower, fecha límite y un porqué corto.
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { anthropicError, bad, parseBody, requireUser } from './_auth.js';

const AREAS = ['caja', 'experimento', 'social', 'salud', 'fijo', 'imagen', 'extra'];
const QUADS = ['hacer', 'agendar', 'delegar', 'eliminar', 'idea'];
const MAX_TASKS = 40;

const Result = z.object({
  items: z.array(
    z.object({
      index: z.number().int(),
      text: z.string(),
      area: z.string().describe(AREAS.join(' | ')),
      quadrant: z.string().describe(QUADS.join(' | ')),
      due: z.string().describe('YYYY-MM-DD o vacío si no hay fecha real'),
      reason: z.string(),
    }),
  ),
  summary: z.string(),
});

const SYSTEM = `Ordenás las tareas de una persona con la matriz de Eisenhower, según SUS metas. Castellano rioplatense.

Prioridades del usuario, en este orden:
1. caja: lo que genera plata ya (clientes de su negocio de jardinería El Roble, presupuestos, cobros, seguimiento, marketing que trae clientes, búsqueda de empleo). Su mínimo mensual todavía no está cubierto: esto pesa más que todo.
2. experimento: su único experimento de ingreso extra activo (los demás proyectos nuevos son "idea").
3. social: relaciones, eventos, conocer gente nueva, cumpleaños.
4. salud: gym, fútbol, médico, comida, sueño.
5. fijo: tareas de la casa y trámites (limpieza, ropa, compras, pagos, reparaciones).
6. imagen: ropa, corte, cuidado personal.
7. extra: lo que no encaja.

Cuadrantes:
- hacer: importante Y urgente (vence hoy o mañana, o perderla cuesta plata o una relación). Máximo 3 en total; si hay más, dejá las 3 de mayor impacto y pasá el resto a agendar con fecha.
- agendar: importante, no urgente. Poné una fecha sugerida realista en "due" (formato YYYY-MM-DD) si la persona no dio una.
- delegar: urgente pero de bajo valor para sus metas (se puede pedir a otro, automatizar o resolver en 5 minutos).
- eliminar: ni importante ni urgente (ocio, investigar sin propósito, pulir algo que nadie pidió).
- idea: proyectos o negocios nuevos que no son el experimento activo. No compiten con el plan.

Reglas:
- Usá la fecha de hoy del contexto para interpretar "hoy", "mañana", "el viernes", "20/12". Si no hay fecha real, dejá "due" vacío (salvo en agendar, donde sugerís una).
- "text": la tarea reescrita clara y concreta (verbo + qué), sin la fecha. No inventes datos.
- "reason": por qué ese cuadrante, en 12 palabras o menos, conectado a sus metas.
- Devolvé un item por cada tarea, con el mismo "index" que recibiste.
- "summary": 1 o 2 líneas con la recomendación principal (qué hacer primero).`;

export default async function handler(req, res) {
  if (!(await requireUser(req, res))) return;
  const body = parseBody(req);
  const tasks = (Array.isArray(body.tasks) ? body.tasks : [])
    .filter((t) => typeof t === 'string' && t.trim())
    .slice(0, MAX_TASKS)
    .map((t) => t.slice(0, 300));
  if (!tasks.length) return bad(res, 400, 'No hay tareas para ordenar.');
  const context = typeof body.context === 'string' ? body.context.slice(0, 12000) : '';
  const list = tasks.map((t, i) => `${i}. ${t}`).join('\n');

  const client = new Anthropic();
  try {
    const response = await client.messages.parse({
      model: 'claude-haiku-5-5',
      max_tokens: 8000,
      system: SYSTEM,
      output_config: { effort: 'medium', format: zodOutputFormat(Result) },
      messages: [{ role: 'user', content: `<contexto>\n${context}\n</contexto>\n\nTareas:\n${list}` }],
    });
    if (response.stop_reason === 'refusal') return bad(res, 422, 'La IA no pudo ordenar estas tareas.');
    if (response.stop_reason === 'max_tokens' || !response.parsed_output) return bad(res, 502, 'La respuesta salió incompleta. Probá con menos tareas.');
    const out = response.parsed_output;
    const items = out.items
      .filter((x) => Number.isInteger(x.index) && x.index >= 0 && x.index < tasks.length)
      .map((x) => ({
        index: x.index,
        text: (x.text || tasks[x.index]).slice(0, 200),
        area: AREAS.includes(x.area) ? x.area : 'extra',
        quadrant: QUADS.includes(x.quadrant) ? x.quadrant : 'agendar',
        due: /^\d{4}-\d{2}-\d{2}$/.test(x.due) ? x.due : '',
        reason: (x.reason || '').slice(0, 140),
      }));
    return res.status(200).json({ items, summary: (out.summary || '').slice(0, 300) });
  } catch (error) {
    return anthropicError(Anthropic, res, error);
  }
}
