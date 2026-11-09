import type { Recipe } from '../model/types';
import { AISLE_LABELS, formatDuration, formatQuantity, formatUnit } from '../format';

interface Props {
  recipe: Pick<Recipe, 'title' | 'servings' | 'prepMinutes' | 'cookMinutes' | 'tags' | 'ingredients' | 'steps'>;
  thumbnailUrl?: string | null;
  sourceUrl?: string;
}

export function RecipeView({ recipe, thumbnailUrl, sourceUrl }: Props) {
  return (
    <article class="recipe">
      {thumbnailUrl && <img class="recipe-thumb" src={thumbnailUrl} alt="" />}
      <div class="recipe-body">
        <h2 class="recipe-title">{recipe.title}</h2>
        <ul class="recipe-facts">
          <li>{recipe.servings} {recipe.servings > 1 ? 'portions' : 'portion'}</li>
          {recipe.prepMinutes != null && <li>Préparation {recipe.prepMinutes} min</li>}
          {recipe.cookMinutes != null && <li>Cuisson {recipe.cookMinutes} min</li>}
        </ul>
        {recipe.tags.length > 0 && (
          <ul class="tags">{recipe.tags.map((t) => <li key={t}>{t}</li>)}</ul>
        )}
        {sourceUrl && (
          <p><a href={sourceUrl} target="_blank" rel="noopener noreferrer">Voir le post d'origine</a></p>
        )}

        <h3>Ingrédients ({recipe.ingredients.length})</h3>
        <ul class="ingredients">
          {recipe.ingredients.map((ing, i) => (
            <li key={i}>
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

        <h3>Étapes ({recipe.steps.length})</h3>
        <ol class="steps">
          {recipe.steps.map((s, i) => (
            <li key={i}>
              {s.text}
              {s.timerSeconds ? <span class="timer">⏱ {formatDuration(s.timerSeconds)}</span> : null}
            </li>
          ))}
        </ol>
      </div>
    </article>
  );
}
