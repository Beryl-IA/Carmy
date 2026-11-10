import type { ComponentChildren } from 'preact';
import { NUTRIENT_LABELS } from '../model/draft';
import { ingredientIcon } from '../model/icons';
import { NUTRIENTS, type Nutrition, type Recipe, type Storage } from '../model/types';
import { AISLE_LABELS, formatDuration, formatQuantity, formatUnit } from '../format';

interface Props {
  recipe: Pick<Recipe, 'title' | 'servings' | 'prepMinutes' | 'cookMinutes' | 'tags' | 'ingredients' | 'steps' | 'storage' | 'nutrition'>;
  thumbnailUrl?: string | null;
  sourceUrl?: string;
  /** Remplace l'affichage simple des portions (ex. sélecteur de portions). */
  servingsNode?: ComponentChildren;
  /** Contenu inséré après les étapes (actions, collections…). */
  children?: ComponentChildren;
  /** Bouton « Compléter avec l'IA », affiché sous les encadrés conservation/nutrition. */
  detailsAction?: ComponentChildren;
}

export function RecipeView({ recipe, thumbnailUrl, sourceUrl, servingsNode, children, detailsAction }: Props) {
  return (
    <article class="recipe">
      {thumbnailUrl && <img class="recipe-thumb" src={thumbnailUrl} alt="" />}
      <div class="recipe-body">
        <h1 class="recipe-title">{recipe.title}</h1>
        <ul class="recipe-facts">
          {!servingsNode && <li>{recipe.servings} {recipe.servings > 1 ? 'portions' : 'portion'}</li>}
          {recipe.prepMinutes != null && <li>Préparation {recipe.prepMinutes} min</li>}
          {recipe.cookMinutes != null && <li>Cuisson {recipe.cookMinutes} min</li>}
        </ul>
        {servingsNode}
        {recipe.tags.length > 0 && (
          <ul class="tags">{recipe.tags.map((t) => <li key={t}>{t}</li>)}</ul>
        )}
        {sourceUrl && (
          <p><a href={sourceUrl} target="_blank" rel="noopener noreferrer">Voir le post d'origine</a></p>
        )}

        {(recipe.storage || recipe.nutrition || detailsAction) && (
          <div class="details-grid">
            {recipe.storage && <StorageBox storage={recipe.storage} />}
            {recipe.nutrition && <NutritionBox nutrition={recipe.nutrition} />}
            {detailsAction}
          </div>
        )}

        <h2>Ingrédients ({recipe.ingredients.length})</h2>
        <ul class="ingredients">
          {recipe.ingredients.map((ing, i) => (
            <li key={i}>
              <span class="ing-icon" aria-hidden="true">{ingredientIcon(ing.name, ing.aisle)}</span>
              <span class="qty">{[formatQuantity(ing.quantity), formatUnit(ing.unit, ing.quantity)].filter(Boolean).join(' ')}</span>
              <span class="name">
                {ing.name}
                {ing.note && <span class="note"> — {ing.note}</span>}
                {ing.optional && <span class="note"> (facultatif)</span>}
                <span class="aisle">{AISLE_LABELS[ing.aisle]}</span>
              </span>
            </li>
          ))}
        </ul>

        <h2>Étapes ({recipe.steps.length})</h2>
        <ol class="steps">
          {recipe.steps.map((s, i) => (
            <li key={i}>
              {s.text}
              {s.timerSeconds ? <span class="timer">⏱ {formatDuration(s.timerSeconds)}</span> : null}
            </li>
          ))}
        </ol>
        {children}
      </div>
    </article>
  );
}

/** « 3 jours », « 1 mois », ou un texte quand la donnée manque ou que la congélation est déconseillée. */
export function storageText(storage: Storage): { fridge: string; freezer: string } {
  const f = storage.fridgeDays;
  const z = storage.freezerMonths;
  return {
    fridge: f === null ? '—' : f === 0 ? 'à consommer tout de suite' : `${f} jour${f > 1 ? 's' : ''}`,
    freezer: z === null ? '—' : z === 0 ? 'déconseillé' : `${z} mois`,
  };
}

function StorageBox({ storage }: { storage: Storage }) {
  const t = storageText(storage);
  return (
    <section class="details-box" aria-labelledby="storage-title">
      <h2 id="storage-title" class="details-title">Conservation</h2>
      <dl class="details-list">
        <div><dt>🧊 Frigo</dt><dd>{t.fridge}</dd></div>
        <div><dt>❄️ Congélateur</dt><dd>{t.freezer}</dd></div>
      </dl>
      <p class="muted small">Plat cuisiné, en boîte hermétique.</p>
    </section>
  );
}

function NutritionBox({ nutrition }: { nutrition: Nutrition }) {
  return (
    <section class="details-box" aria-labelledby="nutrition-title">
      <h2 id="nutrition-title" class="details-title">Pour 1 portion</h2>
      <dl class="details-list nutrition">
        {NUTRIENTS.filter((k) => nutrition[k] !== null).map((k) => (
          <div key={k} class={k === 'kcal' ? 'kcal' : ''}>
            <dt>{k === 'kcal' ? '🔥 Énergie' : NUTRIENT_LABELS[k]}</dt>
            <dd>{nutrition[k]}{k === 'kcal' ? ' kcal' : ' g'}</dd>
          </div>
        ))}
      </dl>
      <p class="muted small">Valeurs estimées.</p>
    </section>
  );
}
