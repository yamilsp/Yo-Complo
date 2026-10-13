import { useState } from 'react';
import { useStore } from '../lib/store';
import { addDays, today } from '../lib/dates';
import {
  DEFAULT_FIXED, EXCUSE_LABEL, EXPERIMENT_TEMPLATE, IDEAS, PROFILE_ID, dayName,
  type Excuse, type Profile, type Tone,
} from '../lib/simple';
import { NumInput } from '../ui';
import { FixedByDay } from './FixedByDay';

type Draft = Omit<Profile, 'id' | 'kind' | 'createdAt' | 'updatedAt'>;

/** Respuestas que ya diste en la conversación: el test arranca precompletado. */
export const DEFAULT_PROFILE: Draft = {
  incomeNow: 1_200_000,
  incomeMin: 2_000_000,
  incomeDream: 10_000_000,
  robleDays: [2, 5],
  bestTime: ['manana', 'tarde'],
  excuses: ['ganas', 'plata'],
  ideas: ['Canción', 'Apps', 'Libro'],
  job: 'talvez',
  expHistory: [],
  social: 'Ir a 1 actividad para conocer gente nueva',
  socialDay: 6,
  footballDay: 3,
  healthDays: [1, 4],
  imagen: 'Una mejora de imagen personal (ropa, corte o postura)',
  imagenDay: 5,
  tone: 'duro',
  incomeTarget: 4_000_000,
  fixed: DEFAULT_FIXED,
  phoneLimit: 1,
};

const WEEK: [number, string][] = [[1, 'Lu'], [2, 'Ma'], [3, 'Mi'], [4, 'Ju'], [5, 'Vi'], [6, 'Sá'], [0, 'Do']];

function Pills<T extends string | number>({ value, options, onChange, multi }: {
  value: T | T[] | null; options: [T, string][]; onChange: (v: T) => void; multi?: boolean;
}) {
  const on = (v: T) => (multi ? (value as T[]).includes(v) : value === v);
  return (
    <div className="s-pills">
      {options.map(([v, l]) => (
        <button key={String(v)} type="button" className={'s-pill' + (on(v) ? ' on' : '')} onClick={() => onChange(v)}>
          {on(v) && multi ? '✓ ' : ''}{l}
        </button>
      ))}
    </div>
  );
}

const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

export function Wizard({ onDone }: { onDone: () => void }) {
  const s = useStore();
  const existing = s.get('sprofile', PROFILE_ID);
  const [p, setP] = useState<Draft>(existing ? { ...DEFAULT_PROFILE, ...existing } : DEFAULT_PROFILE);
  const [step, setStep] = useState(0);
  const [expIdea, setExpIdea] = useState<string>(existing?.experiment?.idea ?? p.ideas[0] ?? '');
  const up = (x: Partial<Draft>) => setP((o) => ({ ...o, ...x }));
  const gap = p.incomeMin - p.incomeNow;

  const steps: { q: string; sub?: string; body: JSX.Element }[] = [
    {
      q: '¿Cuánto entra hoy por mes?',
      sub: 'Ya completé con lo que me contaste. Corregí lo que haga falta.',
      body: (
        <>
          <label className="s-label">Hoy (aprox.)</label>
          <NumInput value={p.incomeNow} onChange={(n) => up({ incomeNow: n ?? 0 })} />
          <label className="s-label">Mínimo para auto y mudarte</label>
          <NumInput value={p.incomeMin} onChange={(n) => up({ incomeMin: n ?? 0 })} />
          <label className="s-label">Meta a 3 meses</label>
          <NumInput value={p.incomeTarget ?? null} onChange={(n) => up({ incomeTarget: n ?? undefined })} />
          <label className="s-label">Sueño a largo plazo</label>
          <NumInput value={p.incomeDream} onChange={(n) => up({ incomeDream: n ?? 0 })} />
          {gap > 0 && (
            <p className="s-callout">
              Te faltan <b>$ {gap.toLocaleString('es-AR')}</b> por mes para tu mínimo, unos $ {Math.round(gap / 4.33).toLocaleString('es-AR')} por semana. El gym, mudarte y el auto dependen de eso. Por eso <b>la caja va primero</b> todos los días.
            </p>
          )}
        </>
      ),
    },
    {
      q: '¿Qué días trabajás en El Roble?',
      sub: 'Esos días el plan es más liviano. Los demás son tus días de construir.',
      body: <Pills multi value={p.robleDays} options={WEEK} onChange={(d) => up({ robleDays: toggle(p.robleDays, d) })} />,
    },
    {
      q: '¿Buscás también empleo en relación de dependencia?',
      sub: 'Es la vía más rápida a un piso de ingreso fijo. No reemplaza al Roble.',
      body: <Pills value={p.job} options={[['si', 'Sí'], ['talvez', 'Tal vez, quiero probar'], ['no', 'No']]} onChange={(v) => up({ job: v })} />,
    },
    {
      q: '¿Qué excusas te frenan más?',
      sub: 'El coach las va a detectar y te va a proponer cómo desarmarlas.',
      body: (
        <Pills
          multi
          value={p.excuses}
          options={(Object.entries(EXCUSE_LABEL) as [Excuse, string][]).filter(([k]) => k !== 'imprevisto')}
          onChange={(v) => up({ excuses: toggle(p.excuses, v) })}
        />
      ),
    },
    {
      q: '¿Qué ideas de ingreso extra te interesan?',
      sub: 'No se pierden. Pero se prueba UNA a la vez, en bloques de 7 días.',
      body: <Pills multi value={p.ideas} options={IDEAS.map((i) => [i, i] as [string, string])} onChange={(v) => up({ ideas: toggle(p.ideas, v) })} />,
    },
    {
      q: '¿Con cuál arrancás el primer experimento?',
      sub: 'Mi recomendación: ninguna de estas va a cerrar la brecha de este mes, eso lo hace la caja. Elegí la que puedas TERMINAR y mostrar en 7 días; tu problema es que las cosas quedan a la mitad. La canción es la más rápida de terminar. Las apps tienen más potencial de ingreso, pero más riesgo de quedar a medias.',
      body: (
        <>
          <Pills value={expIdea} options={[...p.ideas.map((i) => [i, i] as [string, string]), ['', 'Ninguna por ahora']]} onChange={setExpIdea} />
          {expIdea && EXPERIMENT_TEMPLATE[expIdea] && (
            <p className="s-callout">
              <b>{EXPERIMENT_TEMPLATE[expIdea].name}</b>
              <br />
              {EXPERIMENT_TEMPLATE[expIdea].question}
            </p>
          )}
        </>
      ),
    },
    {
      q: 'Salud',
      sub: 'El mínimo cuenta. Caminar 10 minutos sostiene el hábito hasta que vuelvas al gym.',
      body: (
        <>
          <label className="s-label">Fútbol</label>
          <Pills value={p.footballDay} options={[...WEEK, [-1, 'No juego']] as [number, string][]} onChange={(d) => up({ footballDay: d === -1 ? null : d })} />
          <label className="s-label">Caminar o correr</label>
          <Pills multi value={p.healthDays} options={WEEK} onChange={(d) => up({ healthDays: toggle(p.healthDays, d) })} />
        </>
      ),
    },
    {
      q: 'Social e imagen',
      sub: 'Una acción concreta por semana, con día fijo. La agenda decide por vos.',
      body: (
        <>
          <label className="s-label">Social</label>
          <Pills
            value={p.social}
            options={[
              ['Ir a 1 actividad para conocer gente nueva', 'Conocer gente nueva'],
              ['Sumarme a un grupo con horario fijo (running, idiomas, teatro)', 'Grupo fijo'],
              ['Proponer un plan concreto a 1 amigo', 'Ver amigos'],
            ]}
            onChange={(v) => up({ social: v })}
          />
          <Pills value={p.socialDay} options={WEEK} onChange={(d) => up({ socialDay: d })} />
          <label className="s-label">Imagen personal</label>
          <Pills
            value={p.imagen}
            options={[
              ['Una mejora de imagen personal (ropa, corte o postura)', 'Ropa / corte / postura'],
              ['Renovar 1 prenda básica que uses mucho', 'Ropa'],
              ['Cuidado personal: corte, barba, piel', 'Cuidado personal'],
            ]}
            onChange={(v) => up({ imagen: v })}
          />
          <Pills value={p.imagenDay} options={WEEK} onChange={(d) => up({ imagenDay: d })} />
        </>
      ),
    },
    {
      q: 'Tareas fijas: ¿qué día y a qué hora?',
      sub: 'Te propongo estos días. Cambialos como te sirva. Lo que tiene lugar fijo no compite con lo demás.',
      body: (
        <>
          <FixedByDay list={p.fixed ?? []} onChange={(fixed) => up({ fixed })} />
          <p className="s-muted small">Podés agregar más después, en Semana.</p>
        </>
      ),
    },
    {
      q: '¿Cuánto celular de ocio por día te permitís?',
      sub: 'En tu planilla registraste unas 37,5 h de ocio en una semana, más de 5 h por día. Elegí un límite que puedas cumplir y bajalo de a poco.',
      body: (
        <Pills<number>
          value={p.phoneLimit ?? 1}
          options={[[0.5, '30 min'], [1, '1 h'], [2, '2 h'], [3, '3 h']]}
          onChange={(v) => up({ phoneLimit: v })}
        />
      ),
    },
    {
      q: '¿Cómo querés que te hable el coach?',
      body: (
        <Pills<Tone>
          value={p.tone}
          options={[['duro', 'Directo y duro'], ['firme', 'Firme, con propuestas'], ['datos', 'Solo datos']]}
          onChange={(v) => up({ tone: v })}
        />
      ),
    },
  ];

  const finish = () => {
    const d = today();
    let experiment = p.experiment;
    if (!expIdea) experiment = undefined;
    else if (!experiment || experiment.idea !== expIdea) {
      const t = EXPERIMENT_TEMPLATE[expIdea] ?? { name: expIdea, question: 'Mostrarlo a 5 personas en 7 días. ¿Les sirve?' };
      experiment = { idea: expIdea, name: t.name, question: t.question, start: d, end: addDays(d, 7) };
    }
    const data = { ...p, experiment, kind: 'sprofile' as const };
    if (existing) s.update('sprofile', PROFILE_ID, data);
    else s.create('sprofile', { ...data, id: PROFILE_ID });
    onDone();
  };

  const st = steps[step];
  const last = step === steps.length - 1;
  return (
    <div className="s-wizard">
      <div className="s-progress"><div style={{ width: `${((step + 1) / steps.length) * 100}%` }} /></div>
      <small className="s-muted">Pregunta {step + 1} de {steps.length}</small>
      <h1 className="s-q">{st.q}</h1>
      {st.sub && <p className="s-muted">{st.sub}</p>}
      <div className="s-wbody">{st.body}</div>
      <div className="s-wnav">
        {step > 0 && <button className="s-btn text" onClick={() => setStep(step - 1)}>Atrás</button>}
        <button className="s-btn filled" onClick={() => (last ? finish() : setStep(step + 1))}>{last ? 'Armar mi plan' : 'Siguiente'}</button>
      </div>
      {step === 1 && p.robleDays.length > 0 && (
        <p className="s-muted small">Roble: {p.robleDays.map(dayName).join(', ')}. Para el resto de los días, el plan te propone 2 h de clientes antes que nada.</p>
      )}
    </div>
  );
}
