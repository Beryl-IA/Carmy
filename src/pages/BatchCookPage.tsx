// Mode cuisine d'une session de batch cooking (V2-J2b) : déroulé commun, pastilles de recette, ingrédients par recette.
import { useEffect, useState } from 'preact/hooks';
import { CookView } from '../components/CookView';
import { listRecipes, loadBatch, saveBatch } from '../db/db';
import { resolveSelections, type BatchRecipe, type BatchSession } from '../model/batch';
import { navigate, replaceRoute } from '../router';
import { BATCH_TIMER_ID } from '../timers/TimersContext';
import { RecipeBadge } from './BatchPage';

export function BatchCookPage({ step, navToken }: { step?: number; navToken?: unknown }) {
  const [data, setData] = useState<{ session: BatchSession | null; items: BatchRecipe[] } | undefined>(undefined);

  useEffect(() => {
    void Promise.all([loadBatch(), listRecipes()]).then(([session, recipes]) =>
      setData({ session, items: session ? resolveSelections(session.selections, recipes) : [] }));
  }, []);

  if (data === undefined) return <div class="cook" aria-busy="true" />;
  const { session, items } = data;
  if (!session?.plan)
    return (
      <div class="cook">
        <p class="muted">Aucun déroulé de session. <a href="#/batch">Retour</a></p>
      </div>
    );
  const plan = session.plan;

  return (
    <CookView
      title="Session batch cooking"
      steps={plan.steps.map((s) => ({
        text: s.text,
        timerSeconds: s.timerSeconds,
        badges: s.recipes.map((r) => <RecipeBadge key={r} index={r} title={items[r]?.recipe.title ?? '?'} />),
      }))}
      timerOwner={{ id: BATCH_TIMER_ID, title: 'Session batch cooking' }}
      ingredientsTitle="Ingrédients de la session"
      ingredientGroups={items.map((it) => ({ title: `${it.recipe.title} · ${it.servings} portion${it.servings > 1 ? 's' : ''}`, items: it.ingredients }))}
      initialStep={step ?? session.step ?? 0}
      navToken={navToken}
      onStep={(s) => {
        replaceRoute({ name: 'batch-cuisine', step: s });
        if (s !== session.step) {
          session.step = s;
          void saveBatch({ ...session, step: s });
        }
      }}
      onExit={() => navigate({ name: 'batch' })}
      onFinish={() => {
        if (!confirm('Session terminée ? Tu verras ensuite jusqu\'à quand garder chaque plat.')) return;
        void saveBatch({ ...session, finishedAt: Date.now() }).then(() => navigate({ name: 'batch' }));
      }}
      finishLabel="Terminer ✓"
    />
  );
}
