// Recherche et filtres de la bibliothèque (F4) — logique pure.
import type { Recipe } from './types';

/** Minuscules, sans accents ni ligatures (« Œufs brouillés » → « oeufs brouilles »). */
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface RecipeFilter {
  query: string;
  /** Tous les tags choisis doivent être présents (ET). */
  tags: string[];
  collectionId: string | null;
}

export const EMPTY_FILTER: RecipeFilter = { query: '', tags: [], collectionId: null };

function haystack(r: Recipe): string {
  return normalizeText([r.title, ...r.tags, ...r.ingredients.map((i) => i.name)].join(' | '));
}

/** Chaque mot de la recherche doit apparaître dans le titre, un tag ou un ingrédient. */
export function filterRecipes(recipes: Recipe[], f: RecipeFilter): Recipe[] {
  const words = normalizeText(f.query).split(' ').filter(Boolean);
  return recipes.filter((r) => {
    if (f.collectionId && !r.collectionIds.includes(f.collectionId)) return false;
    if (f.tags.some((t) => !r.tags.includes(t))) return false;
    if (!words.length) return true;
    const h = haystack(r);
    return words.every((w) => h.includes(w));
  });
}

/** Tags utilisés, du plus fréquent au moins fréquent, puis alphabétique. */
export function tagsByFrequency(recipes: Recipe[]): string[] {
  const counts = new Map<string, number>();
  for (const r of recipes) for (const t of r.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr')).map(([t]) => t);
}
