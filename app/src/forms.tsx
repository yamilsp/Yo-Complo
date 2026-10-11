import { useState } from 'react';
import { useStore } from './lib/store';
import type { MissCause, ResultKind, Task, TaskType } from './lib/types';
import { CAUSE_LABEL, RESULT_LABEL, ROLE_LABEL } from './lib/types';
import { newTask } from './lib/actions';
import { today } from './lib/dates';
import { Chips, Field, Sheet, Toggle, toast } from './ui';

const CAUSES = Object.entries(CAUSE_LABEL) as [MissCause, string][];

export function CausePicker({ value, onChange }: { value?: MissCause; onChange: (c: MissCause) => void }) {
  return <Chips value={value} options={CAUSES} onChange={onChange} />;
}

/** Alta/edición de una acción. Pocos campos; lo demás tiene valores por defecto razonables. */
export function TaskSheet({ task, defaults, onClose }: { task?: Task; defaults?: Partial<Task>; onClose: () => void }) {
  const s = useStore();
  const projects = s.all('project').filter((p) => p.status === 'active' || p.id === task?.projectId);
  const [f, setF] = useState<Partial<Task>>(task ?? { type: 'result', importance: 2, impact: 2, estimateMin: 45, energy: 'high', ...defaults });
  const [err, setErr] = useState('');
  const up = (p: Partial<Task>) => setF((x) => ({ ...x, ...p }));

  const save = () => {
    try {
      if (!f.title?.trim()) throw new Error('Escribí la acción: verbo + objeto + cantidad.');
      if (!f.estimateMin || f.estimateMin < 5) throw new Error('Estimá al menos 5 minutos.');
      if (task) s.update('task', task.id, { ...f, title: f.title.trim() });
      else newTask(s, f as Partial<Task> & { title: string });
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <Sheet title={task ? 'Editar acción' : 'Nueva acción'} onClose={onClose}>
      <Field label="Acción" hint='Concreta y verificable. Ej.: "Enviar 5 mensajes a administradores de consorcio".'>
        <input autoFocus value={f.title ?? ''} onChange={(e) => up({ title: e.target.value })} />
      </Field>
      <Field label="Tipo" hint="Resultado: cambia algo verificable (cliente, venta, respuesta). Preparación: investigar, diseñar, mejorar.">
        <Chips<TaskType> value={f.type} options={[['result', 'Resultado'], ['prep', 'Preparación'], ['maintenance', 'Operación']]} onChange={(v) => up({ type: v })} />
      </Field>
      <div className="row">
        <Toggle checked={!!f.commercial} onChange={(v) => up({ commercial: v })} label="Comercial (vender, prospectar, seguir)" />
        <Toggle checked={!!f.avoided} onChange={(v) => up({ avoided: v })} label="La vengo evitando" />
      </div>
      <Field label="Proyecto">
        <select value={f.projectId ?? ''} onChange={(e) => up({ projectId: e.target.value || undefined })}>
          <option value="">— Sin proyecto —</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.title} · {ROLE_LABEL[p.role]}</option>
          ))}
        </select>
      </Field>
      <div className="grid2">
        <Field label="Importancia">
          <Chips<number> value={f.importance} options={[[1, 'Baja'], [2, 'Media'], [3, 'Alta']]} onChange={(v) => up({ importance: v as 1 | 2 | 3 })} />
        </Field>
        <Field label="Impacto económico">
          <Chips<number> value={f.impact} options={[[1, 'Bajo'], [2, 'Medio'], [3, 'Alto']]} onChange={(v) => up({ impact: v as 1 | 2 | 3 })} />
        </Field>
      </div>
      <div className="grid2">
        <Field label="Minutos estimados">
          <input type="number" inputMode="numeric" min={5} step={5} value={f.estimateMin ?? ''} onChange={(e) => up({ estimateMin: Number(e.target.value) })} />
        </Field>
        <Field label="Fecha límite real">
          <input type="date" value={f.dueDate ?? ''} onChange={(e) => up({ dueDate: e.target.value || undefined })} />
        </Field>
      </div>
      <Field label="Energía que requiere">
        <Chips value={f.energy} options={[['low', 'Poca'], ['high', 'Mucha']]} onChange={(v) => up({ energy: v as 'low' | 'high' })} />
      </Field>
      {err && <p className="error">{err}</p>}
      <div className="actions">
        {task && (
          <button className="ghost danger" onClick={() => { s.remove(task.id); onClose(); }}>Borrar</button>
        )}
        <button className="primary" onClick={save}>Guardar</button>
      </div>
    </Sheet>
  );
}

/** Registro rápido de un resultado (con evidencia) u obstáculo. */
export function LogSheet({ onClose, taskId, initial }: { onClose: () => void; taskId?: string; initial?: 'result' | 'obstacle' | 'idea' }) {
  const s = useStore();
  const [mode, setMode] = useState<'result' | 'obstacle' | 'idea'>(initial ?? 'result');
  const [type, setType] = useState<ResultKind>('contact');
  const [qty, setQty] = useState(1);
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<'ARS' | 'USD'>('ARS');
  const [note, setNote] = useState('');
  const [cause, setCause] = useState<MissCause>();
  const [err, setErr] = useState('');
  const money = type === 'income' || type === 'saving';

  const save = () => {
    const date = today();
    if (mode === 'result') {
      const a = Number(amount.replace(/\./g, '').replace(',', '.'));
      if (money && (!amount || !isFinite(a) || a === 0)) return setErr('Ingresá un monto (negativo si retirás ahorro).');
      if (!money && (!qty || qty < 1)) return setErr('La cantidad debe ser 1 o más.');
      s.create('result', {
        kind: 'result', date, type, qty: money ? 1 : qty, amount: money ? a : undefined, currency: money ? currency : undefined,
        note: note.trim() || undefined, taskId,
        projectId: taskId ? s.get('task', taskId)?.projectId : undefined,
      });
      toast('Resultado registrado');
    } else if (mode === 'obstacle') {
      if (!cause) return setErr('Elegí la causa principal.');
      s.create('obstacle', { kind: 'obstacle', date, cause, note: note.trim() || undefined, taskId });
      toast('Obstáculo registrado');
    } else {
      if (!note.trim()) return setErr('Escribí la idea.');
      s.create('idea', { kind: 'idea', title: note.trim(), status: 'waiting' });
      toast('Idea guardada en espera. No compite con tu plan.');
    }
    onClose();
  };

  return (
    <Sheet title="Registrar" onClose={onClose}>
      <Chips value={mode} options={[['result', 'Resultado'], ['obstacle', 'Obstáculo'], ['idea', 'Idea nueva']]} onChange={(m) => { setMode(m); setErr(''); }} />
      {mode === 'result' && (
        <>
          <Chips<ResultKind> value={type} options={Object.entries(RESULT_LABEL) as [ResultKind, string][]} onChange={setType} />
          {money ? (
            <div className="grid2">
              <Field label="Monto">
                <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
              </Field>
              <Field label="Moneda">
                <Chips value={currency} options={[['ARS', 'ARS'], ['USD', 'USD']]} onChange={(v) => setCurrency(v as 'ARS' | 'USD')} />
              </Field>
            </div>
          ) : (
            <Field label="Cantidad">
              <div className="stepper">
                <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))}>−</button>
                <span>{qty}</span>
                <button type="button" onClick={() => setQty((q) => q + 1)}>+</button>
              </div>
            </Field>
          )}
          <Field label="Nota / evidencia (opcional)">
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej.: 2 respondieron, 1 pidió presupuesto" />
          </Field>
        </>
      )}
      {mode === 'obstacle' && (
        <>
          <Field label="Causa principal">
            <CausePicker value={cause} onChange={setCause} />
          </Field>
          <Field label="Detalle (opcional)">
            <input value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </>
      )}
      {mode === 'idea' && (
        <Field label="Idea" hint="Se guarda en la lista de espera. La revisás en la revisión semanal, no ahora.">
          <input autoFocus value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      )}
      {err && <p className="error">{err}</p>}
      <div className="actions">
        <button className="primary" onClick={save}>Guardar</button>
      </div>
    </Sheet>
  );
}
