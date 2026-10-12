import { useEffect, useRef, useState, type ReactNode } from 'react';
import { parseNum } from './lib/dates';

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="ghost" onClick={onClose} aria-label="Cerrar">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Chips<T extends string | number>({
  value, options, onChange,
}: { value: T | undefined; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="chips">
      {options.map(([v, label]) => (
        <button key={String(v)} type="button" className={'chip' + (v === value ? ' on' : '')} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="field" role="group" aria-label={label}>
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </div>
  );
}

export function Bar({ value, tone }: { value: number; tone?: 'ok' | 'warn' | 'bad' }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="bar">
      <div className={'bar-fill ' + (tone ?? '')} style={{ width: `${v * 100}%` }} />
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

let toastFn: ((m: string) => void) | null = null;
export const setToaster = (f: (m: string) => void) => (toastFn = f);
export const toast = (m: string) => toastFn?.(m);

/** Campo numérico tolerante: acepta "1.500.000", "1500,5", "$ 2.000". Nunca muestra NaN. */
export function NumInput({ value, onChange, placeholder, integer }: {
  value: number | null | undefined; onChange: (n: number | null) => void; placeholder?: string; integer?: boolean;
}) {
  const fmt = (n: number | null | undefined) => (n == null || !isFinite(n) ? '' : n.toLocaleString('es-AR', { maximumFractionDigits: 2 }));
  const [text, setText] = useState(fmt(value));
  const [bad, setBad] = useState(false);
  const focused = useRef(false);
  // Solo se re-sincroniza desde afuera cuando no se está escribiendo.
  useEffect(() => {
    if (!focused.current) setText(fmt(value));
  }, [value]);
  return (
    <>
      <input
        inputMode={integer ? 'numeric' : 'decimal'}
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          setText(e.target.value);
          const n = parseNum(e.target.value);
          setBad(e.target.value.trim() !== '' && n == null);
          onChange(n == null ? null : integer ? Math.round(n) : n);
        }}
        onFocus={(e) => {
          focused.current = true;
          e.target.select();
        }}
        onBlur={() => {
          focused.current = false;
          if (!bad) setText(fmt(parseNum(text)));
        }}
      />
      {bad && <small className="error">Escribí solo números (ej.: 1.500.000)</small>}
    </>
  );
}
