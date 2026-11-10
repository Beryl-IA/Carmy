import { describe, expect, it } from 'vitest';
import { buildShoppingList, displayQuantity, lineKey, unitFamily, type ShoppingLine } from '../src/model/shopping';
import { EMPTY_SHOPPING, type Ingredient, type Recipe, type ShoppingState } from '../src/model/types';

const ing = (name: string, quantity: number | null, unit: Ingredient['unit'], aisle: Ingredient['aisle'] = 'autre', extra: Partial<Ingredient> = {}): Ingredient =>
  ({ name, quantity, unit, aisle, ...extra });
const recipe = (id: string, servings: number, ingredients: Ingredient[]): Recipe => ({
  id, title: id, servings, ingredients, tags: [], collectionIds: [], steps: [], sourceType: 'manual', createdAt: 0, updatedAt: 0,
});
const state = (selections: ShoppingState['selections'], extra: Partial<ShoppingState> = {}): ShoppingState => ({ ...EMPTY_SHOPPING, selections, ...extra });
const all = (l: ReturnType<typeof buildShoppingList>): ShoppingLine[] => l.sections.flatMap((s) => s.lines);
const find = (l: ReturnType<typeof buildShoppingList>, name: string) => all(l).filter((x) => x.name === name);
const fmt = (x: ShoppingLine) => `${x.quantity ?? '∅'} ${x.unit ?? ''}`.trim();

describe('§9.1 mise à l\'échelle', () => {
  it('applique portions voulues ÷ portions de la fiche', () => {
    const r = recipe('a', 4, [ing('farine', 500, 'g'), ing('oeuf', 3, 'piece')]);
    const l = buildShoppingList([r], state([{ recipeId: 'a', servings: 2 }]), []);
    expect(fmt(find(l, 'farine')[0]!)).toBe('250 g');
    expect(fmt(find(l, 'oeuf')[0]!)).toBe('1.5 piece');
  });
  it('gère les portions fractionnaires sans afficher « 0,333 oignon »', () => {
    const r = recipe('a', 3, [ing('oignon', 1, 'piece'), ing('crème', 20, 'cl'), ing('sel', 1, 'pincee')]);
    const l = buildShoppingList([r], state([{ recipeId: 'a', servings: 1 }]), []);
    expect(find(l, 'oignon')[0]!.quantity).toBe(0.25);
    expect(fmt(find(l, 'crème')[0]!)).toBe('6.5 cl');
    expect(find(l, 'sel')[0]!.quantity).toBe(0.25);
  });
  it('arrondit après la somme, pas avant', () => {
    // 3 × (1 oignon pour 3 → 1 pers.) = 1 oignon, et non 3 × ¼ = ¾
    const rs = ['a', 'b', 'c'].map((id) => recipe(id, 3, [ing('oignon', 1, 'piece')]));
    const l = buildShoppingList(rs, state(rs.map((r) => ({ recipeId: r.id, servings: 1 }))), []);
    expect(find(l, 'oignon')[0]!.quantity).toBe(1);
  });
});

describe('§9.2–9.3 fusion et conversions', () => {
  it('fusionne les doublons de même nom et de même famille, en gardant les recettes sources', () => {
    const a = recipe('a', 2, [ing('Oignon', 1, 'piece', 'fruits_legumes')]);
    const b = recipe('b', 2, [ing('oignon', 2, 'piece', 'fruits_legumes')]);
    const l = buildShoppingList([a, b], state([{ recipeId: 'a', servings: 2 }, { recipeId: 'b', servings: 2 }]), []);
    const o = find(l, 'oignon');
    expect(o).toHaveLength(1);
    expect(fmt(o[0]!)).toBe('3 piece');
    expect(o[0]!.recipeIds.sort()).toEqual(['a', 'b']);
  });
  it('convertit les masses en g puis affiche en kg au-delà de 1000 g', () => {
    const a = recipe('a', 1, [ing('farine', 1, 'kg')]);
    const b = recipe('b', 1, [ing('farine', 500, 'g')]);
    const l = buildShoppingList([a, b], state([{ recipeId: 'a', servings: 1 }, { recipeId: 'b', servings: 1 }]), []);
    expect(fmt(find(l, 'farine')[0]!)).toBe('1.5 kg');
  });
  it('convertit les volumes (cl, l, cuillères) en ml', () => {
    const a = recipe('a', 1, [ing('lait', 20, 'cl'), ing('huile', 2, 'c_soupe'), ing('vinaigre', 1, 'c_soupe')]);
    const b = recipe('b', 1, [ing('lait', 0.5, 'l'), ing('huile', 1, 'c_cafe'), ing('vinaigre', 2, 'c_soupe')]);
    const l = buildShoppingList([a, b], state([{ recipeId: 'a', servings: 1 }, { recipeId: 'b', servings: 1 }]), []);
    expect(fmt(find(l, 'lait')[0]!)).toBe('700 ml');
    expect(fmt(find(l, 'huile')[0]!)).toBe('35 ml');
    // Même unité partout : on la garde.
    expect(fmt(find(l, 'vinaigre')[0]!)).toBe('3 c_soupe');
  });
  it('passe en litres au-delà de 1000 ml et garde g sous 1000 g', () => {
    expect(displayQuantity(1500, 'volume', new Set(['ml', 'cl']))).toEqual({ quantity: 1.5, unit: 'l' });
    expect(displayQuantity(1200, 'volume', new Set(['ml']))).toEqual({ quantity: 1.2, unit: 'l' });
    expect(displayQuantity(999, 'masse', new Set(['g']))).toEqual({ quantity: 1, unit: 'kg' });
    expect(displayQuantity(998, 'volume', new Set(['ml']))).toEqual({ quantity: 1, unit: 'l' });
    expect(displayQuantity(990, 'masse', new Set(['g']))).toEqual({ quantity: 990, unit: 'g' });
    expect(displayQuantity(750, 'masse', new Set(['kg']))).toEqual({ quantity: 0.75, unit: 'kg' });
  });
});

describe('§9.4 pas de conversion entre familles, quantités vides', () => {
  it('garde séparées les lignes poids / pièces / volume', () => {
    const a = recipe('a', 1, [ing('oignon', 300, 'g'), ing('beurre', 50, 'g')]);
    const b = recipe('b', 1, [ing('oignon', 2, 'piece'), ing('beurre', 1, 'c_soupe')]);
    const l = buildShoppingList([a, b], state([{ recipeId: 'a', servings: 1 }, { recipeId: 'b', servings: 1 }]), []);
    expect(find(l, 'oignon').map(fmt).sort()).toEqual(['2 piece', '300 g']);
    expect(find(l, 'beurre').map(fmt).sort()).toEqual(['1 c_soupe', '50 g']);
  });
  it('produit une ligne sans quantité, distincte d\'une ligne avec quantité', () => {
    const a = recipe('a', 1, [ing('persil', null, null), ing('citron', 1, 'piece')]);
    const b = recipe('b', 1, [ing('persil', null, 'bouquet'), ing('citron', null, null)]);
    const l = buildShoppingList([a, b], state([{ recipeId: 'a', servings: 1 }, { recipeId: 'b', servings: 1 }]), []);
    expect(find(l, 'persil').map(fmt)).toEqual(['∅']);
    expect(find(l, 'persil')[0]!.recipeIds.sort()).toEqual(['a', 'b']);
    expect(find(l, 'citron').map(fmt).sort()).toEqual(['1 piece', '∅']);
  });
  it('distingue les unités comptables entre elles', () => {
    expect(unitFamily('gousse', 2)).toBe('gousse');
    expect(unitFamily(null, 2)).toBe('aucune');
    expect(unitFamily('g', null)).toBe('sans_quantite');
    expect(lineKey('Œuf ', 'aucune')).toBe('oeuf|aucune');
  });
});

describe('§9.5 garde-manger, rayons, cases, articles manuels', () => {
  const r = recipe('a', 1, [
    ing('sel', null, null, 'condiments_epices'), ing('Huile d\'olive', 2, 'c_soupe', 'epicerie_salee'),
    ing('tomate', 3, 'piece', 'fruits_legumes'), ing('basilic', 1, 'bouquet', 'fruits_legumes', { optional: true }),
    ing('mozzarella', 125, 'g', 'cremerie_oeufs'),
  ]);
  const pantry = [{ name: 'sel' }, { name: 'huile d\'olive' }];

  it('range le garde-manger à part, sauf s\'il est ajouté à la main', () => {
    const l = buildShoppingList([r], state([{ recipeId: 'a', servings: 1 }]), pantry);
    expect(l.pantry.map((x) => x.name)).toEqual(['huile d\'olive', 'sel']);
    expect(find(l, 'sel')).toEqual([]);
    const key = l.pantry.find((x) => x.name === 'sel')!.key;
    const l2 = buildShoppingList([r], state([{ recipeId: 'a', servings: 1 }], { pantryOverrides: [key] }), pantry);
    expect(find(l2, 'sel')).toHaveLength(1);
    expect(l2.pantry.map((x) => x.name)).toEqual(['huile d\'olive']);
  });

  it('trie par rayon et descend les articles cochés en bas de leur rayon', () => {
    const l = buildShoppingList([r], state([{ recipeId: 'a', servings: 1 }], { checkedKeys: ['basilic|bouquet'] }), pantry);
    expect(l.sections.map((s) => s.aisle)).toEqual(['fruits_legumes', 'cremerie_oeufs']);
    expect(l.sections[0]!.lines.map((x) => `${x.name}${x.checked ? '✓' : ''}`)).toEqual(['tomate', 'basilic✓']);
    expect(l.sections[0]!.lines[1]!.optional).toBe(true);
    expect(l.remaining).toBe(2);
    expect(l.total).toBe(3);
  });

  it('ajoute les articles manuels sans les fusionner et masque les lignes retirées', () => {
    const l = buildShoppingList([r], state([{ recipeId: 'a', servings: 1 }], {
      removedKeys: ['mozzarella|masse'],
      manualItems: [{ id: 'm1', name: 'tomate', quantity: null, unit: null, aisle: 'fruits_legumes', checked: false, origin: 'manual', recipeIds: [] }],
      checkedKeys: ['manuel:m1'],
    }), pantry);
    expect(find(l, 'mozzarella')).toEqual([]);
    expect(find(l, 'tomate').map((x) => `${x.origin}${x.checked ? '✓' : ''}`)).toEqual(['recipe', 'manual✓']);
  });

  it('ignore les recettes supprimées de la bibliothèque', () => {
    const l = buildShoppingList([], state([{ recipeId: 'disparue', servings: 2 }]), []);
    expect(l.total).toBe(0);
  });
});
