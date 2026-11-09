import { describe, expect, it } from 'vitest';
import { InvalidRecipeJson, parseExtractedRecipe } from '../src/extraction/validate';
import { geminiVideoMime } from '../src/extraction/gemini';
import { formatQuantity, formatUnit } from '../src/format';

const base = {
  isRecipe: true,
  title: 'Pâtes à la tomate',
  servings: 2,
  prepMinutes: 10,
  cookMinutes: 12,
  tags: ['Plat', 'rapide', 'plat'],
  ingredients: [
    { name: 'Oignon', quantity: 2, unit: 'piece', aisle: 'fruits_legumes', note: 'émincé', optional: false },
    { name: 'sel', quantity: null, unit: null, aisle: 'condiments_epices' },
  ],
  steps: [{ text: 'Faire cuire les pâtes 10 minutes.', timerSeconds: 600 }, { text: 'Servir.', timerSeconds: null }],
  detectedLanguage: 'EN',
};

describe('parseExtractedRecipe', () => {
  it('accepte une recette valide et normalise', () => {
    const { recipe, warnings } = parseExtractedRecipe(JSON.stringify(base));
    expect(warnings).toEqual([]);
    expect(recipe.title).toBe('Pâtes à la tomate');
    expect(recipe.tags).toEqual(['plat', 'rapide']);
    expect(recipe.ingredients[0]).toEqual({ name: 'oignon', quantity: 2, unit: 'piece', aisle: 'fruits_legumes', note: 'émincé' });
    expect(recipe.ingredients[1]).toEqual({ name: 'sel', quantity: null, unit: null, aisle: 'condiments_epices' });
    expect(recipe.steps[0]?.timerSeconds).toBe(600);
    expect(recipe.steps[1]?.timerSeconds).toBeNull();
    expect(recipe.detectedLanguage).toBe('en');
  });

  it('gère isRecipe: false', () => {
    const { recipe } = parseExtractedRecipe(JSON.stringify({ isRecipe: false, title: '', servings: 0, tags: [], ingredients: [], steps: [] }));
    expect(recipe.isRecipe).toBe(false);
    expect(recipe.ingredients).toEqual([]);
  });

  it('rejette un JSON invalide ou incomplet', () => {
    expect(() => parseExtractedRecipe('{pas du json')).toThrow(InvalidRecipeJson);
    expect(() => parseExtractedRecipe('[]')).toThrow(InvalidRecipeJson);
    expect(() => parseExtractedRecipe(JSON.stringify({ ...base, isRecipe: undefined }))).toThrow(InvalidRecipeJson);
    expect(() => parseExtractedRecipe(JSON.stringify({ ...base, title: '  ' }))).toThrow(InvalidRecipeJson);
    expect(() => parseExtractedRecipe(JSON.stringify({ ...base, ingredients: null }))).toThrow(InvalidRecipeJson);
  });

  it('corrige les énumérations inconnues avec avertissement', () => {
    const data = { ...base, ingredients: [{ name: 'farine', quantity: '250', unit: 'grammes', aisle: 'rayon_magique' }, { name: 'lait', quantity: 1, unit: 'cup', aisle: 'cremerie_oeufs' }] };
    const { recipe, warnings } = parseExtractedRecipe(JSON.stringify(data));
    expect(recipe.ingredients[0]).toMatchObject({ name: 'farine', quantity: 250, unit: 'g', aisle: 'autre' });
    expect(recipe.ingredients[1]).toMatchObject({ unit: null });
    expect(warnings).toHaveLength(2);
  });

  it('ignore les lignes vides et met 1 portion par défaut', () => {
    const data = { ...base, servings: null, ingredients: [{ name: '', aisle: 'autre' }, 'oops'], steps: [{ text: '' }, { text: 'ok', timerSeconds: -5 }] };
    const { recipe, warnings } = parseExtractedRecipe(JSON.stringify(data));
    expect(recipe.servings).toBe(1);
    expect(recipe.ingredients).toEqual([]);
    expect(recipe.steps).toEqual([{ text: 'ok', timerSeconds: null }]);
    expect(warnings.length).toBe(4);
  });
});

describe('geminiVideoMime', () => {
  it('convertit les types iOS', () => {
    expect(geminiVideoMime(new Blob([], { type: 'video/quicktime' }))).toBe('video/mov');
    expect(geminiVideoMime(new Blob([], { type: 'video/mp4' }))).toBe('video/mp4');
    expect(geminiVideoMime(new Blob([]), 'IMG_0001.MOV')).toBe('video/mov');
    expect(geminiVideoMime(new Blob([]), 'clip')).toBe('video/mp4');
  });
});

describe('format', () => {
  it('affiche des fractions lisibles', () => {
    expect(formatQuantity(0.5)).toBe('½');
    expect(formatQuantity(1.25)).toBe('1 ¼');
    expect(formatQuantity(250)).toBe('250');
    expect(formatQuantity(1.5)).toBe('1 ½');
    expect(formatQuantity(null)).toBe('');
  });
  it('accorde les unités comptables', () => {
    expect(formatUnit('gousse', 2)).toBe('gousses');
    expect(formatUnit('g', 200)).toBe('g');
    expect(formatUnit('piece', 3)).toBe('');
  });
});

describe('sortModels', () => {
  it('met le flash stable le plus récent en premier', async () => {
    const { sortModels } = await import('../src/extraction/gemini');
    const ids = ['gemini-2.5-flash', 'gemini-3.8-pro', 'gemini-3.8-flash-lite', 'gemini-3.8-flash', 'gemini-3.9-flash-preview', 'gemini-2.0-flash'];
    expect(sortModels(ids.map((id) => ({ id }))).map((m) => m.id)).toEqual([
      'gemini-3.8-flash', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-3.8-flash-lite', 'gemini-3.9-flash-preview', 'gemini-3.8-pro',
    ]);
  });
});
