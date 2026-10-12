import { useEffect, useState, useSyncExternalStore } from 'react';
import { Today } from './screens/Today';
import { Plan } from './screens/Plan';
import { Habits } from './screens/Habits';
import { Progress } from './screens/Progress';
import { SettingsScreen } from './screens/Settings';
import { subscribeSync, syncState } from './lib/sync';
import { setToaster } from './ui';
import { SimpleApp } from './simple/SimpleApp';

const TABS: [string, string, string][] = [
  ['hoy', 'Hoy', '◉'],
  ['plan', 'Plan', '☰'],
  ['habitos', 'Hábitos', '✓'],
  ['progreso', 'Progreso', '↗'],
  ['ajustes', 'Ajustes', '⚙'],
];

const MODE_KEY = 'yc:mode';
function readMode(): 'simple' | 'advanced' {
  try {
    return localStorage.getItem(MODE_KEY) === 'advanced' ? 'advanced' : 'simple';
  } catch {
    return 'simple';
  }
}

/** Modo simple por defecto; el avanzado conserva todo lo construido antes. */
export function Root() {
  const [mode, setMode] = useState(readMode);
  const change = (m: 'simple' | 'advanced') => {
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      /* sin almacenamiento: solo esta sesión */
    }
    setMode(m);
    window.scrollTo(0, 0);
  };
  return mode === 'simple' ? <SimpleRoot onAdvanced={() => change('advanced')} /> : <App onSimple={() => change('simple')} />;
}

function SimpleRoot({ onAdvanced }: { onAdvanced: () => void }) {
  const [msg, setMsg] = useState('');
  useEffect(() => {
    setToaster((m) => {
      setMsg(m);
      setTimeout(() => setMsg((x) => (x === m ? '' : x)), 2500);
    });
  }, []);
  return (
    <>
      <SimpleApp onAdvanced={onAdvanced} />
      {msg && <div className="s-toast" role="status">{msg}</div>}
    </>
  );
}

export function App({ onSimple }: { onSimple: () => void }) {
  const [tab, setTab] = useState(() => location.hash.slice(1) || 'hoy');
  const [msg, setMsg] = useState('');
  const st = useSyncExternalStore(subscribeSync, syncState);

  useEffect(() => {
    setToaster((m) => {
      setMsg(m);
      setTimeout(() => setMsg((x) => (x === m ? '' : x)), 3000);
    });
    const h = () => setTab(location.hash.slice(1) || 'hoy');
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);

  const go = (t: string) => {
    location.hash = t;
    setTab(t);
    window.scrollTo(0, 0);
  };

  const dot = st.mode === 'local' ? 'local' : st.error ? 'err' : st.mode === 'ready' ? 'ok' : 'warn';

  return (
    <>
      <span className={'sync-dot ' + dot} title={st.error ?? st.mode} onClick={() => go('ajustes')} />
      <main>
        {tab === 'hoy' && <Today go={go} />}
        {tab === 'plan' && <Plan />}
        {tab === 'habitos' && <Habits />}
        {tab === 'progreso' && <Progress />}
        {tab === 'ajustes' && <SettingsScreen onSimple={onSimple} />}
      </main>
      {msg && <div className="toast" role="status">{msg}</div>}
      <nav className="tabbar">
        {TABS.map(([id, label, icon]) => (
          <button key={id} className={tab === id ? 'on' : ''} onClick={() => go(id)}>
            <span aria-hidden>{icon}</span>
            {label}
          </button>
        ))}
      </nav>
    </>
  );
}
