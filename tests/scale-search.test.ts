import { describe, expect, it } from 'vitest';
import { roundQuantity, scaleIngredients, scaleQuantity } from '../src/model/scale';
import { filterRecipes, normalizeText, tagsByFrequency } from '../src/model/search';
import type { Recipe } from '../src/model/types';

describe('scaleQuantity', () => {
  it('applique quantité × voulu ÷ base', () => {
    expect(scaleQuantity(400, 'g', 4, 2)).toBe(200);
    expect(scaleQuantity(3, 'piece', 4, 1)).toBe(0.75);
    expect(scaleQuantity(1, 'piece', 3, 1)).toBe(0.25); // 0,333 oignon → ¼, jamais « 0,333 »
    expect(scaleQuantity(2, 'piece', 3, 1)).toBe(0.75); // 0,667 → ¾
    expect(scaleQuantity(5, 'piece', 4, 1)).toBe(1.5); // 1,25 → 1,5 (au demi)
    expect(scaleQuantity(null, 'g', 4, 1)).toBeNull();
    expect(scaleQuantity(250, 'g', 4, 4)).toBe(250);
  });
  it('arrondit selon l\'unité', () => {
    expect(scaleQuantity(250, 'g', 3, 1)).toBe(83); // 83,33 g → 83
    expect(scaleQuantity(1000, 'g', 3, 1)).toBe(335); // 333,3 → 335 (au 5)
    expect(scaleQuantity(1, 'c_soupe', 3, 1)).toBe(0.25);
    expect(scaleQuantity(2, 'c_soupe', 3, 1)).toBe(0.75);
    expect(scaleQuantity(1, 'kg', 3, 1)).toBe(0.35);
    expect(scaleQuantity(20, 'cl', 4, 1)).toBe(5);
  });
  it('ne renvoie jamais zéro pour une petite quantité', () => {
    expect(roundQuantity(0.05, 'piece')).toBe(0.25);
    expect(roundQuantity(0.1, 'pincee')).toBe(0.25);
    expect(roundQuantity(0.2, 'g')).toBe(0.2);
  });
  it('met à l\'échelle une liste sans la modifier', () => {
    const ings = [{ name: 'oeuf', quantity: 4, unit: 'piece' as const, aisle: 'cremerie_oeufs' as const }];
    expect(scaleIngredients(ings, 4, 1)[0]?.quantity).toBe(1);
    expect(ings[0]?.quantity).toBe(4);
  });
});

const r = (id: string, title: string, tags: string[], ings: string[], collectionIds: string[] = []): Recipe => ({
  id, title, servings: 2, tags, collectionIds, steps: [], sourceType: 'manual', createdAt: 0, updatedAt: 0,
  ingredients: ings.map((name) => ({ name, quantity: null, unit: null, aisle: 'autre' })),
});
const lib = [
  r('1', 'Œufs brouillés', ['rapide', 'petit-déjeuner'], ['oeuf', 'beurre'], ['c1']),
  r('2', 'Curry de pois chiches', ['plat', 'végétarien'], ['pois chiche', 'lait de coco', 'oignon']),
  r('3', 'Tarte à l\'oignon', ['plat', 'rapide'], ['oignon', 'pâte brisée', 'crème'], ['c1']),
];

describe('filterRecipes', () => {
  it('cherche dans titre, tags et ingrédients, sans accents', () => {
    expect(filterRecipes(lib, { query: 'oeufs', tags: [], collectionId: null }).map((x) => x.id)).toEqual(['1']);
    expect(filterRecipes(lib, { query: 'OIGNON', tags: [], collectionId: null }).map((x) => x.id)).toEqual(['2', '3']);
    expect(filterRecipes(lib, { query: 'vegetarien', tags: [], collectionId: null }).map((x) => x.id)).toEqual(['2']);
    expect(filterRecipes(lib, { query: 'tarte creme', tags: [], collectionId: null }).map((x) => x.id)).toEqual(['3']);
    expect(filterRecipes(lib, { query: 'tarte coco', tags: [], collectionId: null })).toEqual([]);
  });
  it('combine tags (ET) et collection', () => {
    expect(filterRecipes(lib, { query: '', tags: ['plat', 'rapide'], collectionId: null }).map((x) => x.id)).toEqual(['3']);
    expect(filterRecipes(lib, { query: '', tags: [], collectionId: 'c1' }).map((x) => x.id)).toEqual(['1', '3']);
    expect(filterRecipes(lib, { query: 'oignon', tags: [], collectionId: 'c1' }).map((x) => x.id)).toEqual(['3']);
  });
  it('normalise et compte', () => {
    expect(normalizeText('  Crème   BRÛLÉE ')).toBe('creme brulee');
    expect(tagsByFrequency(lib)).toEqual(['plat', 'rapide', 'petit-déjeuner', 'végétarien']);
  });
});
