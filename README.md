# Yo Complo — sistema personal de ejecución

App web instalable (PWA) que conecta objetivos → metas de 30 días → proyectos → acciones diarias, con coach basado en tus datos reales. Funciona en celular y computadora con los mismos datos (Supabase).

## Qué incluye (Etapa 1 / MVP)

- **Hoy**: máx. 3 prioridades (2 con energía baja), siguiente acción, bloques, hábitos, capacidad realista y triage (postergar / delegar / descartar).
- **Plan**: objetivos medibles, proyectos con cupo (1 principal + 1 secundario + ingresos + salud), experimentos con criterio de éxito y fecha, acciones tipo *resultado* vs *preparación*, ideas en espera.
- **Hábitos**: registro de un toque, versión mínima, causa de incumplimiento.
- **Cierre diario** (<2 min) y **revisión semanal** (termina con 1 cambio y ≤3 prioridades).
- **Progreso**: actividad vs resultados vs avance estratégico, ingresos/ahorro ARS y USD, embudo comercial, recompensas y logros verificables.
- **Coach por reglas** (sin IA): preparación sin ventas, horas sin resultados, sobreplanificación, saltar de proyecto, tareas pateadas, hábitos cayéndose, plan mínimo crónico. Escala si el patrón se repite.
- **Datos**: local-first + sincronización Supabase, respaldo JSON, exportación CSV.

## Puesta en marcha (sin programar)

1. **Supabase**: crear proyecto → *SQL Editor* → pegar [`supabase/schema.sql`](supabase/schema.sql) → *Run*.
2. **Publicar**: en [vercel.com](https://vercel.com) entrar con GitHub → *Add New → Project* → elegir este repo → *Root Directory*: `app` → *Deploy*.
3. Abrir la URL en el celular → menú de Chrome → **Agregar a pantalla principal**.
4. En la app: **Ajustes** → pegar Project URL y anon key → crear cuenta → en la compu, iniciar sesión con el mismo email.

## Desarrollo

```bash
cd app
npm install
npm run dev        # servidor local
npm test           # pruebas de la lógica
npm run build      # typecheck + build
```

Estructura: `app/src/lib` (lógica pura y testeada: prioridad, puntos, coach, sync), `app/src/screens` (pantallas).

## Integraciones (Etapa 2, no implementadas a propósito)

- **Loop Habit Tracker**: no tiene API. Exporta CSV (zip) y respaldo `.db` (SQLite). Opción viable: importar el CSV.
- **Google Calendar**: requiere proyecto en Google Cloud, pantalla de consentimiento OAuth y scope `calendar.readonly`/`calendar.events`. En modo "testing" los refresh tokens vencen a los 7 días.

Se evalúan solo después de 30 días de uso sostenido.
