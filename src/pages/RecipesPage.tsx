// Onglet Recettes (F4) : recherche plein texte, filtre par collection et par tags.
import { useEffect, useMemo, useState } from 'preact/hooks';
import { APP_NAME } from '../config';
import { listCollections, listRecipes } from '../db/db';
import { filterRecipes, tagsByFrequency, type RecipeFilter } from '../model/search';
import type { Collection, Recipe } from '../model/types';

interface Props {
  version: number;
  filter: RecipeFilter;
  onFilter: (f: RecipeFilter) => void;
}

export function RecipesPage({ version, filter, onFilter }: Props) {
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const [collections, setCollections] = useState<Collection[]>([]);

  useEffect(() => {
    void listRecipes().then(setRecipes);
    void listCollections().then(setCollections);
  }, [version]);

  // Une collection supprimée ne doit pas rester sélectionnée.
  useEffect(() => {
    if (filter.collectionId && collections.length && !collections.some((c) => c.id === filter.collectionId))
      onFilter({ ...filter, collectionId: null });
  }, [collections]);

  const tags = useMemo(() => tagsByFrequency(recipes ?? []), [recipes]);
  const results = useMemo(() => filterRecipes(recipes ?? [], filter), [recipes, filter]);
  const filtering = Boolean(filter.query.trim() || filter.tags.length || filter.collectionId);
  const toggleTag = (t: string) =>
    onFilter({ ...filter, tags: filter.tags.includes(t) ? filter.tags.filter((x) => x !== t) : [...filter.tags, t] });

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
        <>
          <div class="search">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" />
            </svg>
            <input
              type="search"
              placeholder="Rechercher un plat, un ingrédient, un tag…"
              aria-label="Rechercher"
              value={filter.query}
              onInput={(e) => onFilter({ ...filter, query: e.currentTarget.value })}
            />
          </div>

          <div class="chip-row" role="group" aria-label="Collections">
            <button type="button" class={`chip ${filter.collectionId === null ? 'on' : ''}`} aria-pressed={filter.collectionId === null} onClick={() => onFilter({ ...filter, collectionId: null })}>
              Toutes
            </button>
            {collections.map((c) => (
              <button key={c.id} type="button" class={`chip ${filter.collectionId === c.id ? 'on' : ''}`} aria-pressed={filter.collectionId === c.id} onClick={() => onFilter({ ...filter, collectionId: filter.collectionId === c.id ? null : c.id })}>
                📁 {c.name}
              </button>
            ))}
            <a class="chip ghost" href="#/collections">{collections.length ? 'Gérer' : '+ Collection'}</a>
          </div>

          {tags.length > 0 && (
            <div class="chip-row" role="group" aria-label="Tags">
              {tags.map((t) => (
                <button key={t} type="button" class={`chip tag ${filter.tags.includes(t) ? 'on' : ''}`} aria-pressed={filter.tags.includes(t)} onClick={() => toggleTag(t)}>
                  {t}
                </button>
              ))}
            </div>
          )}

          {filtering && (
            <div class="row between">
              <span class="muted small">{results.length} résultat{results.length > 1 ? 's' : ''}</span>
              <button type="button" class="link-btn small" onClick={() => onFilter({ query: '', tags: [], collectionId: null })}>Tout effacer</button>
            </div>
          )}

          {results.length === 0 ? (
            <section class="card empty">
              <span class="empty-icon" aria-hidden="true">🔎</span>
              <p class="muted">Aucune recette ne correspond.</p>
            </section>
          ) : (
            <ul class="recipe-list">
              {results.map((r) => <RecipeCard key={r.id} recipe={r} />)}
            </ul>
          )}
        </>
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
