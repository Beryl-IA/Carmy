import { SettingsCard } from '../components/SettingsCard';
import { APP_NAME } from '../config';
import type { Settings } from '../model/types';

interface Props {
  settings: Settings;
  onChange: (s: Settings) => void;
  persisted: boolean | null;
}

export function SettingsPage({ settings, onChange, persisted }: Props) {
  const setServings = (n: number) => onChange({ ...settings, defaultServings: Math.min(20, Math.max(1, n)) });
  return (
    <main class="page stack">
      <header class="page-header">
        <h1>Réglages</h1>
      </header>

      <SettingsCard settings={settings} onChange={onChange} />

      <section class="card stack">
        <h2 class="card-title">Recettes</h2>
        <div class="row between">
          <span>Portions par défaut</span>
          <div class="stepper" role="group" aria-label="Portions par défaut">
            <button type="button" class="icon-btn" aria-label="Moins" disabled={settings.defaultServings <= 1} onClick={() => setServings(settings.defaultServings - 1)}>−</button>
            <span aria-live="polite">{settings.defaultServings}</span>
            <button type="button" class="icon-btn" aria-label="Plus" onClick={() => setServings(settings.defaultServings + 1)}>+</button>
          </div>
        </div>
        <p class="muted small">Utilisé pour la saisie à la main (et, plus tard, l'affichage des fiches et les courses).</p>
      </section>

      <section class="card stack">
        <h2 class="card-title">Stockage</h2>
        <p class="small">
          Tes recettes sont enregistrées uniquement sur cet iPhone.{' '}
          {persisted === true && 'Le stockage est protégé contre l\'effacement automatique.'}
          {persisted === false && 'Le navigateur n\'a pas garanti la conservation des données : installe l\'appli sur l\'écran d\'accueil.'}
        </p>
        <p class="muted small">L'export et l'import de sauvegarde arrivent au jalon 6.</p>
      </section>

      <p class="muted small center">{APP_NAME} v{__APP_VERSION__}</p>
    </main>
  );
}
