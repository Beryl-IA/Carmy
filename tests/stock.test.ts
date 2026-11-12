import { describe, expect, it } from 'vitest';
import { buildShoppingList } from '../src/model/shopping';
import {
  addToStock, availableFor, consumeFromStock, consumeProducts, defaultSplit, dishStatus, dishesFromPlan, eatPortion, moveDish, removeFromStock,
  reservedOf, setStockQuantity, stockDisplay, urgentCount, type MealProduct, type StockItem, type StoredDish,
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

describe('1.6.0 : courses cochées et repas simples', () => {
  const rice = base.find((s) => s.name === 'riz')!;
  const onion = base.find((s) => s.name === 'oignon')!;
  const salt = base.find((s) => s.name === 'sel')!;

  it('décocher un article retire du stock ce que le cochage avait ajouté', () => {
    const bought = { name: 'riz', quantity: 300, unit: 'g' as const, aisle: 'epicerie_salee' as const };
    const after = addToStock(base, [bought], now, id);
    expect(removeFromStock(after, [bought], now).find((s) => s.name === 'riz')!.base).toBe(1000);
    // Produit qui n'existait pas avant : il disparaît.
    const pasta = { name: 'pâtes', quantity: 500, unit: 'g' as const, aisle: 'epicerie_salee' as const };
    expect(removeFromStock(addToStock(base, [pasta], now, id), [pasta], now)).toHaveLength(base.length);
  });
  it('un produit sans quantité n\'est retiré que s\'il a été créé par le cochage', () => {
    const entry = { name: 'sel', quantity: null, unit: null, aisle: 'condiments_epices' as const };
    expect(removeFromStock(base, [entry], now).some((s) => s.name === 'sel')).toBe(true);
    expect(removeFromStock(base, [{ ...entry, created: true }], now).some((s) => s.name === 'sel')).toBe(false);
  });
  it('la liste garde la ligne cochée : son propre ajout ne compte pas comme « déjà à la maison »', () => {
    const recipe = { id: 'r', title: 'Riz', servings: 1, ingredients: [{ name: 'riz', quantity: 1200, unit: 'g', aisle: 'epicerie_salee' }], steps: [], tags: [], collectionIds: [], sourceType: 'manual', createdAt: 0, updatedAt: 0 } as unknown as Recipe;
    const state = { ...EMPTY_SHOPPING, selections: [{ recipeId: 'r', servings: 1 }] };
    const line = buildShoppingList([recipe], state, [], base).sections[0]!.lines[0]!;
    expect(line.quantity).toBe(200); // 1 kg déjà en stock
    const entry = { name: line.name, quantity: line.quantity, unit: line.unit, aisle: line.aisle };
    const stock = addToStock(base, [entry], now, id);
    const checked = { ...state, checkedKeys: [line.key], stocked: [{ key: line.key, ...entry }] };
    expect(buildShoppingList([recipe], checked, [], stock).pantry).toHaveLength(1); // sans correction, la ligne disparaîtrait
    const kept = buildShoppingList([recipe], checked, [], removeFromStock(stock, checked.stocked, now)).sections[0]!.lines[0]!;
    expect([kept.quantity, kept.checked]).toEqual([200, true]);
  });
  it('un repas simple mangé retire la quantité choisie, ou le produit entier', () => {
    const products: MealProduct[] = [
      { stockId: rice.id, name: 'riz', quantity: 250, unit: 'g', aisle: 'epicerie_salee' },
      { stockId: onion.id, name: 'oignon', quantity: 3, unit: 'piece', aisle: 'fruits_legumes' },
      { stockId: salt.id, name: 'sel', quantity: null, unit: null, aisle: 'condiments_epices' },
      { stockId: 'disparu', name: 'thon', quantity: 1, unit: 'boite', aisle: 'epicerie_salee' },
    ];
    const s = consumeProducts(base, products, now);
    expect(s.map((x) => `${x.name}:${x.base}`)).toEqual(['riz:750', 'lait:1000']);
    // Produit supprimé puis racheté (nouvel identifiant) : retrouvé par son nom.
    expect(consumeProducts(base, [{ ...products[0]!, stockId: 'ancien' }], now).find((x) => x.name === 'riz')!.base).toBe(750);
  });
  it('calcule la part réservée d\'un produit', () => {
    const p = (stockId: string, quantity: number | null, unit: MealProduct['unit']): MealProduct => ({ stockId, name: 'x', quantity, unit, aisle: 'autre' });
    expect(reservedOf(rice, [p(rice.id, 200, 'g'), p(rice.id, 0.3, 'kg'), p(onion.id, 1, 'piece')])).toBe(500);
    expect(reservedOf(salt, [p(salt.id, null, null)])).toBe('tout');
    expect(reservedOf(onion, [])).toBe(0);
  });
});
