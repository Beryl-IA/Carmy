// Onglet Recettes : liste de la bibliothèque. Recherche, tags et collections arrivent au jalon 3.
import { useEffect, useMemo, useState } from 'preact/hooks';
import { listRecipes } from '../db/db';
import type { Recipe } from '../model/types';
import { APP_NAME } from '../config';

export function RecipesPage({ version }: { version: number }) {
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);

  useEffect(() => {
    void listRecipes().then(setRecipes);
  }, [version]);

  return (
    <main class="page stack">
      <header class="page-header brand">
        <img src={`${import.meta.env.BASE_URL}icons/favicon.svg`} alt="" width={36} height={36} />
        <h1>{APP_NAME}</h1>
        {recipes && recipes.length > 0 && <span class="muted count">{recipes.length} recette{recipes.length > 1 ? 's' : ''}</span>}
      </header>
      {recipes === null ? null : recipes.length === 0 ? (
        <section class="card empty">
          <span class="empty-icon" aria-hidden="true">🍲</span>
          <h2 class="card-title">Ta bibliothèque est vide</h2>
          <p class="muted">Ajoute ta première recette depuis une vidéo, un texte ou à la main.</p>
          <a class="btn" href="#/ajouter">Ajouter une recette</a>
        </section>
      ) : (
        <ul class="recipe-list">
          {recipes.map((r) => <RecipeCard key={r.id} recipe={r} />)}
        </ul>
      )}
    </main>
  );
}

function RecipeCard({ recipe }: { recipe: Recipe }) {
  const url = useMemo(() => (recipe.thumbnail ? URL.createObjectURL(recipe.thumbnail) : null), [recipe.thumbnail]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  const total = (recipe.prepMinutes ?? 0) + (recipe.cookMinutes ?? 0);
  return (
    <li>
      <a class="recipe-card" href={`#/recette/${encodeURIComponent(recipe.id)}`}>
        {url ? <img src={url} alt="" loading="lazy" /> : <span class="thumb-placeholder" aria-hidden="true">🍽️</span>}
        <span class="recipe-card-body">
          <span class="recipe-card-title">{recipe.title}</span>
          {total > 0 && <span class="muted small">⏱ {total} min</span>}
          {recipe.tags.length > 0 && <span class="card-tags">{recipe.tags.slice(0, 3).join(' · ')}</span>}
        </span>
      </a>
    </li>
  );
}
