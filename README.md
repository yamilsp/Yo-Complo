# Yo Cumplo — sistema personal de ejecución

App web instalable (PWA) que conecta objetivos → metas de 30 días → proyectos → acciones diarias, con coach basado en tus datos reales. Funciona en celular y computadora con los mismos datos (Supabase).

## Modo simple (por defecto)

- **Test inicial** de 9 preguntas que arma tu plan (se puede rehacer en Ajustes).
- **Hoy**: primero la caja (lo que genera plata), después 1 acción por área (ingreso extra, salud, social, imagen). Botón **"¿Qué hago ahora?"** con regla de 2 minutos y respuesta a tu excusa.
- **Semana**: plata de la semana contra tu mínimo, 3 resultados, 1 experimento de 7 días a la vez, efecto compuesto (28 días).
- **Ordenar con IA** (`app/api/organize.js`, Claude Haiku 5.5): pegás o dictás tus tareas; la IA asigna área, cuadrante de Eisenhower, fecha y un porqué corto según tus metas (plata → ingreso extra → relaciones → salud → casa; máx. 3 en Hacer hoy) y deja una recomendación de qué hacer primero. "Reordenar todo lo pendiente con IA" repasa la lista entera. Sin sesión o sin clave, ordena por reglas y lo avisa. Se corrige con un toque o **arrastrando** la tarea a otro cuadrante (pulsación larga en el celular). Ideas en espera: se agregan varias a la vez, una por línea.
- **Tareas fijas** con día y hora (marketing, finanzas, casa, viandas…) y botón "Cambió el día" (lluvia, más trabajo, imprevisto).
- **Registro diario** en el cierre: mensajes a clientes, horas enfocadas, evento social, celular de ocio, gym, sueño. El coach propone cómo bajar la fricción de los hábitos buenos y subirla en los malos.
- **Google Calendar**: "Agregar a Google Calendar" en cada tarea (sin configuración) y lectura de eventos con la dirección secreta iCal (función `app/api/ical.js` en Vercel).
- **Versión 1 con entrega + Mostrar antes de pulir**: las tareas de proyecto/contenido piden qué es "suficientemente bueno", tiempo máximo y a quién mostrarlo; bloques de 50 min; al agotarse el tiempo se entrega como está (+25 min una sola vez). Semana → Entregas mide cuántas personas lo vieron. El coach frena si llevás 3 h sin mostrarlo.
- **Asistente** (pestaña ✦): chat con Claude Haiku 5.5 vía `app/api/chat.js`. Conoce tus metas, plan y registro; propone acciones (Hoy u Ordenar con su cuadrante) que confirmás con "Aplicar". Requiere `ANTHROPIC_API_KEY` en Vercel y sesión iniciada; opcional `ALLOWED_EMAILS`.
- **Fechas límite**: Ordenar detecta "hoy", "mañana", "el viernes" o "20/12"; lo importante que vence en ≤2 días pasa a Hacer hoy. Hoy muestra las próximas y el coach marca las vencidas.
- **Avisos** (Ajustes): planificar a la mañana, cerrar el día a la noche y 10 min antes de tareas con hora (mientras la app estuvo abierta hace poco); para recordatorios garantizados, Google Calendar.
- **Días anteriores**: en Hoy, "‹ Anterior" (hasta 60 días) o tocando un día en Semana → Efecto compuesto. Se marcan tareas y se carga el cierre; mirar un día no lo registra como incumplido.
- **Frase del día** de *Hábitos Atómicos* y *El Efecto Compuesto* (paráfrasis en castellano), distinta cada día.
- **Tema** claro / oscuro / como el teléfono (Ajustes → Apariencia).
- **Atajos del ícono** (mantener apretado): ¿Qué hago ahora?, Registrar el día, Ordenar.
- **Coach** basado en *Hábitos Atómicos* y *El Efecto Compuesto*: detecta en qué venís fallando y qué excusa repetís, y propone cómo facilitarlo.

## Modo avanzado (Etapa 1 / MVP original)

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
