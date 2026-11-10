// Minuteurs du mode cuisine (F5) — logique pure, fondée sur l'heure de fin (et non un compteur) :
// si iOS met l'appli en pause, le temps restant reste juste au retour.

export type TimerState = 'running' | 'paused' | 'done';

export interface Timer {
  id: string;
  recipeId: string;
  recipeTitle: string;
  stepIndex: number;
  label: string;
  durationMs: number;
  state: TimerState;
  /** Heure de fin (ms) quand le minuteur tourne. */
  endsAt?: number;
  /** Temps restant figé quand le minuteur est en pause. */
  remainingMs?: number;
  /** L'alarme d'un minuteur terminé a été arrêtée par l'utilisateur. */
  acknowledged?: boolean;
}

export function createTimer(p: Omit<Timer, 'state' | 'endsAt' | 'remainingMs'>, now: number): Timer {
  return { ...p, state: 'running', endsAt: now + p.durationMs };
}

export function remainingMs(t: Timer, now: number): number {
  if (t.state === 'done') return 0;
  if (t.state === 'paused') return Math.max(0, t.remainingMs ?? 0);
  return Math.max(0, (t.endsAt ?? now) - now);
}

export function pauseTimer(t: Timer, now: number): Timer {
  if (t.state !== 'running') return t;
  const { endsAt: _drop, ...rest } = t;
  return { ...rest, state: 'paused', remainingMs: remainingMs(t, now) };
}

export function resumeTimer(t: Timer, now: number): Timer {
  if (t.state !== 'paused') return t;
  const { remainingMs: r = 0, ...rest } = t;
  return { ...rest, state: 'running', endsAt: now + r };
}

/** Ajoute du temps ; relance un minuteur déjà terminé. */
export function addTime(t: Timer, ms: number, now: number): Timer {
  if (t.state === 'running') return { ...t, endsAt: (t.endsAt ?? now) + ms };
  if (t.state === 'paused') return { ...t, remainingMs: (t.remainingMs ?? 0) + ms };
  const { remainingMs: _r, acknowledged: _a, ...rest } = t;
  return { ...rest, state: 'running', endsAt: now + ms };
}

/** Passe à « terminé » les minuteurs échus. Renvoie aussi ceux qui viennent de se terminer. */
export function tickTimers(timers: Timer[], now: number): { timers: Timer[]; finished: Timer[] } {
  const finished: Timer[] = [];
  const next = timers.map((t) => {
    if (t.state === 'running' && (t.endsAt ?? 0) <= now) {
      const { endsAt: _e, ...rest } = t;
      const done: Timer = { ...rest, state: 'done', acknowledged: false };
      finished.push(done);
      return done;
    }
    return t;
  });
  return { timers: finished.length ? next : timers, finished };
}

/** Minuteurs dont l'alarme sonne (terminés, pas encore arrêtés). */
export function ringing(timers: Timer[]): Timer[] {
  return timers.filter((t) => t.state === 'done' && !t.acknowledged);
}

/** « 9:59 », « 1:02:03 » — arrondi à la seconde supérieure pour ne jamais afficher 0:00 trop tôt. */
export function formatClock(ms: number): string {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Relit des minuteurs sauvegardés en ignorant ce qui est invalide. */
export function reviveTimers(raw: unknown): Timer[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (t): t is Timer =>
      typeof t === 'object' && t !== null &&
      typeof (t as Timer).id === 'string' && typeof (t as Timer).durationMs === 'number' &&
      ['running', 'paused', 'done'].includes((t as Timer).state),
  );
}
