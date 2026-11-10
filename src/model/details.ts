// « Compléter avec l'IA » (V2-J2) : quelles recettes compléter et comment fusionner les estimations. Logique pure.
import type { RecipeDetails } from '../extraction/types';
import type { Recipe } from './types';

/** Une recette est à compléter s'il lui manque la conservation ou les valeurs nutritionnelles. */
export function needsDetails(r: Pick<Recipe, 'storage' | 'nutrition' | 'ingredients'>): boolean {
  return r.ingredients.length > 0 && (!r.storage || !r.nutrition);
}

/** Ajoute uniquement ce qui manque : une valeur saisie ou corrigée à la main n'est jamais écrasée. */
export function applyDetails(r: Recipe, d: RecipeDetails, now: number): Recipe {
  const storage = r.storage ?? d.storage;
  const nutrition = r.nutrition ?? d.nutrition;
  return { ...r, ...(storage ? { storage } : {}), ...(nutrition ? { nutrition } : {}), updatedAt: now };
}
