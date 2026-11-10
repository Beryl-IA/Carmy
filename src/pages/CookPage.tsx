// Mode cuisine (F5) : plein écran, une étape à la fois, minuteurs, écran maintenu allumé.
import { ingredientIcon } from '../model/icons';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { getRecipe } from '../db/db';
import { formatDuration, formatQuantity, formatUnit } from '../format';
import { scaleIngredients } from '../model/scale';
import { formatClock, remainingMs, type Timer } from '../model/timers';
import type { Recipe } from '../model/types';
import { navigate, replaceRoute } from '../router';
import { useTimers } from '../timers/TimersContext';

interface Props {
  id: string;
  step?: number;
  servings?: number;
  defaultServings: number;
  /** Change à chaque navigation, même vers la même étape (ex. depuis le rappel de minuteur). */
  navToken?: unknown;
}

export function CookPage({ id, step: initialStep = 0, servings: routeServings, defaultServings, navToken }: Props) {
  const [recipe, setRecipe] = useState<Recipe | null | undefined>(undefined);
  const [step, setStep] = useState(initialStep);
  const [showIngredients, setShowIngredients] = useState(false);
  const [lockTipClosed, setLockTipClosed] = useState(false);
  const servings = routeServings ?? defaultServings;
  const timersApi = useTimers();
  const { timers, now, wakeLock } = timersApi;
  const touch = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    void getRecipe(id).then((r) => setRecipe(r ?? null));
  }, [id]);

  // Une navigation vers une autre étape (ex. depuis le rappel de minuteur) met à jour l'étape affichée.
  useEffect(() => setStep(initialStep), [navToken]);

  const count = recipe?.steps.length ?? 0;
  const current = Math.min(Math.max(step, 0), Math.max(count - 1, 0));

  // L'étape en cours est gardée dans l'adresse : un rechargement y ramène.
  useEffect(() => {
    if (recipe) replaceRoute({ name: 'cuisine', id, step: current, ...(routeServings ? { servings: routeServings } : {}) });
  }, [current, recipe]);

  const go = (dir: -1 | 1) => setStep((s) => Math.min(Math.max(s + dir, 0), count - 1));
  const exit = () => navigate({ name: 'recette', id });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'Escape') setShowIngredients(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [count]);

  const ingredients = useMemo(
    () => (recipe ? scaleIngredients(recipe.ingredients, recipe.servings, servings) : []),
    [recipe, servings],
  );

  if (recipe === undefined) return <div class="cook" aria-busy="true" />;
  if (recipe === null)
    return (
      <div class="cook">
        <p class="muted">Cette recette n'existe plus. <a href="#/recettes">Retour</a></p>
      </div>
    );

  const s = recipe.steps[current];
  const recipeTimers = timers.filter((t) => t.recipeId === id && t.state !== 'done');
  const stepTimer = recipeTimers.find((t) => t.stepIndex === current);
  const otherTimers = recipeTimers.filter((t) => t.stepIndex !== current);
  const isLast = current >= count - 1;

  const startTimer = (seconds: number) =>
    timersApi.start({ recipeId: id, recipeTitle: recipe.title, stepIndex: current, label: `Étape ${current + 1}`, durationMs: seconds * 1000 });

  const customTimer = () => {
    const raw = prompt('Durée du minuteur, en minutes', '5');
    const min = raw ? Number(raw.replace(',', '.')) : NaN;
    if (min > 0 && min <= 24 * 60) startTimer(Math.round(min * 60));
  };

  return (
    <div class="cook">
      <header class="cook-top">
        <button type="button" class="cook-icon" aria-label="Quitter le mode cuisine" onClick={exit}>✕</button>
        <div class="cook-title">
          <h1>{recipe.title}</h1>
          <span class="muted small">
            {count ? `Étape ${current + 1} sur ${count}` : 'Aucune étape'}
            {' · '}
            {wakeLock === 'on' ? '☀︎ écran maintenu allumé' : wakeLock === 'error' || wakeLock === 'unsupported' ? '⚠︎ l\'écran peut se verrouiller' : '…'}
          </span>
        </div>
        <button type="button" class="cook-icon ingredients-btn" aria-label="Voir les ingrédients" onClick={() => setShowIngredients(true)}>🧺</button>
      </header>
      <div class="cook-progress" aria-hidden="true">
        <span style={{ width: count ? `${((current + 1) / count) * 100}%` : '0%' }} />
      </div>

      <main
        class="cook-step"
        onTouchStart={(e) => {
          const t = e.touches[0];
          touch.current = t ? { x: t.clientX, y: t.clientY } : null;
        }}
        onTouchEnd={(e) => {
          const start = touch.current;
          const t = e.changedTouches[0];
          touch.current = null;
          if (!start || !t) return;
          const dx = t.clientX - start.x;
          const dy = t.clientY - start.y;
          if (Math.abs(dx) > 60 && Math.abs(dx) > 1.5 * Math.abs(dy)) go(dx < 0 ? 1 : -1);
        }}
      >
        {(wakeLock === 'error' || wakeLock === 'unsupported') && !lockTipClosed && (
          <p class="hint small row between nowrap">
            <span>
              iOS n'a pas pu garder l'écran allumé. Pour cette fois : Réglages de l'iPhone › Luminosité et affichage › Verrouillage
              automatique › Jamais (pense à le remettre ensuite).
            </span>
            <button type="button" class="icon-btn" aria-label="Masquer" onClick={() => setLockTipClosed(true)}>✕</button>
          </p>
        )}
        {s ? <p class="cook-text" aria-live="polite">{s.text}</p> : <p class="cook-text muted">Cette recette n'a pas d'étapes.</p>}

        {s && (
          <div class="cook-timer">
            {stepTimer ? (
              <TimerControls timer={stepTimer} now={now} api={timersApi} big />
            ) : s.timerSeconds ? (
              <button type="button" class="btn big timer-start" onClick={() => startTimer(s.timerSeconds!)}>
                ⏱ Lancer {formatDuration(s.timerSeconds)}
              </button>
            ) : (
              <button type="button" class="btn secondary" onClick={customTimer}>⏱ Ajouter un minuteur</button>
            )}
          </div>
        )}

        {otherTimers.length > 0 && (
          <ul class="other-timers">
            {otherTimers.map((t) => (
              <li key={t.id}>
                <button type="button" class={`dock-pill ${t.state}`} onClick={() => setStep(t.stepIndex)}>
                  ⏱ {formatClock(remainingMs(t, now))}
                  <span>{t.label}{t.state === 'paused' ? ' · en pause' : ''}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>

      <footer class="cook-nav">
        <button type="button" class="btn secondary big" disabled={current === 0} onClick={() => go(-1)} aria-label="Étape précédente">‹ Précédente</button>
        {isLast ? (
          <button type="button" class="btn big" onClick={exit}>Terminé ✓</button>
        ) : (
          <button type="button" class="btn big" onClick={() => go(1)} aria-label="Étape suivante">Suivante ›</button>
        )}
      </footer>

      {showIngredients && (
        <div class="sheet-backdrop" onClick={() => setShowIngredients(false)}>
          <section class="sheet" role="dialog" aria-modal="true" aria-label="Ingrédients" onClick={(e) => e.stopPropagation()}>
            <div class="row between nowrap">
              <h2 class="card-title">Ingrédients · {servings} {servings > 1 ? 'portions' : 'portion'}</h2>
              <button type="button" class="cook-icon" aria-label="Fermer" onClick={() => setShowIngredients(false)}>✕</button>
            </div>
            <ul class="ingredients">
              {ingredients.map((ing, i) => (
                <li key={i}>
                  <span class="ing-icon" aria-hidden="true">{ingredientIcon(ing.name, ing.aisle)}</span>
                  <span class="qty">{[formatQuantity(ing.quantity), formatUnit(ing.unit, ing.quantity)].filter(Boolean).join(' ')}</span>
                  <span class="name">
                    {ing.name}
                    {ing.note && <span class="note"> — {ing.note}</span>}
                    {ing.optional && <span class="note"> (facultatif)</span>}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}

function TimerControls({ timer, now, api, big }: { timer: Timer; now: number; api: ReturnType<typeof useTimers>; big?: boolean }) {
  return (
    <div class={`timer-controls ${big ? 'big' : ''} ${timer.state}`}>
      <span class="clock" role="timer" aria-label={`Temps restant : ${formatClock(remainingMs(timer, now))}`}>
        {formatClock(remainingMs(timer, now))}
      </span>
      <div class="row center nowrap">
        {timer.state === 'running' ? (
          <button type="button" class="btn secondary" onClick={() => api.pause(timer.id)}>Pause</button>
        ) : (
          <button type="button" class="btn" onClick={() => api.resume(timer.id)}>Reprendre</button>
        )}
        <button type="button" class="btn secondary" onClick={() => api.add(timer.id, 60_000)}>+1 min</button>
        <button type="button" class="icon-btn danger" aria-label="Annuler le minuteur" onClick={() => api.cancel(timer.id)}>✕</button>
      </div>
    </div>
  );
}
