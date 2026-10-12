import { useRef, useState, useSyncExternalStore } from 'react';
import { useStore } from '../lib/store';
import { getSettings, saveSettings } from '../lib/model';
import { clearConfig, getConfig, saveConfig, signIn, signOut, signUp, subscribeSync, syncNow, syncState } from '../lib/sync';
import { CSV_KINDS, download, exportCSV, exportJSON, parseBackup } from '../lib/export';
import { today } from '../lib/dates';
import { Field, NumInput, toast } from '../ui';

export function SettingsScreen() {
  const s = useStore();
  const st = useSyncExternalStore(subscribeSync, syncState);
  const cfg = getConfig();
  const settings = getSettings(s);
  const [url, setUrl] = useState(cfg?.url ?? '');
  const [key, setKey] = useState(cfg?.key ?? '');
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [msg, setMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const run = async (f: () => Promise<unknown> | unknown) => {
    setMsg('');
    try {
      const r = await f();
      if (typeof r === 'string') setMsg(r);
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  const importFile = async (file: File) => {
    try {
      const recs = parseBackup(await file.text());
      if (!confirm(`Reemplazar todos los datos de este dispositivo por ${recs.length} registros del respaldo?`)) return;
      s.replaceAll(recs, true);
      toast('Respaldo importado.');
    } catch (e) {
      toast((e as Error).message);
    }
  };

  return (
    <div className="screen">
      <h1>Ajustes</h1>

      <section className="card">
        <h3>Planificación</h3>
        <Field label="Tiempo libre por defecto (min)">
          <NumInput integer value={settings.defaultAvailableMin} onChange={(n) => n != null && saveSettings(s, { defaultAvailableMin: n })} />
        </Field>
        <Field label={`Factor de realismo: ${Math.round(settings.realism * 100)}%`} hint="Qué parte del tiempo libre se convierte en trabajo enfocado. Empieza en 60% (la gente subestima cuánto tarda). Ajustalo con tus datos de cumplimiento.">
          <input type="range" min={0.3} max={0.9} step={0.05} value={settings.realism} onChange={(e) => saveSettings(s, { realism: Number(e.target.value) })} />
        </Field>
      </section>

      <section className="card">
        <h3>Sincronización</h3>
        <p className="small">
          Estado:{' '}
          <b>
            {st.mode === 'local' ? 'solo este dispositivo' : st.mode === 'signed_out' ? 'falta iniciar sesión' : st.busy ? 'sincronizando…' : 'sincronizado'}
          </b>
          {st.lastSync && ` · ${new Date(st.lastSync).toLocaleTimeString('es-AR')}`}
          {` · ${s.pendingCount()} cambios pendientes`}
        </p>
        {st.error && <p className="error">{st.error}</p>}
        {st.mode === 'local' && (
          <>
            <Field label="Project URL"><input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://xxxx.supabase.co" /></Field>
            <Field label="Anon / publishable key"><input value={key} onChange={(e) => setKey(e.target.value)} /></Field>
            <button className="primary" onClick={() => run(() => saveConfig(url, key))}>Conectar</button>
          </>
        )}
        {st.mode === 'signed_out' && (
          <>
            <p className="small muted">Usá el mismo email y contraseña en el celular y en la compu.</p>
            <Field label="Email"><input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            <Field label="Contraseña"><input type="password" autoComplete="current-password" value={pass} onChange={(e) => setPass(e.target.value)} /></Field>
            <div className="actions left">
              <button className="primary" onClick={() => run(() => signIn(email, pass))}>Iniciar sesión</button>
              <button className="ghost" onClick={() => run(() => signUp(email, pass))}>Crear cuenta</button>
            </div>
          </>
        )}
        {st.mode === 'ready' && (
          <div className="actions left">
            <span className="small">{st.email}</span>
            <button className="ghost" onClick={() => run(syncNow)}>Sincronizar ahora</button>
            <button className="ghost" onClick={() => run(signOut)}>Cerrar sesión</button>
          </div>
        )}
        {st.mode !== 'local' && <button className="ghost small danger" onClick={() => confirm('¿Desconectar Supabase en este dispositivo? Los datos locales se mantienen.') && clearConfig()}>Desconectar Supabase</button>}
        {msg && <p className="small">{msg}</p>}
      </section>

      <section className="card">
        <h3>Respaldo y exportación</h3>
        <div className="actions left wrap">
          <button className="ghost" onClick={() => download(`yo-complo-${today()}.json`, exportJSON(s), 'application/json')}>Respaldo JSON</button>
          {CSV_KINDS.map(([k, name]) => (
            <button key={k} className="ghost small" onClick={() => download(`${name}-${today()}.csv`, exportCSV(s, k), 'text/csv')}>CSV {name}</button>
          ))}
        </div>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
        <button className="ghost small" onClick={() => fileRef.current?.click()}>Importar respaldo JSON</button>
        {s.persistError && <p className="error">{s.persistError}</p>}
      </section>
    </div>
  );
}
