import { describe, expect, it } from 'vitest';
import {
  draftFromExtracted, draftFromRecipe, draftToRecipe, emptyDraft, emptyIngredient, moveItem, numberToInput, parseQuantity,
  type RecipeDraft,
} from '../src/model/draft';
import type { ExtractedRecipe } from '../src/extraction/types';

const extracted: ExtractedRecipe = {
  isRecipe: true, title: 'Soupe', servings: 4, prepMinutes: 10, cookMinutes: null, tags: ['entrée'],
  ingredients: [
    { name: 'carotte', quantity: 0.5, unit: 'kg', aisle: 'fruits_legumes', note: 'en rondelles' },
    { name: 'sel', quantity: null, unit: null, aisle: 'condiments_epices', optional: true },
  ],
  steps: [{ text: 'Cuire.', timerSeconds: 1200 }, { text: 'Mixer.', timerSeconds: null }],
  detectedLanguage: 'fr',
};
const id = () => 'id-1';

describe('parseQuantity', () => {
  it.each([
    ['', null], ['  ', null], ['2', 2], ['1,5', 1.5], ['1.5', 1.5], ['1/2', 0.5], ['1 1/2', 1.5],
    ['½', 0.5], ['1½', 1.5], ['1 ½', 1.5], [',5', 0.5],
  ])('« %s » → %s', (s, n) => expect(parseQuantity(s)).toBe(n));
  it.each(['abc', '1/0', '2 oeufs', '-1'])('« %s » est illisible', (s) => expect(parseQuantity(s)).toBeUndefined());
});

describe('numberToInput', () => {
  it('écrit à la française', () => {
    expect(numberToInput(0.5)).toBe('0,5');
    expect(numberToInput(1 / 3)).toBe('0,333');
    expect(numberToInput(null)).toBe('');
  });
});

describe('draftToRecipe', () => {
  it('fait l\'aller-retour IA → brouillon → recette sans perte', () => {
    const d = draftFromExtracted(extracted, { type: 'video', url: 'https://instagram.com/reel/x' });
    const r = draftToRecipe(d, 1000, id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.recipe).toMatchObject({
      id: 'id-1', title: 'Soupe', servings: 4, prepMinutes: 10, cookMinutes: null, tags: ['entrée'],
      sourceType: 'video', sourceUrl: 'https://instagram.com/reel/x', createdAt: 1000, updatedAt: 1000,
    });
    expect(r.recipe.ingredients).toEqual(extracted.ingredients);
    expect(r.recipe.steps).toEqual(extracted.steps);
    // et retour vers un brouillon d'édition
    const again = draftToRecipe(draftFromRecipe(r.recipe), 2000, () => 'autre');
    expect(again.ok && again.recipe).toMatchObject({ id: 'id-1', createdAt: 1000, updatedAt: 2000 });
  });

  it('ignore les lignes vides et normalise', () => {
    const d: RecipeDraft = {
      ...emptyDraft(2),
      title: '  Salade ',
      tags: [' Rapide', 'rapide', ''],
      ingredients: [emptyIngredient(), { ...emptyIngredient(), name: ' Tomate ', quantity: '2' }],
      steps: [{ key: 'a', text: '  ', timerMinutes: '' }, { key: 'b', text: 'Couper', timerMinutes: '1,5' }],
    };
    const r = draftToRecipe(d, 1, id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.recipe.title).toBe('Salade');
    expect(r.recipe.servings).toBe(2);
    expect(r.recipe.tags).toEqual(['rapide']);
    expect(r.recipe.ingredients).toEqual([{ name: 'tomate', quantity: 2, unit: null, aisle: 'autre' }]);
    expect(r.recipe.steps).toEqual([{ text: 'Couper', timerSeconds: 90 }]);
    expect(r.recipe.sourceType).toBe('manual');
    expect('sourceUrl' in r.recipe).toBe(false);
  });

  it('liste toutes les erreurs', () => {
    const d: RecipeDraft = {
      ...emptyDraft(),
      title: '',
      servings: '0',
      prepMinutes: 'dix',
      ingredients: [{ ...emptyIngredient(), quantity: '2' }, { ...emptyIngredient(), name: 'lait', quantity: 'un peu' }],
      steps: [{ key: 's', text: 'Cuire', timerMinutes: 'x' }],
      sourceUrl: 'instagram.com/reel',
    };
    const r = draftToRecipe(d, 1, id);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors).toHaveLength(7);
  });
});

describe('moveItem', () => {
  it('déplace sans muter et ignore les bords', () => {
    const a = [1, 2, 3];
    expect(moveItem(a, 0, 1)).toEqual([2, 1, 3]);
    expect(moveItem(a, 2, -1)).toEqual([1, 3, 2]);
    expect(moveItem(a, 0, -1)).toBe(a);
    expect(moveItem(a, 2, 1)).toBe(a);
    expect(a).toEqual([1, 2, 3]);
  });
});
