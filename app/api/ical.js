// Función de Vercel: trae el feed iCal privado de Google Calendar (el navegador no puede por CORS).
// Solo acepta direcciones de calendar.google.com para no funcionar como proxy abierto.
export default async function handler(req, res) {
  const url = typeof req.query.url === 'string' ? req.query.url : '';
  let u;
  try {
    u = new URL(url);
  } catch {
    return res.status(400).send('URL inválida');
  }
  if (u.protocol !== 'https:' || u.hostname !== 'calendar.google.com' || !u.pathname.startsWith('/calendar/ical/')) {
    return res.status(400).send('Solo se aceptan direcciones iCal de Google Calendar');
  }
  try {
    const r = await fetch(u.toString(), { redirect: 'follow' });
    if (!r.ok) return res.status(502).send('Google respondió ' + r.status);
    const text = await r.text();
    if (!text.startsWith('BEGIN:VCALENDAR')) return res.status(502).send('La respuesta no es un calendario');
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.status(200).send(text);
  } catch (e) {
    return res.status(502).send('No se pudo leer el calendario');
  }
}
