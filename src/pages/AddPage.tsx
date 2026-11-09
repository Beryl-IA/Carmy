// Onglet Ajouter (F1) : vidéo, texte collé ou saisie manuelle → relecture (F3) → enregistrement.
import { useEffect, useRef, useState } from 'preact/hooks';
import { RecipeEditor } from '../components/RecipeEditor';
import { listRecipes, saveRecipe } from '../db/db';
import { GeminiProvider, INLINE_MAX_BYTES } from '../extraction/gemini';
import { ExtractionError, type ExtractionPhase, type ExtractionReport } from '../extraction/types';
import { formatBytes, formatDuration } from '../format';
import { extractThumbnail, videoDuration } from '../media/thumbnail';
import { draftFromExtracted, draftToRecipe, emptyDraft, type RecipeDraft } from '../model/draft';
import type { Settings, SourceType } from '../model/types';
import { navigate } from '../router';

const PHASE_LABELS: Record<ExtractionPhase, string> = {
  envoi: 'Envoi…',
  traitement: 'Traitement de la vidéo par Google…',
  analyse: 'Analyse…',
  mise_en_forme: 'Mise en forme…',
};
const LONG_VIDEO_SECONDS = 180;

type Mode = 'video' | 'text' | 'manual';
type Stage =
  | { kind: 'input' }
  | { kind: 'running'; phase: ExtractionPhase; chars?: number }
  | { kind: 'error'; error: ExtractionError }
  | { kind: 'norecipe' }
  | { kind: 'review'; draft: RecipeDraft; report?: ExtractionReport };

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `r${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`);

interface Props {
  settings: Settings;
  onSaved: () => void;
}

export function AddPage({ settings, onSaved }: Props) {
  const [mode, setMode] = useState<Mode>('video');
  const [stage, setStage] = useState<Stage>({ kind: 'input' });
  const [file, setFile] = useState<File | null>(null);
  const [thumb, setThumb] = useState<Blob | null>(null);
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [knownTags, setKnownTags] = useState<string[]>([]);
  const [online, setOnline] = useState(navigator.onLine);
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [wentBackground, setWentBackground] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const running = stage.kind === 'running';
  const aiReady = Boolean(settings.apiKey && settings.model);

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

  useEffect(() => {
    if (!running) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const onVis = () => { if (document.visibilityState === 'hidden') setWentBackground(true); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(tick);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [running]);

  useEffect(() => () => { if (thumbUrl) URL.revokeObjectURL(thumbUrl); }, [thumbUrl]);

  // Tags existants proposés en suggestion pendant la relecture.
  useEffect(() => {
    if (stage.kind !== 'review') return;
    void listRecipes().then((rs) => setKnownTags([...new Set(rs.flatMap((r) => r.tags))].sort()));
  }, [stage.kind]);

  async function onPick(f: File | null) {
    setFile(f);
    setStage({ kind: 'input' });
    setDuration(null);
    setThumb(null);
    setThumbUrl(null);
    if (!f) return;
    const [d, t] = await Promise.all([videoDuration(f), extractThumbnail(f)]);
    setDuration(d);
    setThumb(t);
    setThumbUrl(t ? URL.createObjectURL(t) : null);
  }

  async function extract() {
    const input = mode === 'video' ? (file ? { kind: 'video' as const, file, fileName: file.name } : null)
      : text.trim() ? { kind: 'text' as const, text: text.trim() } : null;
    if (!input) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setWentBackground(false);
    setStartedAt(Date.now());
    setNow(Date.now());
    setStage({ kind: 'running', phase: input.kind === 'video' ? 'envoi' : 'analyse' });
    try {
      const provider = new GeminiProvider({
        apiKey: (settings.apiKey ?? '').trim(), model: settings.model, forceFilesApi: settings.forceFilesApi, fastMode: settings.fastMode,
      });
      const report = await provider.extract(input, {
        signal: controller.signal,
        onPhase: (phase) => setStage({ kind: 'running', phase }),
        onReceive: (chars) => setStage({ kind: 'running', phase: 'analyse', chars }),
      });
      if (!report.recipe.isRecipe) {
        setStage({ kind: 'norecipe' });
        return;
      }
      const type: SourceType = input.kind;
      setErrors([]);
      setStage({
        kind: 'review',
        report,
        draft: draftFromExtracted(report.recipe, { type, url: sourceUrl.trim() || undefined, thumbnail: type === 'video' ? thumb ?? undefined : undefined }),
      });
    } catch (e) {
      const error = e instanceof ExtractionError ? e : new ExtractionError('api', 'Erreur inattendue.', String(e));
      setStage(error.kind === 'annule' ? { kind: 'input' } : { kind: 'error', error });
    } finally {
      abortRef.current = null;
    }
  }

  function startManual() {
    setErrors([]);
    setStage({
      kind: 'review',
      draft: { ...emptyDraft(settings.defaultServings), sourceUrl: sourceUrl.trim(), thumbnail: mode === 'video' ? thumb ?? undefined : undefined },
    });
  }

  function resetAll() {
    setStage({ kind: 'input' });
    setFile(null);
    setThumb(null);
    setThumbUrl(null);
    setDuration(null);
    setText('');
    setSourceUrl('');
    setErrors([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function save(draft: RecipeDraft) {
    const result = draftToRecipe(draft, Date.now(), newId);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setSaving(true);
    try {
      await saveRecipe(result.recipe);
      // La vidéo n'est jamais conservée (F1.5) : on lâche toutes les références.
      resetAll();
      onSaved();
      navigate({ name: 'recette', id: result.recipe.id });
    } catch (e) {
      setErrors([`Enregistrement impossible : ${String(e)}`]);
    } finally {
      setSaving(false);
    }
  }

  // ---------- Relecture ----------
  if (stage.kind === 'review') {
    return (
      <main class="page stack">
        <header class="page-header">
          <h1>Relecture</h1>
          <button type="submit" form="recipe-editor" class="btn small header-action" disabled={saving}>Enregistrer</button>
        </header>
        <p class="hint">Vérifie et corrige la recette. Rien n'est enregistré tant que tu n'as pas touché « Enregistrer ».</p>
        {stage.report && <ExtractionDiagnostic report={stage.report} />}
        <RecipeEditor
          draft={stage.draft}
          onChange={(draft) => setStage({ ...stage, draft })}
          onSave={() => void save(stage.draft)}
          onCancel={() => {
            if (confirm('Abandonner cette recette ? Ce que tu as saisi sera perdu.')) resetAll();
          }}
          errors={errors}
          saving={saving}
          knownTags={knownTags}
        />
      </main>
    );
  }

  // ---------- Saisie ----------
  const elapsed = formatDuration(Math.max(0, Math.round((now - startedAt) / 1000)));
  return (
    <main class="page stack">
      <header class="page-header">
        <h1>Ajouter une recette</h1>
      </header>

      <div class="segmented" role="tablist" aria-label="Source de la recette">
        {([['video', 'Vidéo'], ['text', 'Texte collé'], ['manual', 'À la main']] as [Mode, string][]).map(([m, label]) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            class={mode === m ? 'active' : ''}
            disabled={running}
            onClick={() => {
              setMode(m);
              if (stage.kind !== 'running') setStage({ kind: 'input' });
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <section class="card stack">
        {mode === 'video' && (
          <>
            <label class={`picker ${file ? 'has-file' : ''}`}>
              <input ref={fileInputRef} type="file" accept="video/*" disabled={running} onChange={(e) => void onPick(e.currentTarget.files?.[0] ?? null)} />
              {thumbUrl ? <img src={thumbUrl} alt="Miniature de la vidéo" /> : <span class="picker-icon" aria-hidden="true">🎬</span>}
              <span>{file ? 'Changer de vidéo' : 'Choisir une vidéo (Photos ou Fichiers)'}</span>
            </label>
            {file && (
              <p class="muted small">
                {formatBytes(file.size)}
                {duration !== null && ` · ${formatDuration(duration)}`}
                {' · '}
                {settings.forceFilesApi || file.size > INLINE_MAX_BYTES ? 'envoi via Files API' : 'envoi direct'}
              </p>
            )}
            {duration !== null && duration > LONG_VIDEO_SECONDS && (
              <p class="warn-text">Vidéo de plus de 3 minutes : l'analyse consommera beaucoup de quota gratuit.</p>
            )}
          </>
        )}

        {mode === 'text' && (
          <label class="field">
            <span>Texte de la recette</span>
            <textarea
              rows={8}
              placeholder="Colle ici la légende du post, la description ou la recette…"
              value={text}
              disabled={running}
              onInput={(e) => setText(e.currentTarget.value)}
            />
          </label>
        )}

        {mode === 'manual' && <p class="muted">Remplis la fiche toi-même, sans IA. Le lien d'origine est facultatif.</p>}

        <label class="field">
          <span>Lien du post d'origine (facultatif)</span>
          <input
            type="url"
            inputMode="url"
            autocapitalize="off"
            placeholder="https://www.instagram.com/reel/…"
            value={sourceUrl}
            disabled={running}
            onInput={(e) => setSourceUrl(e.currentTarget.value)}
          />
        </label>

        {mode === 'manual' ? (
          <button type="button" class="btn" onClick={startManual}>Commencer la saisie</button>
        ) : running ? (
          <div class="stack">
            <div class="progress" role="status">
              <span class="spinner" aria-hidden="true" />
              <span>
                {stage.chars ? `Réception de la réponse (${stage.chars} caractères)…` : PHASE_LABELS[stage.phase]} <span class="muted">{elapsed}</span>
              </span>
              <button type="button" class="btn small ghost" onClick={() => abortRef.current?.abort()}>Annuler</button>
            </div>
            <p class={wentBackground ? 'warn-text small' : 'muted small'}>
              {wentBackground
                ? 'L\'appli est passée en arrière-plan : iOS a pu interrompre l\'analyse. Si rien ne bouge, touche Annuler puis réessaie en restant sur l\'appli.'
                : 'Reste sur l\'appli pendant l\'analyse : si tu en changes, iOS la met en pause.'}
            </p>
          </div>
        ) : (
          <>
            {!aiReady && (
              <p class="muted small">
                Pour l'extraction par IA, ajoute d'abord ta clé dans <a href="#/reglages">Réglages</a>.
              </p>
            )}
            {!online && <p class="warn-text small">Hors-ligne : l'extraction par IA nécessite Internet. La saisie à la main fonctionne.</p>}
            <button
              type="button"
              class="btn"
              disabled={!aiReady || !online || (mode === 'video' ? !file : !text.trim())}
              onClick={() => void extract()}
            >
              Extraire la recette
            </button>
          </>
        )}
      </section>

      {stage.kind === 'error' && (
        <section class="card error-card" role="alert">
          <h2 class="card-title">Échec de l'extraction</h2>
          <p>{stage.error.message}</p>
          {stage.error.durationsMs && Object.keys(stage.error.durationsMs).length > 0 && (
            <p class="muted small">
              {Object.entries(stage.error.durationsMs)
                .map(([k, v]) => `${PHASE_LABELS[k as ExtractionPhase].replace('…', '')} : ${formatDuration(Math.round(v / 1000))}`)
                .join(' · ')}
            </p>
          )}
          {stage.error.detail && (
            <details>
              <summary>Détail technique</summary>
              <pre>{stage.error.detail}</pre>
            </details>
          )}
          <div class="row">
            <button type="button" class="btn secondary" onClick={() => void extract()}>Réessayer</button>
            <button type="button" class="btn ghost" onClick={startManual}>Saisir à la main</button>
          </div>
        </section>
      )}

      {stage.kind === 'norecipe' && (
        <section class="card empty">
          <span class="empty-icon" aria-hidden="true">🤔</span>
          <h2 class="card-title">Aucune recette détectée</h2>
          <p class="muted">{mode === 'video' ? 'Cette vidéo' : 'Ce texte'} ne semble pas contenir de recette.</p>
          <div class="row center">
            <button type="button" class="btn secondary" onClick={startManual}>Saisir à la main</button>
            <button
              type="button"
              class="btn ghost"
              onClick={() => {
                setMode('text');
                setStage({ kind: 'input' });
              }}
            >
              Coller un texte
            </button>
          </div>
        </section>
      )}
    </main>
  );
}

function ExtractionDiagnostic({ report }: { report: ExtractionReport }) {
  const total = Object.values(report.meta.durationsMs).reduce((a, b) => a + (b ?? 0), 0);
  return (
    <details class="diag-box">
      <summary>
        Extraite par l'IA en {formatDuration(Math.round(total / 1000))}
        {report.warnings.length > 0 && ` · ${report.warnings.length} correction(s)`}
      </summary>
      <dl class="diag">
        <dt>Modèle</dt><dd>{report.meta.model}</dd>
        <dt>Mode d'envoi</dt><dd>{report.meta.transport === 'files_api' ? 'Files API' : report.meta.transport === 'inline' ? 'direct' : 'texte'}</dd>
        {report.meta.totalTokens !== undefined && (<><dt>Jetons</dt><dd>{report.meta.totalTokens.toLocaleString('fr-FR')}</dd></>)}
        {report.recipe.detectedLanguage && (<><dt>Langue source</dt><dd>{report.recipe.detectedLanguage}</dd></>)}
      </dl>
      {report.warnings.length > 0 && <ul class="small">{report.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}
    </details>
  );
}
