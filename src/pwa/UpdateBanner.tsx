import { useRegisterSW } from 'virtual:pwa-register/preact';

export function UpdateBanner() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      // Vérifie les mises à jour à chaque retour au premier plan.
      if (reg) document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void reg.update(); });
    },
  });

  if (needRefresh)
    return (
      <div class="banner" role="status">
        <span>Nouvelle version disponible.</span>
        <button type="button" class="btn small" onClick={() => void updateServiceWorker(true)}>Mettre à jour</button>
        <button type="button" class="btn small ghost" onClick={() => setNeedRefresh(false)}>Plus tard</button>
      </div>
    );
  if (offlineReady)
    return (
      <div class="banner" role="status">
        <span>L'appli fonctionne maintenant hors-ligne.</span>
        <button type="button" class="btn small ghost" onClick={() => setOfflineReady(false)}>OK</button>
      </div>
    );
  return null;
}
