// Fiche d'une recette (lecture). Portions, modification et suppression arrivent au jalon 3.
import { useEffect, useMemo, useState } from 'preact/hooks';
import { RecipeView } from '../components/RecipeView';
import { getRecipe } from '../db/db';
import type { Recipe } from '../model/types';

export function RecipePage({ id, version }: { id: string; version: number }) {
  const [recipe, setRecipe] = useState<Recipe | null | undefined>(undefined);

  useEffect(() => {
    setRecipe(undefined);
    void getRecipe(id).then((r) => setRecipe(r ?? null));
  }, [id, version]);

  const url = useMemo(() => (recipe?.thumbnail ? URL.createObjectURL(recipe.thumbnail) : null), [recipe]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  return (
    <main class="page stack">
      <a class="back" href="#/recettes">‹ Recettes</a>
      {recipe === null && <p class="muted">Cette recette n'existe plus.</p>}
      {recipe && <RecipeView recipe={recipe} thumbnailUrl={url} sourceUrl={recipe.sourceUrl} />}
    </main>
  );
}
