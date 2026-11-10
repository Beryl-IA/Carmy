import { BackupCard } from '../components/BackupCard';
import { PantryEditor } from '../components/PantryEditor';
import { SettingsCard } from '../components/SettingsCard';
import { APP_NAME } from '../config';
import type { Settings } from '../model/types';

interface Props {
  settings: Settings;
  onChange: (s: Settings) => void;
  persisted: boolean | null;
  /** Réglages modifiés hors de cette page (export, import) : à recharger. */
  onSettings: (s: Settings) => void;
  onImported: () => void;
}

const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

export function SettingsPage({ settings, onChange, persisted, onSettings, onImported }: Props) {
  const setServings = (n: number) => onChange({ ...settings, defaultServings: Math.min(20, Math.max(1, n)) });
  return (
    <main class="page stack">
      <header class="page-header">
        <h1>Réglages</h1>
      </header>

      <SettingsCard settings={settings} onChange={onChange} />
      <details class="card help">
        <summary>Comment obtenir une clé API gratuite ?</summary>
        <ol class="steps-help small">
          <li>Ouvre <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">aistudio.google.com/apikey</a> et connecte-toi avec un compte Google.</li>
          <li>Touche « Create API key », puis copie la clé.</li>
          <li>Colle-la ci-dessus, touche « Tester la clé » et choisis un modèle Flash (ex. : flash-lite).</li>
          <li>La clé reste sur cet iPhone et n'est jamais incluse dans les sauvegardes. Un abonnement Gemini grand public ne s'applique pas à l'API.</li>
        </ol>
      </details>

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
        <p class="muted small">Nombre de portions affiché à l'ouverture d'une fiche (les quantités sont recalculées), proposé pour la saisie à la main et pour les recettes ajoutées aux courses.</p>
      </section>

      <PantryEditor />

      <BackupCard settings={settings} onSettings={onSettings} onImported={onImported} />

      <section class="card stack">
        <h2 class="card-title">Installer sur l'écran d'accueil</h2>
        {isStandalone() ? (
          <p class="ok small">✓ {APP_NAME} est installée : elle s'ouvre en plein écran et fonctionne hors-ligne.</p>
        ) : (
          <ol class="steps-help small">
            <li>Ouvre cette page dans <strong>Safari</strong>.</li>
            <li>Touche le bouton <strong>Partager</strong> (carré avec une flèche vers le haut).</li>
            <li>Choisis <strong>Sur l'écran d'accueil</strong>, puis <strong>Ajouter</strong>.</li>
            <li>Ouvre {APP_NAME} depuis sa nouvelle icône.</li>
          </ol>
        )}
      </section>

      <section class="card stack">
        <h2 class="card-title">Stockage</h2>
        <p class="small">
          Tes recettes sont enregistrées uniquement sur cet iPhone.{' '}
          {persisted === true && 'Le stockage est protégé contre l\'effacement automatique.'}
          {persisted === false && 'Le navigateur n\'a pas garanti la conservation des données : installe l\'appli sur l\'écran d\'accueil.'}
        </p>
      </section>

      <p class="muted small center">{APP_NAME} v{__APP_VERSION__}</p>
    </main>
  );
}
