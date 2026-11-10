// Onglet Batch (V2-J2b) : session de batch cooking — recettes et portions, courses, déroulé (IA ou simple), récapitulatif.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { RecipePicker } from '../components/RecipePicker';
import { addToShopping, listRecipes, loadBatch, loadShopping, saveBatch } from '../db/db';
import { GeminiProvider } from '../extraction/gemini';
import { ExtractionError } from '../extraction/types';
import { formatDuration } from '../format';
import {
  BATCH_MAX_RECIPES, planIsStale, recipeColor, resolveSelections, simplePlan, storageAdvice, type BatchSession,
} from '../model/batch';
import type { Recipe, Settings } from '../model/types';

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `b${Date.now().toString(36)}`);
const emptySession = (): BatchSession => ({ id: newId(), selections: [] });

export function RecipeBadge({ index, title }: { index: number; title: string }) {
  const c = recipeColor(index);
  return <span class="recipe-badge" style={{ background: c.bg, color: c.fg }}>{title}</span>;
}

const fmtDate = (t: number) => new Date(t).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });

export function BatchPage({ settings }: { settings: Settings }) {
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const [session, setSession] = useState<BatchSession | null>(null);
  const [picking, setPicking] = useState(false);
  const [planning, setPlanning] = useState<{ chars: number } | null>(null);
  const [planError, setPlanError] = useState('');
  const [inShopping, setInShopping] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    void Promise.all([listRecipes(), loadBatch(), loadShopping()]).then(([rs, b, shop]) => {
      setRecipes(rs);
      const s = b ?? emptySession();
      setSession(s);
      setInShopping(s.selections.length > 0 && s.selections.every((x) => shop.selections.some((y) => y.recipeId === x.recipeId && y.servings === x.servings)));
    });
    return () => abortRef.current?.abort();
  }, []);

  const items = useMemo(() => (recipes && session ? resolveSelections(session.selections, recipes) : []), [recipes, session]);

  if (!recipes || !session) return <main class="page" aria-busy="true" />;

  function update(next: BatchSession) {
    setSession(next);
    void saveBatch(next.selections.length || next.plan ? next : null);
  }
  const setSelections = (selections: BatchSession['selections']) => {
    setInShopping(false);
    update({ ...session!, selections });
  };

  async function addAllToShopping() {
    for (const s of session!.selections) await addToShopping(s.recipeId, s.servings);
    setInShopping(true);
  }

  async function planWithAi() {
    const controller = new AbortController();
    abortRef.current = controller;
    setPlanError('');
    setPlanning({ chars: 0 });
    try {
      const provider = new GeminiProvider({ apiKey: (settings.apiKey ?? '').trim(), model: settings.model });
      const plan = await provider.planBatch(items, session!.selections, { signal: controller.signal, onReceive: (chars) => setPlanning({ chars }) });
      update({ ...session!, plan, step: 0 });
    } catch (e) {
      if (!(e instanceof ExtractionError && e.kind === 'annule'))
        setPlanError(e instanceof ExtractionError ? e.message : `Erreur inattendue : ${String(e)}`);
    } finally {
      abortRef.current = null;
      setPlanning(null);
    }
  }

  function abandon() {
    if (!confirm('Abandonner cette session ? Les recettes restent dans ta bibliothèque.')) return;
    void saveBatch(null);
    setSession(emptySession());
    setInShopping(false);
  }

  const totalServings = session.selections.reduce((n, s) => n + s.servings, 0);
  const aiReady = Boolean(settings.apiKey && settings.model);

  // ---------- Session terminée : récapitulatif ----------
  if (session.finishedAt) {
    const advice = storageAdvice(items, session.finishedAt);
    return (
      <main class="page stack">
        <header class="page-header"><h1>Session terminée 🎉</h1></header>
        <p>{totalServings} portions cuisinées le {fmtDate(session.finishedAt)}. Voici jusqu'à quand les garder :</p>
        <ul class="list stack batch-recap">
          {advice.map((a, i) => (
            <li key={i} class="card stack">
              <div class="row between nowrap">
                <RecipeBadge index={i} title={a.title} />
                <span class="muted small">{a.servings} portion{a.servings > 1 ? 's' : ''}</span>
              </div>
              <dl class="details-list">
                <div><dt>🧊 Frigo</dt><dd>{a.fridgeUntil ? `jusqu'au ${fmtDate(a.fridgeUntil)}` : 'durée inconnue'}</dd></div>
                <div><dt>❄️ Congélateur</dt><dd>{a.freezable === false ? 'déconseillé' : a.freezerUntil ? `jusqu'au ${fmtDate(a.freezerUntil)}` : 'durée inconnue'}</dd></div>
              </dl>
            </li>
          ))}
        </ul>
        <p class="hint small">
          Congèle dès aujourd'hui les portions que tu ne mangeras pas avant la date limite du frigo. Suis tes plats et mange-les dans l'ordre depuis la <a href="#/reserve">réserve</a>.
        </p>
        <button type="button" class="btn" onClick={() => { void saveBatch(null); setSession(emptySession()); setInShopping(false); }}>Nouvelle session</button>
      </main>
    );
  }

  const stale = planIsStale(session);
  const plan = session.plan && !stale ? session.plan : undefined;
  const resumeStep = session.startedAt && session.step ? session.step : 0;

  return (
    <main class="page stack">
      <header class="page-header">
        <h1>Batch cooking</h1>
      </header>
      <p class="muted">Cuisine plusieurs recettes en une fois : une seule liste de courses, un déroulé qui enchaîne les recettes, et des plats prêts pour la semaine.</p>

      <section class="card stack">
        <h2 class="card-title">Recettes ({session.selections.length}/{BATCH_MAX_RECIPES})</h2>
        {items.length === 0 ? (
          <p class="muted small">Choisis 2 à {BATCH_MAX_RECIPES} recettes. Les plats qui se conservent bien (mijotés, sauces, légumineuses) sont les plus adaptés.</p>
        ) : (
          <ul class="list flush">
            {items.map((it, i) => (
              <li key={it.recipe.id} class="batch-row">
                <a class="grow batch-title" href={`#/recette/${encodeURIComponent(it.recipe.id)}`}>
                  <RecipeBadge index={i} title={it.recipe.title} />
                </a>
                <div class="stepper small" role="group" aria-label={`Portions de ${it.recipe.title}`}>
                  <button type="button" class="icon-btn" aria-label="Une portion de moins" disabled={it.servings <= 1}
                    onClick={() => setSelections(session.selections.map((s, j) => (j === i ? { ...s, servings: s.servings - 1 } : s)))}>−</button>
                  <span aria-live="polite">{it.servings}</span>
                  <button type="button" class="icon-btn" aria-label="Une portion de plus" disabled={it.servings >= 30}
                    onClick={() => setSelections(session.selections.map((s, j) => (j === i ? { ...s, servings: s.servings + 1 } : s)))}>+</button>
                </div>
                <button type="button" class="icon-btn danger" aria-label={`Retirer ${it.recipe.title}`}
                  onClick={() => setSelections(session.selections.filter((_, j) => j !== i))}>✕</button>
              </li>
            ))}
          </ul>
        )}
        {items.length > 0 && <p class="small">{totalServings} portion{totalServings > 1 ? 's' : ''} au total, soit environ {Math.ceil(totalServings / 2)} jour{totalServings > 2 ? 's' : ''} de repas midi et soir.</p>}
        {session.selections.length < BATCH_MAX_RECIPES && (
          <button type="button" class="btn secondary" onClick={() => setPicking(true)}>+ Ajouter des recettes</button>
        )}
      </section>

      {items.length > 0 && (
        <section class="card stack">
          <h2 class="card-title">Courses</h2>
          <button type="button" class={`btn ${inShopping ? 'secondary' : ''}`} disabled={inShopping} onClick={() => void addAllToShopping()}>
            {inShopping ? '✓ Recettes ajoutées aux courses' : `🛒 Ajouter ${items.length > 1 ? `les ${items.length} recettes` : 'la recette'} aux courses`}
          </button>
          {inShopping && <a class="btn ghost" href="#/courses">Voir la liste</a>}
        </section>
      )}

      {items.length > 0 && (
        <section class="card stack">
          <h2 class="card-title">Déroulé de la session</h2>
          {stale && <p class="warn-text small">Les recettes ou les portions ont changé : génère un nouveau déroulé.</p>}
          {planning ? (
            <div class="progress" role="status">
              <span class="spinner" aria-hidden="true" />
              <span>{planning.chars ? `Réception du déroulé (${planning.chars} caractères)…` : 'L\'IA organise la session…'}</span>
              <button type="button" class="btn small ghost" onClick={() => abortRef.current?.abort()}>Annuler</button>
            </div>
          ) : plan ? (
            <>
              <p class="small">
                {plan.steps.length} étapes
                {plan.totalMinutes ? ` · environ ${formatDuration(plan.totalMinutes * 60)}` : ''}
                {' · '}
                {plan.source === 'ia' ? 'optimisé par l\'IA' : 'recettes l\'une après l\'autre'}
              </p>
              <a class="btn cook-launch" href={`#/batch/cuisine/${resumeStep}`}
                onClick={() => { if (!session.startedAt) update({ ...session, startedAt: Date.now() }); }}>
                👩‍🍳 {resumeStep ? `Reprendre à l'étape ${resumeStep + 1}` : 'Commencer la session'}
              </a>
              <ol class="batch-steps">
                {plan.steps.map((s, i) => (
                  <li key={i}>
                    <div class="batch-step-badges">{s.recipes.map((r) => <RecipeBadge key={r} index={r} title={items[r]?.recipe.title ?? '?'} />)}</div>
                    <p>{s.text}</p>
                    {s.timerSeconds ? <span class="timer">⏱ {formatDuration(s.timerSeconds)}</span> : null}
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <p class="muted small">
              L'IA peut enchaîner les recettes pour gagner du temps : cuissons longues d'abord, découpes regroupées, préparations pendant que ça cuit.
            </p>
          )}
          {planError && <p class="error small" role="alert">{planError}</p>}
          {!planning && (
            <div class="stack">
              {items.length > 1 && (
                <button type="button" class={`btn ${plan ? 'secondary' : ''}`} disabled={!aiReady || !navigator.onLine} onClick={() => void planWithAi()}>
                  ✨ {plan?.source === 'ia' ? 'Régénérer avec l\'IA' : 'Optimiser avec l\'IA'}
                </button>
              )}
              {plan?.source !== 'simple' && (
                <button type="button" class="btn ghost" onClick={() => update({ ...session, plan: simplePlan(items, session.selections, Date.now()), step: 0 })}>
                  Déroulé simple, sans IA
                </button>
              )}
              {!aiReady && items.length > 1 && <p class="muted small">Pour le déroulé optimisé, ajoute ta clé dans <a href="#/reglages">Réglages</a>.</p>}
            </div>
          )}
        </section>
      )}

      {session.selections.length > 0 && (
        <button type="button" class="btn ghost danger-text" onClick={abandon}>Abandonner la session</button>
      )}

      {picking && (
        <RecipePicker
          recipes={recipes.filter((r) => !session.selections.some((s) => s.recipeId === r.id))}
          emptyText="Toutes tes recettes sont déjà dans la session."
          onPick={(id) => {
            const r = recipes.find((x) => x.id === id);
            if (!r) return;
            const next = [...session.selections, { recipeId: id, servings: r.servings }];
            setSelections(next);
            if (next.length >= BATCH_MAX_RECIPES) setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </main>
  );
}
