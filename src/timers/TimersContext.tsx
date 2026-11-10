// État global des minuteurs : ils continuent si l'on quitte le mode cuisine, et l'alarme
// s'affiche par-dessus n'importe quel écran. Sauvegarde locale pour survivre à un rechargement.
import { createContext, type ComponentChildren } from 'preact';
import { useCallback, useContext, useEffect, useMemo, useState } from 'preact/hooks';
import { startAlarm, stopAlarm, unlockAudio } from '../media/alarm';
import { useWakeLock, type WakeLockStatus } from '../media/wakelock';
import {
  addTime, createTimer, formatClock, pauseTimer, remainingMs, resumeTimer, reviveTimers, ringing, tickTimers, type Timer,
} from '../model/timers';
import { APP_NAME } from '../config';
import { navigate } from '../router';

const STORAGE_KEY = 'carmy.timers';

interface TimersApi {
  timers: Timer[];
  now: number;
  start: (p: Omit<Timer, 'id' | 'state' | 'endsAt' | 'remainingMs'>) => void;
  pause: (id: string) => void;
  resume: (id: string) => void;
  add: (id: string, ms: number) => void;
  cancel: (id: string) => void;
  acknowledge: (id?: string) => void;
  wakeLock: WakeLockStatus;
}

const Ctx = createContext<TimersApi | null>(null);

export function useTimers(): TimersApi {
  const api = useContext(Ctx);
  if (!api) throw new Error('useTimers hors de TimersProvider');
  return api;
}

function load(): Timer[] {
  try {
    return reviveTimers(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'));
  } catch {
    return [];
  }
}

interface Props {
  /** Le mode cuisine est ouvert : l'écran doit rester allumé. */
  cooking: boolean;
  children: ComponentChildren;
}

export function TimersProvider({ cooking, children }: Props) {
  const [timers, setTimers] = useState<Timer[]>(load);
  const [now, setNow] = useState(Date.now());

  const hasRunning = timers.some((t) => t.state === 'running');
  const ringingTimers = ringing(timers);
  const wakeLock = useWakeLock(cooking || hasRunning || ringingTimers.length > 0);

  // Sauvegarde à chaque changement d'état (pas à chaque seconde : l'heure de fin suffit).
  useEffect(() => {
    try {
      if (timers.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(timers));
      else localStorage.removeItem(STORAGE_KEY);
    } catch { /* stockage indisponible */ }
  }, [timers]);

  // Horloge : rafraîchie 4 fois par seconde tant qu'un minuteur tourne, et au retour au premier plan.
  useEffect(() => {
    const tick = () => {
      const t = Date.now();
      setNow(t);
      setTimers((prev) => tickTimers(prev, t).timers);
    };
    tick();
    const onVis = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVis);
    const iv = hasRunning ? setInterval(tick, 250) : null;
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      if (iv) clearInterval(iv);
    };
  }, [hasRunning]);

  // Alarme sonore tant qu'un minuteur terminé n'a pas été arrêté.
  const isRinging = ringingTimers.length > 0;
  useEffect(() => {
    if (isRinging) startAlarm();
    else stopAlarm();
    document.title = isRinging ? '⏰ Minuteur terminé' : APP_NAME;
  }, [isRinging]);
  useEffect(() => () => stopAlarm(), []);

  const update = (id: string, f: (t: Timer, now: number) => Timer) =>
    setTimers((prev) => prev.map((t) => (t.id === id ? f(t, Date.now()) : t)));

  const start = useCallback<TimersApi['start']>((p) => {
    unlockAudio(); // le tap qui lance le minuteur autorise le son plus tard
    const id = crypto.randomUUID ? crypto.randomUUID() : `t${Date.now()}${Math.random()}`;
    setTimers((prev) => [...prev, createTimer({ ...p, id }, Date.now())]);
  }, []);

  const api = useMemo<TimersApi>(() => ({
    timers,
    now,
    start,
    pause: (id) => update(id, pauseTimer),
    resume: (id) => {
      unlockAudio();
      update(id, resumeTimer);
    },
    add: (id, ms) => {
      unlockAudio();
      update(id, (t, n) => addTime(t, ms, n));
    },
    cancel: (id) => setTimers((prev) => prev.filter((t) => t.id !== id)),
    // Arrêter l'alarme retire aussi les minuteurs terminés.
    acknowledge: (id) => setTimers((prev) => prev.filter((t) => !(t.state === 'done' && (!id || t.id === id)))),
    wakeLock,
  }), [timers, now, start, wakeLock]);

  return (
    <Ctx.Provider value={api}>
      {children}
      {isRinging && <AlarmOverlay ringing={ringingTimers} api={api} />}
    </Ctx.Provider>
  );
}

function AlarmOverlay({ ringing: list, api }: { ringing: Timer[]; api: TimersApi }) {
  return (
    <div class="alarm" role="alertdialog" aria-modal="true" aria-labelledby="alarm-title">
      <div class="alarm-card">
        <span class="alarm-icon" aria-hidden="true">⏰</span>
        <h2 id="alarm-title">{list.length > 1 ? `${list.length} minuteurs terminés` : 'Minuteur terminé'}</h2>
        <ul>
          {list.map((t) => (
            <li key={t.id}>
              <strong>{t.label}</strong> · {t.recipeTitle}
            </li>
          ))}
        </ul>
        <button type="button" class="btn big" onClick={() => api.acknowledge()}>Arrêter</button>
        {list.length === 1 && list[0] && (
          <button type="button" class="btn secondary" onClick={() => api.add(list[0]!.id, 60_000)}>+1 min</button>
        )}
      </div>
    </div>
  );
}

/** Rappel des minuteurs en cours, affiché hors du mode cuisine. */
export function TimerDock() {
  const { timers, now } = useTimers();
  const active = timers.filter((t) => t.state !== 'done');
  if (!active.length) return null;
  return (
    <div class="timer-dock" role="status">
      {active.map((t) => (
        <button
          key={t.id}
          type="button"
          class={`dock-pill ${t.state}`}
          onClick={() => navigate({ name: 'cuisine', id: t.recipeId, step: t.stepIndex })}
        >
          ⏱ {formatClock(remainingMs(t, now))}
          <span>{t.state === 'paused' ? 'en pause' : t.recipeTitle}</span>
        </button>
      ))}
    </div>
  );
}
