import { daysBetween } from './dates';

/**
 * Ideas de "Hábitos Atómicos" (James Clear) y "El Efecto Compuesto" (Darren Hardy),
 * resumidas en castellano (paráfrasis, no citas textuales). Una distinta por día.
 */
export interface Quote {
  text: string;
  source: 'Hábitos Atómicos' | 'El Efecto Compuesto';
}

const HA = 'Hábitos Atómicos' as const;
const EC = 'El Efecto Compuesto' as const;

export const QUOTES: Quote[] = [
  { text: 'Mejorar un 1% cada día parece poco, pero en un año te cambia la vida.', source: HA },
  { text: 'Pequeñas decisiones inteligentes, constancia y tiempo producen una diferencia radical.', source: EC },
  { text: 'No subís al nivel de tus metas: caés al nivel de tus sistemas.', source: HA },
  { text: 'No importa lo que hacés de vez en cuando, sino lo que hacés todos los días.', source: EC },
  { text: 'Cada acción es un voto por la persona que querés ser.', source: HA },
  { text: 'Al principio los resultados no se ven. Seguí aunque nadie aplauda todavía.', source: EC },
  { text: 'Hacelo obvio, atractivo, fácil y satisfactorio.', source: HA },
  { text: 'Hacete 100% responsable de tus resultados: ahí empieza el cambio.', source: EC },
  { text: 'Cualquier hábito nuevo debería poder empezarse en dos minutos.', source: HA },
  { text: 'Registrá lo que querés mejorar: lo que no se mide, no cambia.', source: EC },
  { text: 'Fallar un día es un accidente. Nunca falles dos veces seguidas.', source: HA },
  { text: 'Arrancar el impulso cuesta; mantenerlo es mucho más fácil. No lo cortes.', source: EC },
  { text: 'El entorno le gana a la motivación: diseñalo a tu favor.', source: HA },
  { text: 'Las pequeñas malas decisiones también se acumulan, en silencio.', source: EC },
  { text: 'Los hábitos son el interés compuesto de la superación personal.', source: HA },
  { text: 'Ganá la mañana y vas a ganar el día.', source: EC },
  { text: 'Enfocate en quién querés ser, no solo en lo que querés lograr.', source: HA },
  { text: 'Hacé un poco más de lo que se espera: ahí está la diferencia.', source: EC },
  { text: 'Planificar no es actuar. El movimiento no reemplaza la acción.', source: HA },
  { text: 'El ritmo y la rutina le ganan a la intensidad de un día.', source: EC },
  { text: 'Apilá hábitos: "después de [lo que ya hacés], voy a [lo nuevo]".', source: HA },
  { text: 'Tu "por qué" te da la fuerza para hacer lo que cuesta.', source: EC },
  { text: 'Quitá fricción a lo bueno y ponele fricción a lo malo.', source: HA },
  { text: 'Elegí bien tus influencias: lo que mirás y con quién andás te moldea.', source: EC },
  { text: 'Antes del gran salto hay una meseta: el progreso se está acumulando aunque no lo veas.', source: HA },
  { text: 'Lo que es fácil de hacer también es fácil de no hacer. Hacelo igual.', source: EC },
  { text: 'Una intención sin día, hora y lugar es solo un deseo.', source: HA },
  { text: 'Los grandes resultados son la suma de pasos chicos que nadie ve.', source: EC },
  { text: 'El objetivo no es correr una maratón: es convertirte en corredor.', source: HA },
  { text: 'Celebrá los avances chicos: el progreso visible alimenta la constancia.', source: EC },
  { text: 'La motivación aparece después de empezar, no antes.', source: HA },
  { text: 'Cambiá un hábito por vez y sostenelo hasta que salga solo.', source: EC },
];

export function quoteForDate(date: string): Quote {
  const n = Math.abs(daysBetween('2026-01-01', date));
  return QUOTES[n % QUOTES.length];
}
