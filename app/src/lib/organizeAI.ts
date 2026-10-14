import { getAccessToken } from './sync';
import type { Area, Quadrant } from './simple';

export interface AIOrganized {
  index: number;
  text: string;
  area: Area;
  quadrant: Quadrant;
  due: string;
  reason: string;
}

/** Pide a la IA que ordene tareas con el contexto de tus metas. Lanza un error legible si no puede. */
export async function aiOrganize(tasks: string[], context: string): Promise<{ items: AIOrganized[]; summary: string }> {
  const token = await getAccessToken();
  if (!token) throw new Error('iniciá sesión en Ajustes para usar la IA');
  const r = await fetch('/api/organize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ tasks, context }),
  });
  const data = await r.json().catch(() => ({ error: 'respuesta inválida del servidor' }));
  if (!r.ok) throw new Error(data.error || 'error ' + r.status);
  return data;
}
