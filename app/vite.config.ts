import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Fecha de compilación visible en Ajustes, para saber qué versión está abierta.
const build = new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export default defineConfig({
  plugins: [react()],
  define: { __BUILD__: JSON.stringify(build) },
  test: { environment: 'node' },
} as never);
