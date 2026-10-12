/**
 * Avisos locales. Funcionan mientras la app está abierta o en segundo plano reciente.
 * Para avisos garantizados a una hora exacta (con la app cerrada) usamos Google Calendar.
 */
export interface NotifyPrefs {
  enabled: boolean;
  morning: string;
  evening: string;
  beforeMin: number;
}

const KEY = 'yc:notify';
const SENT = 'yc:notified';
export const DEFAULT_NOTIFY: NotifyPrefs = { enabled: false, morning: '08:30', evening: '21:00', beforeMin: 10 };

export function getNotifyPrefs(): NotifyPrefs {
  try {
    return { ...DEFAULT_NOTIFY, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return DEFAULT_NOTIFY;
  }
}

export function saveNotifyPrefs(p: NotifyPrefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* sin almacenamiento */
  }
}

export function notifySupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export async function requestNotifyPermission(): Promise<NotificationPermission> {
  if (!notifySupported()) return 'denied';
  if (Notification.permission === 'granted') return 'granted';
  return Notification.requestPermission();
}

export async function notify(title: string, body: string, tag: string) {
  if (!notifySupported() || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(title, { body, tag, icon: '/icon.svg', badge: '/icon.svg' });
    else new Notification(title, { body, tag, icon: '/icon.svg' });
  } catch {
    /* algunos navegadores no permiten notificar desde la página */
  }
}

/** Envía un aviso una sola vez por clave (por día). */
export function notifyOnce(key: string, title: string, body: string) {
  let sent: string[] = [];
  try {
    sent = JSON.parse(localStorage.getItem(SENT) || '[]');
  } catch {
    sent = [];
  }
  if (sent.includes(key)) return;
  sent = [...sent.slice(-200), key];
  try {
    localStorage.setItem(SENT, JSON.stringify(sent));
  } catch {
    /* sin almacenamiento */
  }
  void notify(title, body, key);
}

export interface ReminderData {
  date: string;
  nowHHMM: string;
  items: { id: string; title: string; time?: string; done: boolean }[];
  due: { id: string; text: string; due: string }[];
  closed: boolean;
}

/** Qué avisar ahora. Pura: se testea sin navegador. */
export function dueReminders(p: NotifyPrefs, d: ReminderData): { key: string; title: string; body: string }[] {
  if (!p.enabled) return [];
  const out: { key: string; title: string; body: string }[] = [];
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const now = toMin(d.nowHHMM);
  if (now >= toMin(p.morning) && now < toMin(p.morning) + 120) {
    const today = d.due.filter((x) => x.due <= d.date);
    out.push({
      key: `${d.date}-morning`,
      title: 'Buen día: ¿qué hacés primero?',
      body: today.length ? `Hoy vence: ${today.map((x) => x.text).slice(0, 2).join(', ')}. Abrí la app y empezá por la caja.` : 'Abrí la app, elegí la primera acción y empezá con 2 minutos.',
    });
  }
  if (!d.closed && now >= toMin(p.evening) && now < toMin(p.evening) + 180)
    out.push({ key: `${d.date}-evening`, title: 'Cerrá el día (1 minuto)', body: 'Marcá lo que hiciste, registrá mensajes y celular, y dejá listo mañana.' });
  for (const it of d.items) {
    if (it.done || !it.time) continue;
    const diff = toMin(it.time) - now;
    if (diff >= 0 && diff <= p.beforeMin) out.push({ key: `${d.date}-item-${it.id}`, title: `En ${diff} min: ${it.title}`, body: 'Celular a un lado. Empezá con la versión de 2 minutos.' });
  }
  return out;
}
