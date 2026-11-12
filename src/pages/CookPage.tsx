// Mode cuisine d'une recette (F5) : s'appuie sur le composant générique CookView.
import { useEffect, useMemo, useState } from 'preact/hooks';
import { CookView } from '../components/CookView';
import { CookedSheet } from '../components/CookedSheet';
import { getRecipe } from '../db/db';
import { scaleIngredients } from '../model/scale';
import type { Recipe } from '../model/types';
import { navigate, replaceRoute } from '../router';

interface Props {
  id: string;
  step?: number;
  servings?: number;
  defaultServings: number;
  /** Change à chaque navigation, même vers la même étape (ex. depuis le rappel de minuteur). */
  navToken?: unknown;
  toulouse?: boolean;
}

export function CookPage({ id, step = 0, servings: routeServings, defaultServings, navToken, toulouse }: Props) {
  const [recipe, setRecipe] = useState<Recipe | null | undefined>(undefined);
  const servings = routeServings ?? defaultServings;
  const [finishing, setFinishing] = useState(false);

  useEffect(() => {
    void getRecipe(id).then((r) => setRecipe(r ?? null));
  }, [id]);

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

  const exit = () => navigate({ name: 'recette', id });
  return (
    <>
    <CookView
      title={recipe.title}
      steps={recipe.steps}
      timerOwner={{ id, title: recipe.title }}
      ingredientsTitle={`Ingrédients · ${servings} ${servings > 1 ? 'portions' : 'portion'}`}
      ingredientGroups={[{ items: ingredients }]}
      initialStep={step}
      navToken={navToken}
      onStep={(s) => replaceRoute({ name: 'cuisine', id, step: s, ...(routeServings ? { servings: routeServings } : {}) })}
      onExit={exit}
      onFinish={() => setFinishing(true)}
    />
    {finishing && (
      <CookedSheet mode="recipe" items={[{ recipe, servings, ingredients }]} onDone={exit} onCancel={() => setFinishing(false)} toulouse={toulouse} />
    )}
    </>
  );
}
