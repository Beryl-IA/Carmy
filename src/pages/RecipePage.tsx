// Fiche détail (F4) : portions ajustables, collections, modifier, supprimer.
import { useEffect, useMemo, useState } from 'preact/hooks';
import { RecipeView } from '../components/RecipeView';
import { addToShopping, deleteRecipe, getRecipe, listCollections, loadShopping, saveCollection, setRecipeInCollection } from '../db/db';
import { scaleIngredients } from '../model/scale';
import type { Collection, Recipe } from '../model/types';
import { navigate } from '../router';

interface Props {
  id: string;
  version: number;
  defaultServings: number;
  onChanged: () => void;
}

export function RecipePage({ id, version, defaultServings, onChanged }: Props) {
  const [recipe, setRecipe] = useState<Recipe | null | undefined>(undefined);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [servings, setServings] = useState(defaultServings);
  /** Portions de cette recette dans la liste de courses (null si absente). */
  const [inList, setInList] = useState<number | null>(null);

  useEffect(() => {
    void getRecipe(id).then((r) => setRecipe(r ?? null));
    void listCollections().then(setCollections);
    void loadShopping().then((s) => setInList(s.selections.find((x) => x.recipeId === id)?.servings ?? null));
  }, [id, version]);

  // Les portions ne se réinitialisent qu'en changeant de recette (pas en rangeant dans une collection).
  useEffect(() => setServings(defaultServings), [id, defaultServings]);

  const url = useMemo(() => (recipe?.thumbnail ? URL.createObjectURL(recipe.thumbnail) : null), [recipe?.thumbnail]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  const scaled = useMemo(
    () => (recipe ? { ...recipe, ingredients: scaleIngredients(recipe.ingredients, recipe.servings, servings) } : null),
    [recipe, servings],
  );

  async function toggleCollection(c: Collection, inside: boolean) {
    if (!recipe) return;
    const r = await setRecipeInCollection(recipe.id, c.id, inside);
    if (r) setRecipe(r);
    onChanged();
  }

  async function newCollection() {
    const name = prompt('Nom de la nouvelle collection')?.trim();
    if (!name || !recipe) return;
    const c: Collection = { id: crypto.randomUUID ? crypto.randomUUID() : `c${Date.now()}`, name };
    await saveCollection(c);
    setCollections(await listCollections());
    await toggleCollection(c, true);
  }

  async function addToList() {
    await addToShopping(id, servings);
    setInList(servings);
  }

  async function remove() {
    if (!recipe || !confirm(`Supprimer « ${recipe.title} » ? Cette action est définitive.`)) return;
    await deleteRecipe(recipe.id);
    onChanged();
    navigate({ name: 'recettes' });
  }

  return (
    <main class="page stack">
      <div class="row between nowrap">
        <a class="back" href="#/recettes">‹ Recettes</a>
        {recipe && <a class="btn small secondary" href={`#/modifier/${encodeURIComponent(recipe.id)}`}>Modifier</a>}
      </div>
      {recipe === null && <p class="muted">Cette recette n'existe plus.</p>}
      {recipe && scaled && (
        <RecipeView
          recipe={scaled}
          thumbnailUrl={url}
          sourceUrl={recipe.sourceUrl}
          servingsNode={
            <>
            <div class="servings">
              <div class="stepper" role="group" aria-label="Nombre de portions">
                <button type="button" class="icon-btn" aria-label="Une portion de moins" disabled={servings <= 1} onClick={() => setServings(servings - 1)}>−</button>
                <span aria-live="polite">{servings} {servings > 1 ? 'portions' : 'portion'}</span>
                <button type="button" class="icon-btn" aria-label="Une portion de plus" disabled={servings >= 50} onClick={() => setServings(servings + 1)}>+</button>
              </div>
              {servings !== recipe.servings && (
                <button type="button" class="link-btn small" onClick={() => setServings(recipe.servings)}>
                  Fiche d'origine : {recipe.servings} {recipe.servings > 1 ? 'portions' : 'portion'}
                </button>
              )}
            </div>
            <div class="row nowrap">
              <button type="button" class={`btn grow ${inList === servings ? 'secondary' : ''}`} disabled={inList === servings} onClick={() => void addToList()}>
                {inList === null ? '🛒 Ajouter aux courses' : inList === servings ? `✓ Dans la liste (${inList} portion${inList > 1 ? 's' : ''})` : `🛒 Passer à ${servings} portion${servings > 1 ? 's' : ''} (liste : ${inList})`}
              </button>
              {inList !== null && <a class="btn ghost" href="#/courses">Voir</a>}
            </div>
            {recipe.steps.length > 0 && (
              <a class="btn cook-launch" href={`#/cuisine/${encodeURIComponent(recipe.id)}/0/${servings}`}>
                👩‍🍳 Mode cuisine
              </a>
            )}
            </>
          }
        >
          <h3>Collections</h3>
          <ul class="tags suggestions">
            {collections.map((c) => {
              const inside = recipe.collectionIds.includes(c.id);
              return (
                <li key={c.id}>
                  <button type="button" class={inside ? 'on' : ''} aria-pressed={inside} onClick={() => void toggleCollection(c, !inside)}>
                    {inside ? '✓ ' : '+ '}{c.name}
                  </button>
                </li>
              );
            })}
            <li><button type="button" onClick={() => void newCollection()}>+ Nouvelle collection</button></li>
          </ul>
          <button type="button" class="btn ghost danger-text" onClick={() => void remove()}>Supprimer la recette</button>
        </RecipeView>
      )}
    </main>
  );
}
