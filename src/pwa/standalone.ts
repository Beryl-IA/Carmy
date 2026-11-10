/** L'appli est ouverte depuis l'écran d'accueil (et non dans un onglet Safari). */
export function isStandalone(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}
