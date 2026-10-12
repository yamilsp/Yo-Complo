import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Root } from './App';
import './simple/simple.css';
import { startAutoSync } from './lib/sync';
import { applyTheme } from './lib/theme';
import './styles.css';

applyTheme();
startAutoSync();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => undefined));
}
