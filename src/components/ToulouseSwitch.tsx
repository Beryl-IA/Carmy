// Mode Toulouse (1.6.0) : en déplacement, rien ne modifie le stock (courses cochées, repas mangés, fin de cuisson).
import type { Settings } from '../model/types';

interface Props {
  settings: Settings;
  onChange: (s: Settings) => void;
  /** Bandeau : affiché seulement quand le mode est actif, avec un bouton pour l'éteindre. */
  banner?: boolean;
}

export function ToulouseSwitch({ settings, onChange, banner }: Props) {
  const on = Boolean(settings.toulouse);
  if (banner)
    return on ? (
      <section class="toulouse-banner" role="status">
        <p><strong>📍 Mode Toulouse actif</strong> : le stock n'est pas modifié.</p>
        <button type="button" class="btn small secondary" onClick={() => onChange({ ...settings, toulouse: false })}>Désactiver</button>
      </section>
    ) : null;
  return (
    <section class={`card stack toulouse-card ${on ? 'on' : ''}`}>
      <label class="switch-row">
        <span class="grow">
          <strong>📍 Mode Toulouse</strong>
          <span class="muted small">En déplacement : les courses cochées, les repas mangés et les recettes cuisinées ne touchent pas au stock.</span>
        </span>
        <input type="checkbox" role="switch" class="switch" checked={on} aria-label="Mode Toulouse" onChange={(e) => onChange({ ...settings, toulouse: e.currentTarget.checked })} />
      </label>
      {on && <p class="small"><strong>Actif.</strong> Pense à le désactiver à ton retour.</p>}
    </section>
  );
}
