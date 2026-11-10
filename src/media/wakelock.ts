// Garde l'écran allumé (API Wake Lock) tant que `active` est vrai. iOS relâche le verrou quand
// l'appli passe en arrière-plan : on le redemande au retour.
import { useEffect, useState } from 'preact/hooks';

/** off : non demandé ; pending : demande en cours ; error : refusé par le système. */
export type WakeLockStatus = 'on' | 'off' | 'pending' | 'error' | 'unsupported';

export function useWakeLock(active: boolean): WakeLockStatus {
  const supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;
  const [status, setStatus] = useState<WakeLockStatus>(supported ? 'off' : 'unsupported');

  useEffect(() => {
    if (!supported || !active) {
      setStatus(supported ? 'off' : 'unsupported');
      return;
    }
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      if (cancelled || document.visibilityState !== 'visible' || (sentinel && !sentinel.released)) return;
      setStatus('pending');
      try {
        sentinel = await navigator.wakeLock.request('screen');
        if (cancelled) {
          void sentinel.release();
          return;
        }
        setStatus('on');
        // iOS relâche le verrou en arrière-plan : il sera redemandé au retour.
        sentinel.addEventListener('release', () => { if (!cancelled) setStatus('pending'); });
      } catch {
        if (!cancelled) setStatus('error');
      }
    };
    const onVisible = () => { if (document.visibilityState === 'visible') void acquire(); };

    void acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      if (sentinel && !sentinel.released) void sentinel.release();
      setStatus('off');
    };
  }, [active, supported]);

  return status;
}
