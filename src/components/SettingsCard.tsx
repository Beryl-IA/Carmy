import { useState } from 'preact/hooks';
import { listGeminiModels, type GeminiModelInfo } from '../extraction/gemini';
import { ExtractionError } from '../extraction/types';
import type { ProtoSettings } from '../settings';

interface Props {
  settings: ProtoSettings;
  onChange: (s: ProtoSettings) => void;
}

export function SettingsCard({ settings, onChange }: Props) {
  const ready = Boolean(settings.apiKey && settings.model);
  const [open, setOpen] = useState(!ready);
  const [models, setModels] = useState<GeminiModelInfo[]>([]);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);

  async function testKey() {
    setTesting(true);
    setStatus(null);
    try {
      const list = await listGeminiModels(settings.apiKey.trim());
      setModels(list);
      const keep = list.some((m) => m.id === settings.model);
      const first = list[0];
      if (!keep && first) onChange({ ...settings, apiKey: settings.apiKey.trim(), model: first.id });
      setStatus({ ok: true, text: `Clé valide : ${list.length} modèles disponibles. Choisis un modèle « Flash » gratuit.` });
    } catch (e) {
      setStatus({ ok: false, text: e instanceof ExtractionError ? e.message : String(e) });
    } finally {
      setTesting(false);
    }
  }

  return (
    <section class="card">
      <button type="button" class="card-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span>Réglages de l'IA</span>
        <span class="muted">{ready ? settings.model : 'à configurer'} {open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div class="stack">
          <label class="field">
            <span>Clé API Gemini</span>
            <input
              type="password"
              autocomplete="off"
              autocapitalize="off"
              spellcheck={false}
              placeholder="Colle ta clé Google AI Studio"
              value={settings.apiKey}
              onInput={(e) => onChange({ ...settings, apiKey: e.currentTarget.value })}
            />
          </label>
          <button type="button" class="btn secondary" disabled={!settings.apiKey || testing} onClick={testKey}>
            {testing ? 'Test en cours…' : 'Tester la clé'}
          </button>
          {status && <p class={status.ok ? 'ok' : 'error'} role="status">{status.text}</p>}

          <label class="field">
            <span>Modèle</span>
            {models.length > 0 ? (
              <select value={settings.model} onChange={(e) => onChange({ ...settings, model: e.currentTarget.value })}>
                {models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            ) : (
              <input
                type="text"
                autocapitalize="off"
                spellcheck={false}
                placeholder="Teste la clé pour voir la liste"
                value={settings.model}
                onInput={(e) => onChange({ ...settings, model: e.currentTarget.value.trim() })}
              />
            )}
          </label>

          <label class="check">
            <input
              type="checkbox"
              checked={settings.fastMode}
              onChange={(e) => onChange({ ...settings, fastMode: e.currentTarget.checked })}
            />
            <span>Analyse rapide : Google lit la vidéo en basse résolution (beaucoup plus rapide ; décoche si le texte affiché à l'écran est mal lu)</span>
          </label>
          <label class="check">
            <input
              type="checkbox"
              checked={settings.forceFilesApi}
              onChange={(e) => onChange({ ...settings, forceFilesApi: e.currentTarget.checked })}
            />
            <span>Toujours passer par la Files API (test du risque R1, même pour une petite vidéo)</span>
          </label>
          <p class="muted small">La clé reste sur cet iPhone. Elle n'est envoyée qu'à Google, jamais ailleurs.</p>
        </div>
      )}
    </section>
  );
}
