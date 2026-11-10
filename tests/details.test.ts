import { describe, expect, it } from 'vitest';
import { normalizeNutrition, normalizeStorage, parseExtractedRecipe, parseRecipeDetails } from '../src/extraction/validate';
import { InvalidRecipeJson } from '../src/extraction/validate';
import { applyDetails, needsDetails } from '../src/model/details';
import { detailsToDraft, draftToRecipe, emptyDraft } from '../src/model/draft';
import { storageText } from '../src/components/RecipeView';
import type { Recipe } from '../src/model/types';

const recipe = (extra: Partial<Recipe> = {}): Recipe => ({
  id: 'r', title: 'Chili', servings: 4, tags: [], collectionIds: [], sourceType: 'manual', createdAt: 1, updatedAt: 1,
  ingredients: [{ name: 'riz', quantity: 300, unit: 'g', aisle: 'epicerie_salee' }], steps: [], ...extra,
});
const nutrition = { kcal: 520, protein: 28, carbs: 60, fat: 14, fiber: 9 };

describe('estimations de l\'IA', () => {
  it('lit conservation et nutrition dans une extraction', () => {
    const { recipe: r } = parseExtractedRecipe(JSON.stringify({
      isRecipe: true, title: 'Chili', servings: 4, tags: [], ingredients: [], steps: [],
      storage: { fridgeDays: 3, freezerMonths: 3 }, nutrition: { ...nutrition, kcal: 519.6 },
    }));
    expect(r.storage).toEqual({ fridgeDays: 3, freezerMonths: 3 });
    expect(r.nutrition).toEqual(nutrition);
  });
  it('ignore des estimations absentes ou vides', () => {
    const { recipe: r } = parseExtractedRecipe(JSON.stringify({ isRecipe: true, title: 'X', servings: 1, tags: [], ingredients: [], steps: [], storage: null }));
    expect(r.storage).toBeUndefined();
    expect(r.nutrition).toBeUndefined();
    expect(normalizeNutrition({ kcal: null, protein: 'abc' })).toBeUndefined();
  });
  it('borne des durées invraisemblables et garde 0 (congélation déconseillée)', () => {
    expect(normalizeStorage({ fridgeDays: 90, freezerMonths: 0 })).toEqual({ fridgeDays: 30, freezerMonths: 0 });
    expect(normalizeStorage({ fridgeDays: -2, freezerMonths: 60 })).toEqual({ fridgeDays: null, freezerMonths: 24 });
  });
  it('lit la réponse de « Compléter avec l\'IA »', () => {
    expect(parseRecipeDetails(JSON.stringify({ storage: { fridgeDays: 2, freezerMonths: null }, nutrition }))).toEqual({
      storage: { fridgeDays: 2, freezerMonths: null }, nutrition,
    });
    expect(() => parseRecipeDetails('{}')).toThrow(InvalidRecipeJson);
  });
});

describe('compléter une recette', () => {
  it('repère les recettes incomplètes', () => {
    expect(needsDetails(recipe())).toBe(true);
    expect(needsDetails(recipe({ storage: { fridgeDays: 3, freezerMonths: 3 }, nutrition }))).toBe(false);
    expect(needsDetails(recipe({ ingredients: [] }))).toBe(false);
  });
  it('n\'écrase jamais une valeur existante', () => {
    const mine = { fridgeDays: 2, freezerMonths: 0 };
    const out = applyDetails(recipe({ storage: mine }), { storage: { fridgeDays: 4, freezerMonths: 3 }, nutrition }, 99);
    expect(out.storage).toEqual(mine);
    expect(out.nutrition).toEqual(nutrition);
    expect(out.updatedAt).toBe(99);
  });
});

describe('relecture', () => {
  it('enregistre conservation et nutrition saisies', () => {
    const d = { ...emptyDraft(), title: 'Chili', ...detailsToDraft({ fridgeDays: 3, freezerMonths: 0 }, nutrition) };
    const r = draftToRecipe(d, 1, () => 'id');
    expect(r.ok && r.recipe.storage).toEqual({ fridgeDays: 3, freezerMonths: 0 });
    expect(r.ok && r.recipe.nutrition).toEqual(nutrition);
  });
  it('n\'ajoute rien si tout est vide, et refuse une valeur illisible', () => {
    const r = draftToRecipe({ ...emptyDraft(), title: 'X' }, 1, () => 'id');
    expect(r.ok && ('storage' in r.recipe || 'nutrition' in r.recipe)).toBe(false);
    const bad = draftToRecipe({ ...emptyDraft(), title: 'X', fridgeDays: 'trois' }, 1, () => 'id');
    expect(bad.ok).toBe(false);
  });
  it('affiche la conservation en clair', () => {
    expect(storageText({ fridgeDays: 1, freezerMonths: 0 })).toEqual({ fridge: '1 jour', freezer: 'déconseillé' });
    expect(storageText({ fridgeDays: null, freezerMonths: 3 })).toEqual({ fridge: '—', freezer: '3 mois' });
  });
});
