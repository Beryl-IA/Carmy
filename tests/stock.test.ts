import { describe, expect, it } from 'vitest';
import { buildShoppingList } from '../src/model/shopping';
import {
  addToStock, availableFor, consumeFromStock, defaultSplit, dishStatus, dishesFromPlan, eatPortion, moveDish, setStockQuantity,
  stockDisplay, urgentCount, type StockItem, type StoredDish,
} from '../src/model/stock';
import { EMPTY_SHOPPING, type Recipe } from '../src/model/types';

let n = 0;
const id = () => `s${n++}`;
const DAY = 24 * 3600 * 1000;
const now = new Date(2026, 10, 10, 12).getTime();

const base: StockItem[] = addToStock([], [
  { name: 'Riz', quantity: 1, unit: 'kg', aisle: 'epicerie_salee' },
  { name: 'oignon', quantity: 3, unit: 'piece', aisle: 'fruits_legumes' },
  { name: 'lait', quantity: 1, unit: 'l', aisle: 'cremerie_oeufs' },
  { name: 'sel', quantity: null, unit: null, aisle: 'condiments_epices' },
], now, id);

describe('réserve : produits', () => {
  it('cumule les achats de même nom et même famille d\'unité', () => {
    const s = addToStock(base, [{ name: 'riz', quantity: 500, unit: 'g', aisle: 'epicerie_salee' }, { name: 'oignon', quantity: 2, unit: 'piece', aisle: 'fruits_legumes' }], now, id);
    expect(s).toHaveLength(4);
    expect(stockDisplay(s.find((x) => x.name === 'riz')!)).toEqual({ quantity: 1.5, unit: 'kg' });
    expect(stockDisplay(s.find((x) => x.name === 'oignon')!)).toEqual({ quantity: 5, unit: 'piece' });
    expect(stockDisplay(s.find((x) => x.name === 'sel')!)).toEqual({ quantity: null, unit: null });
  });
  it('déduit ce qui est cuisiné et retire ce qui est épuisé', () => {
    const { stock, changes } = consumeFromStock(base, [
      { name: 'riz', quantity: 300, unit: 'g', aisle: 'epicerie_salee' },
      { name: 'oignon', quantity: 2, unit: 'piece', aisle: 'fruits_legumes' },
      { name: 'oignon', quantity: 1, unit: 'piece', aisle: 'fruits_legumes' },
      { name: 'lait', quantity: 20, unit: 'cl', aisle: 'cremerie_oeufs' },
      { name: 'sel', quantity: 1, unit: 'pincee', aisle: 'condiments_epices' },
      { name: 'beurre', quantity: 50, unit: 'g', aisle: 'cremerie_oeufs' },
      { name: 'persil', quantity: 1, unit: 'bouquet', aisle: 'fruits_legumes', optional: true },
    ], now);
    expect(stockDisplay(stock.find((x) => x.name === 'riz')!)).toEqual({ quantity: 700, unit: 'g' });
    expect(stock.find((x) => x.name === 'oignon')).toBeUndefined();
    expect(stockDisplay(stock.find((x) => x.name === 'lait')!)).toEqual({ quantity: 800, unit: 'ml' });
    expect(stock.find((x) => x.name === 'sel')).toBeDefined();
    expect(changes.map((c) => [c.name, c.after?.quantity ?? 'épuisé'])).toEqual([['riz', 700], ['oignon', 'épuisé'], ['lait', 800]]);
  });
  it('modifie ou retire une quantité', () => {
    const riz = base.find((x) => x.name === 'riz')!;
    expect(stockDisplay(setStockQuantity(base, riz.id, 250, 'g', now).find((x) => x.id === riz.id)!)).toEqual({ quantity: 250, unit: 'g' });
    expect(setStockQuantity(base, riz.id, 0, 'g', now).find((x) => x.id === riz.id)).toBeUndefined();
  });
  it('indique ce qui est disponible pour une ligne de courses', () => {
    expect(availableFor(base, 'riz', 'masse')).toBe(1000);
    expect(availableFor(base, 'riz', 'volume')).toBe(0);
    expect(availableFor(base, 'Sel', 'masse')).toBe('present');
    expect(availableFor(base, 'poivre', 'sans_quantite')).toBe(0);
  });
});

describe('réserve et courses', () => {
  const r: Recipe = {
    id: 'r', title: 'R', servings: 2, tags: [], collectionIds: [], steps: [], sourceType: 'manual', createdAt: 0, updatedAt: 0,
    ingredients: [
      { name: 'riz', quantity: 1500, unit: 'g', aisle: 'epicerie_salee' },
      { name: 'oignon', quantity: 2, unit: 'piece', aisle: 'fruits_legumes' },
      { name: 'sel', quantity: null, unit: null, aisle: 'condiments_epices' },
      { name: 'tomate', quantity: 4, unit: 'piece', aisle: 'fruits_legumes' },
    ],
  };
  const state = { ...EMPTY_SHOPPING, selections: [{ recipeId: 'r', servings: 2 }] };
  it('n\'affiche que ce qui manque', () => {
    const list = buildShoppingList([r], state, [], base);
    const lines = list.sections.flatMap((s) => s.lines);
    expect(lines.find((l) => l.name === 'riz')).toMatchObject({ quantity: 500, unit: 'g', inStock: { quantity: 1, unit: 'kg' } });
    expect(lines.find((l) => l.name === 'tomate')).toMatchObject({ quantity: 4 });
    expect(list.pantry.map((l) => [l.name, l.covered])).toEqual([['oignon', 'stock'], ['sel', 'stock']]);
  });
  it('« acheter quand même » remet la quantité complète', () => {
    const list = buildShoppingList([r], { ...state, pantryOverrides: ['riz|masse'] }, [], base);
    expect(list.sections.flatMap((s) => s.lines).find((l) => l.name === 'riz')).toMatchObject({ quantity: 1.5, unit: 'kg' });
  });
});

describe('réserve : plats cuisinés', () => {
  const dish = (extra: Partial<StoredDish> = {}): StoredDish => ({ id: 'd', title: 'Chili', portions: 2, place: 'frigo', cookedAt: now, expiresAt: now + 3 * DAY, ...extra });
  it('mange une portion, et retire le plat à la dernière', () => {
    expect(eatPortion([dish()], 'd')[0]?.portions).toBe(1);
    expect(eatPortion([dish({ portions: 1 })], 'd')).toEqual([]);
  });
  it('congèle et décongèle', () => {
    const frozen = moveDish([dish()], 'd', 'congelateur', 2, now)[0]!;
    expect(frozen.place).toBe('congelateur');
    expect(new Date(frozen.expiresAt!).getMonth()).toBe(0); // janvier
    const thawed = moveDish([frozen], 'd', 'frigo', 2, now)[0]!;
    expect(thawed.expiresAt).toBe(now + DAY);
  });
  it('signale les plats à manger vite ou périmés', () => {
    expect(dishStatus(dish({ expiresAt: now + DAY }), now)).toBe('urgent');
    expect(dishStatus(dish({ expiresAt: now - DAY }), now)).toBe('perime');
    expect(dishStatus(dish({ expiresAt: now + 5 * DAY }), now)).toBe('ok');
    expect(dishStatus(dish({ expiresAt: null }), now)).toBe('inconnu');
    expect(urgentCount([dish({ expiresAt: now + DAY }), dish({ place: 'congelateur', expiresAt: now + DAY }), dish()], now)).toBe(1);
  });
  it('propose une répartition frigo / congélateur', () => {
    expect(defaultSplit(6, 3, 3, 2)).toEqual({ fridge: 3, freezer: 3 });
    expect(defaultSplit(6, 4, 0, 2)).toEqual({ fridge: 6, freezer: 0 });
    expect(defaultSplit(2, 4, 3, 1)).toEqual({ fridge: 2, freezer: 0 });
    expect(defaultSplit(4, null, null, 3)).toEqual({ fridge: 2, freezer: 2 });
  });
  it('crée une entrée par lieu', () => {
    const d = dishesFromPlan([{ recipeId: 'c', title: 'Chili', fridge: 2, freezer: 3, fridgeDays: 4, freezerMonths: 3 }, { title: 'Soupe', fridge: 0, freezer: 0, fridgeDays: null, freezerMonths: null }], now, id);
    expect(d.map((x) => [x.place, x.portions])).toEqual([['frigo', 2], ['congelateur', 3]]);
    expect(d[0]?.expiresAt).toBe(now + 4 * DAY);
  });
});
