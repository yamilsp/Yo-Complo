import { useEffect, useRef, useState } from 'react';
import { useStore } from '../lib/store';
import { today } from '../lib/dates';
import { AREA, QUADRANT_LABEL, planId, type Profile } from '../lib/simple';
import { buildContext, type AssistantAction, type ChatMsg } from '../lib/assistant';
import { getAccessToken } from '../lib/sync';
import { toast } from '../ui';

const KEY = 'yc:chat';
const SUGGESTIONS = [
  'Tengo estas tareas hoy, ayudame a priorizar:\n- ',
  '¿Qué hago ahora?',
  'Revisá mi semana: ¿qué estoy evitando?',
  'No tengo ganas de arrancar. Ayudame.',
];

function load(): ChatMsg[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    return [];
  }
}

/** Asistente conversacional: propone acciones, vos confirmás cada una. */
export function Assistant({ p }: { p: Profile }) {
  const s = useStore();
  const [msgs, setMsgs] = useState<ChatMsg[]>(load);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(msgs.slice(-40)));
    } catch {
      /* sin almacenamiento */
    }
    end.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs]);

  const send = async (content: string) => {
    const t = content.trim();
    if (!t || busy) return;
    const next = [...msgs, { role: 'user' as const, content: t }];
    setMsgs(next);
    setText('');
    setError('');
    setBusy(true);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Iniciá sesión en Ajustes para usar el asistente.');
      const r = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ messages: next.map((m) => ({ role: m.role, content: m.content })), context: buildContext(s, p) }),
      });
      const data = await r.json().catch(() => ({ error: 'Respuesta inválida del servidor.' }));
      if (!r.ok) throw new Error(data.error || 'Error ' + r.status);
      setMsgs([...next, { role: 'assistant', content: data.reply, actions: data.actions ?? [], applied: (data.actions ?? []).map(() => false) }]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const apply = (mi: number, ai: number) => {
    const m = msgs[mi];
    const a = m.actions![ai];
    if (!applyAction(a)) return;
    setMsgs(msgs.map((x, i) => (i === mi ? { ...x, applied: x.applied!.map((v, j) => (j === ai ? true : v)) } : x)));
  };

  const applyAll = (mi: number) => {
    const m = msgs[mi];
    const applied = m.actions!.map((a, j) => m.applied![j] || applyAction(a));
    setMsgs(msgs.map((x, i) => (i === mi ? { ...x, applied } : x)));
  };

  const applyAction = (a: AssistantAction): boolean => {
    if (a.kind === 'hoy') {
      const plan = s.get('splan', planId(today()));
      if (!plan) {
        toast('Abrí Hoy primero para crear el plan del día.');
        return false;
      }
      s.update('splan', plan.id, { items: [...plan.items, { id: `${plan.date}-a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, area: a.area, title: a.title, min: a.minimo, minutes: a.minutes, done: false }] });
      toast('Agregada a Hoy');
    } else {
      s.create('snote', { kind: 'snote', text: a.title, area: a.area, quadrant: a.quadrant, status: 'open' });
      toast('Agregada a Ordenar');
    }
    return true;
  };

  return (
    <div className="s-chat">
      <div className="s-sec-head">
        <h1 className="s-h1">Asistente</h1>
        {msgs.length > 0 && <button className="s-btn text small" onClick={() => setMsgs([])}>Nueva charla</button>}
      </div>
      {msgs.length === 0 && (
        <div className="s-card s-tonal">
          <p className="small">Contale qué tenés que hacer o en qué te trabaste. Conoce tus metas, tu plan de hoy y tu registro. Propone acciones y vos decidís cuáles aplicar.</p>
          {SUGGESTIONS.map((q) => (
            <button key={q} className="s-option" onClick={() => (q.endsWith('- ') ? setText(q) : send(q))}>{q.split('\n')[0]}</button>
          ))}
        </div>
      )}
      {msgs.map((m, i) => (
        <div key={i} className={'s-msg ' + m.role}>
          <div className="s-bubble">{m.content}</div>
          {m.actions && m.actions.length > 0 && (
            <div className="s-actions">
              {m.actions.map((a, j) => (
                <div key={j} className="s-action">
                  <div>
                    <div className="small"><b>{a.title}</b></div>
                    <div className="s-item-meta">
                      <span className={'s-chip ' + AREA[a.area].color}>{AREA[a.area].label}</span>
                      <span>{a.kind === 'hoy' ? 'Hoy' : QUADRANT_LABEL[a.quadrant].title}</span>
                      <span>{a.minutes} min</span>
                    </div>
                  </div>
                  <button className={'s-btn small ' + (m.applied?.[j] ? 'text' : 'tonal')} disabled={m.applied?.[j]} onClick={() => apply(i, j)}>
                    {m.applied?.[j] ? '✓' : 'Aplicar'}
                  </button>
                </div>
              ))}
              {m.actions.length > 1 && m.applied?.some((v) => !v) && (
                <button className="s-btn text small" onClick={() => applyAll(i)}>Aplicar todas</button>
              )}
            </div>
          )}
        </div>
      ))}
      {busy && <div className="s-msg assistant"><div className="s-bubble s-typing">Pensando…</div></div>}
      {error && <p className="s-warn small">{error}</p>}
      <div ref={end} />
      <div className="s-composer">
        <textarea
          className="s-input"
          rows={Math.min(5, Math.max(1, text.split('\n').length))}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !/\n- $/.test(text)) {
              e.preventDefault();
              send(text);
            }
          }}
          placeholder="Escribile o dictale…"
        />
        <button className="s-btn filled" disabled={busy || !text.trim()} onClick={() => send(text)} aria-label="Enviar">➤</button>
      </div>
    </div>
  );
}
