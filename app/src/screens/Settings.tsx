import { useRef, useState, useSyncExternalStore } from 'react';
import { useStore } from '../lib/store';
import { getSettings, saveSettings } from '../lib/model';
import { clearConfig, getConfig, readAuthRedirectError, resendConfirmation, resetPassword, saveConfig, signIn, signOut, signUp, subscribeSync, syncNow, syncState, updatePassword } from '../lib/sync';
import { CSV_KINDS, download, exportCSV, exportJSON, parseBackup } from '../lib/export';
import { today } from '../lib/dates';
import { Field, NumInput, toast } from '../ui';
import { getTheme, setTheme, type Theme } from '../lib/theme';

export function SettingsScreen({ simple, onSimple }: { simple?: boolean; onSimple?: () => void } = {}) {
  const s = useStore();
  const st = useSyncExternalStore(subscribeSync, syncState);
  const cfg = getConfig();
  const settings = getSettings(s);
  const [url, setUrl] = useState(cfg?.url ?? '');
  const [key, setKey] = useState(cfg?.key ?? '');
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [msg, setMsg] = useState(() => readAuthRedirectError() ?? '');
  const [authTab, setAuthTab] = useState<'signup' | 'signin'>('signin');
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [theme, setThemeState] = useState<Theme>(getTheme);

  const run = async (f: () => Promise<unknown> | unknown) => {
    setMsg('');
    setBusy(true);
    try {
      const r = await f();
      if (typeof r === 'string') setMsg(r);
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
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
      {!simple && <h1>Ajustes</h1>}
      {onSimple && (
        <section className="card">
          <button className="primary block" onClick={onSimple}>Volver al modo simple</button>
        </section>
      )}

      <section className="card">
        <h3>Apariencia</h3>
        <div className="chips">
          {([['system', 'Como el teléfono'], ['light', 'Claro'], ['dark', 'Oscuro']] as [Theme, string][]).map(([t, l]) => (
            <button key={t} type="button" className={'chip' + (theme === t ? ' on' : '')} onClick={() => { setTheme(t); setThemeState(t); }}>{l}</button>
          ))}
        </div>
      </section>

      {!simple && <section className="card">
        <h3>Planificación</h3>
        <Field label="Tiempo libre por defecto (min)">
          <NumInput integer value={settings.defaultAvailableMin} onChange={(n) => n != null && saveSettings(s, { defaultAvailableMin: n })} />
        </Field>
        <Field label={`Factor de realismo: ${Math.round(settings.realism * 100)}%`} hint="Qué parte del tiempo libre se convierte en trabajo enfocado. Empieza en 60% (la gente subestima cuánto tarda). Ajustalo con tus datos de cumplimiento.">
          <input type="range" min={0.3} max={0.9} step={0.05} value={settings.realism} onChange={(e) => saveSettings(s, { realism: Number(e.target.value) })} />
        </Field>
      </section>}

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
            <p className="small muted">Una sola cuenta para el celular y la compu. Tus datos quedan guardados y sincronizados.</p>
            <div className="chips">
              <button type="button" className={'chip' + (authTab === 'signin' ? ' on' : '')} onClick={() => { setAuthTab('signin'); setMsg(''); }}>Ya tengo cuenta</button>
              <button type="button" className={'chip' + (authTab === 'signup' ? ' on' : '')} onClick={() => { setAuthTab('signup'); setMsg(''); }}>Crear cuenta</button>
            </div>
            <Field label="Email"><input type="email" inputMode="email" autoComplete="email" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            <Field label={authTab === 'signup' ? 'Contraseña (mínimo 6 caracteres)' : 'Contraseña'}>
              <input type={showPass ? 'text' : 'password'} autoComplete={authTab === 'signup' ? 'new-password' : 'current-password'} value={pass} onChange={(e) => setPass(e.target.value)} />
            </Field>
            <label className="toggle"><input type="checkbox" checked={showPass} onChange={(e) => setShowPass(e.target.checked)} /><span>Mostrar contraseña</span></label>
            <div className="actions left">
              {authTab === 'signin' ? (
                <button className="primary" disabled={busy} onClick={() => run(() => signIn(email, pass))}>{busy ? 'Entrando…' : 'Iniciar sesión'}</button>
              ) : (
                <button className="primary" disabled={busy} onClick={() => run(() => signUp(email, pass))}>{busy ? 'Creando…' : 'Crear cuenta'}</button>
              )}
            </div>
            <div className="actions left">
              <button className="ghost small" disabled={busy} onClick={() => run(() => resetPassword(email))}>Olvidé mi contraseña</button>
              <button className="ghost small" disabled={busy} onClick={() => run(() => resendConfirmation(email))}>Reenviar email de confirmación</button>
            </div>
          </>
        )}
        {st.recovery && (
          <>
            <Field label="Contraseña nueva"><input type="password" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} /></Field>
            <button className="primary" disabled={busy} onClick={() => run(() => updatePassword(pass))}>Guardar contraseña</button>
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
        {msg && <p className="small auth-msg" role="status">{msg}</p>}
      </section>

      <section className="card">
        <h3>Respaldo y exportación</h3>
        <div className="actions left wrap">
          <button className="ghost" onClick={() => download(`yo-cumplo-${today()}.json`, exportJSON(s), 'application/json')}>Respaldo JSON</button>
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
