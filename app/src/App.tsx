import { useEffect, useState, useSyncExternalStore } from 'react';
import { Today } from './screens/Today';
import { Plan } from './screens/Plan';
import { Habits } from './screens/Habits';
import { Progress } from './screens/Progress';
import { SettingsScreen } from './screens/Settings';
import { subscribeSync, syncState } from './lib/sync';
import { setToaster } from './ui';

const TABS: [string, string, string][] = [
  ['hoy', 'Hoy', '◉'],
  ['plan', 'Plan', '☰'],
  ['habitos', 'Hábitos', '✓'],
  ['progreso', 'Progreso', '↗'],
  ['ajustes', 'Ajustes', '⚙'],
];

export function App() {
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
        {tab === 'ajustes' && <SettingsScreen />}
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
