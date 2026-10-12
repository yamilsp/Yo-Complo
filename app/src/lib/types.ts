export type Kind =
  | 'goal'
  | 'project'
  | 'task'
  | 'idea'
  | 'habit'
  | 'habitLog'
  | 'day'
  | 'result'
  | 'obstacle'
  | 'review'
  | 'reward'
  | 'redemption'
  | 'settings'
  | 'sprofile'
  | 'splan'
  | 'sweek'
  | 'snote';

export interface Base {
  id: string;
  kind: Kind;
  createdAt: number;
  updatedAt: number;
  deleted?: boolean;
}

/** Causas de incumplimiento: sirven para diagnosticar, no para culpar. */
export type MissCause =
  | 'planning'
  | 'too_broad'
  | 'ill_defined'
  | 'energy_time'
  | 'environment'
  | 'avoidance'
  | 'strategy';

/** De dónde sale el valor actual de un objetivo. Automático cuando hay registros. */
export type GoalSource =
  | 'manual'
  | 'income_ars'
  | 'savings_ars'
  | 'savings_usd'
  | 'clients'
  | 'contacts'
  | 'proposals';

export interface Goal extends Base {
  kind: 'goal';
  title: string;
  horizon: 'long' | '30d';
  parentId?: string;
  metric: string;
  unit: string;
  source: GoalSource;
  baseline: number;
  target: number | null;
  manualCurrent: number;
  startDate: string;
  reviewDate: string;
  status: 'active' | 'done' | 'dropped';
}

export type ProjectRole = 'main' | 'secondary' | 'income' | 'health';
export type ProjectStatus = 'active' | 'paused' | 'closed' | 'discarded';

export interface Project extends Base {
  kind: 'project';
  title: string;
  goalId?: string;
  role: ProjectRole;
  status: ProjectStatus;
  isExperiment: boolean;
  hypothesis?: string;
  successCriteria?: string;
  budget?: number;
  deadline?: string;
  growth?: number;
  statusNote?: string;
}

/** result = produce un cambio verificable; prep = preparación; maintenance = operación/rutina. */
export type TaskType = 'result' | 'prep' | 'maintenance';
export type TaskStatus = 'todo' | 'done' | 'dropped' | 'delegated';

export interface Task extends Base {
  kind: 'task';
  title: string;
  projectId?: string;
  type: TaskType;
  commercial: boolean;
  avoided: boolean;
  importance: 1 | 2 | 3;
  impact: 1 | 2 | 3;
  estimateMin: number;
  energy: 'low' | 'high';
  dueDate?: string;
  plannedFor?: string;
  status: TaskStatus;
  doneAt?: string;
  evidence?: string;
  postponeCount: number;
  delegatedTo?: string;
  startedAt?: number;
}

export interface Idea extends Base {
  kind: 'idea';
  title: string;
  note?: string;
  status: 'waiting' | 'promoted' | 'discarded';
  potential?: number;
}

export interface Habit extends Base {
  kind: 'habit';
  title: string;
  minVersion: string;
  cue: string;
  targetPerWeek: number;
  active: boolean;
}

export interface HabitLog extends Base {
  kind: 'habitLog';
  habitId: string;
  date: string;
  status: 'done' | 'min' | 'miss';
  reason?: MissCause;
}

export interface Block {
  start: string;
  end: string;
  label: string;
  type: 'commitment' | 'focus';
}

export type Energy = 'low' | 'normal' | 'high';

export interface Day extends Base {
  kind: 'day';
  date: string;
  energy: Energy;
  availableMin: number;
  priorities: string[];
  blocks: Block[];
  closed: boolean;
  missCause?: MissCause;
  firstActionTomorrowId?: string;
  plannedCount?: number;
  doneCount?: number;
}

export type ResultKind = 'income' | 'saving' | 'contact' | 'proposal' | 'client' | 'other';

export interface ResultLog extends Base {
  kind: 'result';
  date: string;
  type: ResultKind;
  qty: number;
  amount?: number;
  currency?: 'ARS' | 'USD';
  note?: string;
  projectId?: string;
  taskId?: string;
}

export interface Obstacle extends Base {
  kind: 'obstacle';
  date: string;
  cause: MissCause;
  note?: string;
  taskId?: string;
}

export interface Review extends Base {
  kind: 'review';
  weekStart: string;
  change: string;
  priorities: string[];
  planned: number;
  done: number;
}

export interface Reward extends Base {
  kind: 'reward';
  title: string;
  cost: number;
}

export interface Redemption extends Base {
  kind: 'redemption';
  rewardId: string;
  title: string;
  date: string;
  cost: number;
}

export interface Settings extends Base {
  kind: 'settings';
  name: string;
  defaultAvailableMin: number;
  /** Fracción del tiempo libre que realmente se convierte en trabajo enfocado. */
  realism: number;
  usdRate: number;
}

export type AnyRec =
  | Goal
  | Project
  | Task
  | Idea
  | Habit
  | HabitLog
  | Day
  | ResultLog
  | Obstacle
  | Review
  | Reward
  | Redemption
  | Settings
  | import('./simple').Profile
  | import('./simple').DayPlan
  | import('./simple').WeekRec
  | import('./simple').Note;

export type RecOf<K extends Kind> = Extract<AnyRec, { kind: K }>;

export const CAUSE_LABEL: Record<MissCause, string> = {
  planning: 'Mala planificación',
  too_broad: 'Objetivo demasiado amplio',
  ill_defined: 'Acción mal definida',
  energy_time: 'Falta de energía o tiempo',
  environment: 'Distracciones del entorno',
  avoidance: 'Evitación (incomodidad)',
  strategy: 'La estrategia no da resultados',
};

export const CAUSE_FIX: Record<MissCause, string> = {
  planning: 'Mañana máximo 2 prioridades y multiplicá tus estimaciones ×1,5.',
  too_broad: 'Convertí el objetivo en una meta de 30 días con un número y una fecha.',
  ill_defined: 'Reescribí la acción como verbo + objeto + cantidad, de 60 minutos o menos (ej.: "Enviar 5 mensajes a administradores de consorcio").',
  energy_time: 'Poné la tarea importante en tu franja de más energía y hacé solo su versión mínima.',
  environment: 'Reservá un bloque fijo sin celular a mano y registrá qué te interrumpió.',
  avoidance: 'Marcá la tarea como "la evito" y hacela primero: 15 minutos con temporizador, antes de cualquier otra cosa.',
  strategy: 'Revisá el experimento con datos: ¿se cumplió el criterio de éxito? Decidí continuar, ajustar o cerrar.',
};

export const RESULT_LABEL: Record<ResultKind, string> = {
  income: 'Ingreso cobrado',
  saving: 'Ahorro',
  contact: 'Contactos comerciales',
  proposal: 'Propuesta enviada',
  client: 'Cliente nuevo',
  other: 'Otro resultado',
};

export const ROLE_LABEL: Record<ProjectRole, string> = {
  main: 'Principal (crecimiento)',
  secondary: 'Secundario',
  income: 'Ingresos actuales',
  health: 'Salud',
};

export const TYPE_LABEL: Record<TaskType, string> = {
  result: 'Resultado',
  prep: 'Preparación',
  maintenance: 'Operación',
};
