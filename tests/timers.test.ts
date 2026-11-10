import { describe, expect, it } from 'vitest';
import { addTime, createTimer, formatClock, pauseTimer, remainingMs, resumeTimer, reviveTimers, ringing, tickTimers } from '../src/model/timers';

const base = { id: 't1', recipeId: 'r', recipeTitle: 'Curry', stepIndex: 1, label: 'Étape 2', durationMs: 60_000 };

describe('minuteurs', () => {
  it('décompte à partir de l\'heure de fin, même après une longue pause de l\'appli', () => {
    const t = createTimer(base, 1000);
    expect(remainingMs(t, 1000)).toBe(60_000);
    expect(remainingMs(t, 31_000)).toBe(30_000);
    // L'appli « dort » 5 minutes : le minuteur est simplement échu.
    const { timers, finished } = tickTimers([t], 301_000);
    expect(finished.map((x) => x.id)).toEqual(['t1']);
    expect(timers[0]?.state).toBe('done');
    expect(ringing(timers)).toHaveLength(1);
    // Un second passage ne redéclenche pas l'alarme.
    expect(tickTimers(timers, 302_000).finished).toEqual([]);
  });

  it('met en pause et reprend sans perdre de temps', () => {
    const t = pauseTimer(createTimer(base, 0), 20_000);
    expect(t.state).toBe('paused');
    expect(remainingMs(t, 999_999)).toBe(40_000);
    const r = resumeTimer(t, 100_000);
    expect(remainingMs(r, 110_000)).toBe(30_000);
    expect(pauseTimer(t, 0)).toBe(t);
    expect(resumeTimer(r, 0)).toBe(r);
  });

  it('ajoute du temps, y compris à un minuteur terminé', () => {
    const run = addTime(createTimer(base, 0), 60_000, 10_000);
    expect(remainingMs(run, 10_000)).toBe(110_000);
    const paused = addTime(pauseTimer(createTimer(base, 0), 0), 30_000, 0);
    expect(remainingMs(paused, 0)).toBe(90_000);
    const done = tickTimers([createTimer(base, 0)], 60_000).timers[0]!;
    const again = addTime(done, 60_000, 70_000);
    expect(again.state).toBe('running');
    expect(again.acknowledged).toBeUndefined();
    expect(remainingMs(again, 70_000)).toBe(60_000);
  });

  it('formate l\'horloge', () => {
    expect(formatClock(600_000)).toBe('10:00');
    expect(formatClock(59_001)).toBe('1:00');
    expect(formatClock(500)).toBe('0:01');
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(3_723_000)).toBe('1:02:03');
  });

  it('relit une sauvegarde en filtrant les entrées invalides', () => {
    expect(reviveTimers(null)).toEqual([]);
    const t = createTimer(base, 0);
    expect(reviveTimers([t, { id: 1 }, 'x', { ...t, state: 'bizarre' }])).toEqual([t]);
  });
});
