// Jalon 1 : prototype d'extraction sur une page unique.
// Les onglets (Recettes · Ajouter · Courses · Réglages) arrivent au jalon 2.
import { Fragment } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { APP_NAME } from './config';
import { RecipeView } from './components/RecipeView';
import { SettingsCard } from './components/SettingsCard';
import { GeminiProvider, INLINE_MAX_BYTES } from './extraction/gemini';
import { ExtractionError, type ExtractionPhase, type ExtractionReport } from './extraction/types';
import { formatBytes, formatDuration } from './format';
import { extractThumbnail, videoDuration } from './media/thumbnail';
import { UpdateBanner } from './pwa/UpdateBanner';
import { loadSettings, saveSettings, type ProtoSettings } from './settings';

const PHASE_LABELS: Record<ExtractionPhase, string> = {
  envoi: 'Envoi…',
  traitement: 'Traitement de la vidéo par Google…',
  analyse: 'Analyse…',
  mise_en_forme: 'Mise en forme…',
};

const LONG_VIDEO_SECONDS = 180;

type Status =
  | { kind: 'idle' }
  | { kind: 'running'; phase: ExtractionPhase }
  | { kind: 'done'; report: ExtractionReport }
  | { kind: 'error'; error: ExtractionError };

export function App() {
  const [settings, setSettings] = useState<ProtoSettings>(loadSettings);
  const [file, setFile] = useState<File | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [sourceUrl, setSourceUrl] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [copied, setCopied] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  useEffect(() => () => { if (thumbUrl) URL.revokeObjectURL(thumbUrl); }, [thumbUrl]);

  function updateSettings(s: ProtoSettings) {
    setSettings(s);
    saveSettings(s);
  }

  async function onPick(f: File | null) {
    setFile(f);
    setStatus({ kind: 'idle' });
    setDuration(null);
    setThumbUrl(null);
    if (!f) return;
    const [d, thumb] = await Promise.all([videoDuration(f), extractThumbnail(f)]);
    setDuration(d);
    setThumbUrl(thumb ? URL.createObjectURL(thumb) : null);
  }

  async function run() {
    if (!file) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setCopied(false);
    setStatus({ kind: 'running', phase: 'envoi' });
    try {
      const provider = new GeminiProvider({ apiKey: settings.apiKey.trim(), model: settings.model, forceFilesApi: settings.forceFilesApi });
      const report = await provider.extract(
        { kind: 'video', file, fileName: file.name },
        { signal: controller.signal, onPhase: (phase) => setStatus({ kind: 'running', phase }) },
      );
      // Google a imposé un autre modèle : on le mémorise pour les prochaines fois.
      if (report.meta.model !== settings.model) updateSettings({ ...settings, model: report.meta.model });
      setStatus({ kind: 'done', report });
    } catch (e) {
      const error = e instanceof ExtractionError ? e : new ExtractionError('api', 'Erreur inattendue.', String(e));
      setStatus({ kind: 'error', error });
    } finally {
      abortRef.current = null;
    }
  }

  function reset() {
    setFile(null);
    setThumbUrl(null);
    setDuration(null);
    setSourceUrl('');
    setStatus({ kind: 'idle' });
    if (inputRef.current) inputRef.current.value = '';
  }

  async function copyResult(report: ExtractionReport) {
    const payload = {
      fichier: file ? { nom: file.name, taille: file.size, type: file.type, duree: duration } : null,
      lien: sourceUrl || null,
      meta: { ...report.meta, rawJson: undefined },
      avertissements: report.warnings,
      recette: report.recipe,
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const running = status.kind === 'running';
  const ready = Boolean(settings.apiKey && settings.model);

  return (
    <div class="app">
      <header class="app-header">
        <img src={`${import.meta.env.BASE_URL}icons/favicon.svg`} alt="" width={36} height={36} />
        <h1>{APP_NAME}</h1>
        <span class="badge">Prototype</span>
      </header>
      <UpdateBanner />
      {!online && <div class="banner warn" role="status">Hors-ligne : l'appli s'ouvre, mais l'extraction par IA nécessite Internet.</div>}

      <main class="stack">
        <SettingsCard settings={settings} onChange={updateSettings} />

        <section class="card stack">
          <h2 class="card-title">Extraire une recette d'une vidéo</h2>
          <label class={`picker ${file ? 'has-file' : ''}`}>
            <input
              ref={inputRef}
              type="file"
              accept="video/*"
              disabled={running}
              onChange={(e) => void onPick(e.currentTarget.files?.[0] ?? null)}
            />
            {thumbUrl ? <img src={thumbUrl} alt="Miniature de la vidéo" /> : <span class="picker-icon" aria-hidden="true">🎬</span>}
            <span>{file ? 'Changer de vidéo' : 'Choisir une vidéo (Photos ou Fichiers)'}</span>
          </label>

          {file && (
            <p class="muted small">
              {file.name} · {formatBytes(file.size)}
              {duration !== null && ` · ${formatDuration(duration)}`}
              {' · '}
              {settings.forceFilesApi || file.size > INLINE_MAX_BYTES ? 'envoi via Files API' : 'envoi direct'}
            </p>
          )}
          {duration !== null && duration > LONG_VIDEO_SECONDS && (
            <p class="warn-text">Vidéo de plus de 3 minutes : l'analyse consommera beaucoup de quota gratuit.</p>
          )}

          <label class="field">
            <span>Lien du post d'origine (facultatif)</span>
            <input
              type="url"
              inputMode="url"
              autocapitalize="off"
              placeholder="https://www.instagram.com/reel/…"
              value={sourceUrl}
              disabled={running}
              onInput={(e) => setSourceUrl(e.currentTarget.value.trim())}
            />
          </label>

          {!ready && <p class="muted small">Configure d'abord la clé et le modèle ci-dessus.</p>}

          {running ? (
            <div class="progress" role="status">
              <span class="spinner" aria-hidden="true" />
              <span>{PHASE_LABELS[status.phase]}</span>
              <button type="button" class="btn small ghost" onClick={() => abortRef.current?.abort()}>Annuler</button>
            </div>
          ) : (
            <button type="button" class="btn" disabled={!file || !ready || !online} onClick={() => void run()}>
              Extraire la recette
            </button>
          )}
        </section>

        {status.kind === 'error' && (
          <section class="card error-card" role="alert">
            <h2 class="card-title">Échec de l'extraction</h2>
            <p>{status.error.message}</p>
            {status.error.detail && (
              <details>
                <summary>Détail technique</summary>
                <pre>{status.error.detail}</pre>
              </details>
            )}
            <button type="button" class="btn secondary" onClick={() => void run()}>Réessayer</button>
          </section>
        )}

        {status.kind === 'done' && (
          <>
            {status.report.recipe.isRecipe ? (
              <RecipeView recipe={status.report.recipe} thumbnailUrl={thumbUrl} sourceUrl={sourceUrl || undefined} />
            ) : (
              <section class="card empty">
                <span class="empty-icon" aria-hidden="true">🤔</span>
                <h2 class="card-title">Aucune recette détectée</h2>
                <p class="muted">Cette vidéo ne semble pas contenir de recette. (La saisie manuelle arrivera au jalon 2.)</p>
              </section>
            )}

            <section class="card stack">
              <h2 class="card-title">Diagnostic</h2>
              <dl class="diag">
                <dt>Modèle</dt><dd>{status.report.meta.model}</dd>
                <dt>Mode d'envoi</dt><dd>{status.report.meta.transport === 'files_api' ? 'Files API' : 'direct (base64)'}</dd>
                {status.report.meta.bytes !== undefined && (<><dt>Taille</dt><dd>{formatBytes(status.report.meta.bytes)}</dd></>)}
                {Object.entries(status.report.meta.durationsMs).map(([k, v]) => (
                  <Fragment key={k}><dt>{PHASE_LABELS[k as ExtractionPhase].replace('…', '')}</dt><dd>{(v / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} s</dd></Fragment>
                ))}
                {status.report.meta.totalTokens !== undefined && (<><dt>Jetons</dt><dd>{status.report.meta.totalTokens.toLocaleString('fr-FR')}</dd></>)}
                <dt>Essais</dt><dd>{status.report.meta.attempts}</dd>
                {status.report.recipe.detectedLanguage && (<><dt>Langue source</dt><dd>{status.report.recipe.detectedLanguage}</dd></>)}
              </dl>
              {status.report.warnings.length > 0 && (
                <details>
                  <summary>{status.report.warnings.length} correction(s) automatique(s)</summary>
                  <ul class="small">{status.report.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
                </details>
              )}
              <details>
                <summary>JSON brut renvoyé par l'IA</summary>
                <pre>{status.report.meta.rawJson}</pre>
              </details>
              <div class="row">
                <button type="button" class="btn secondary" onClick={() => void copyResult(status.report)}>
                  {copied ? 'Copié ✓' : 'Copier le résultat'}
                </button>
                <button type="button" class="btn ghost" onClick={reset}>Nouvelle vidéo</button>
              </div>
            </section>
          </>
        )}
      </main>
      <footer class="muted small app-footer">{APP_NAME} v{__APP_VERSION__} · jalon 1</footer>
    </div>
  );
}
