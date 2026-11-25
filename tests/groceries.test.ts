import { describe, expect, it } from 'vitest';
import {
  addManualItem, editManualItem, forgetItem, guessAisle, parseQuickItem, rememberItem, removeManualItem, sortRecent, suggestItems,
} from '../src/model/groceries';
import { EMPTY_SHOPPING, type Recipe, type ShoppingState } from '../src/model/types';
import type { StockItem } from '../src/model/stock';

let n = 0;
const makeId = () => `id${++n}`;

describe('parseQuickItem', () => {
  it.each([
    ['lait', { name: 'lait', quantity: null, unit: null }],
    ['2 kg pommes', { name: 'pommes', quantity: 2, unit: 'kg' }],
    ['500g de farine', { name: 'farine', quantity: 500, unit: 'g' }],
    ["250 g d'amandes", { name: 'amandes', quantity: 250, unit: 'g' }],
    ['6 œufs', { name: 'œufs', quantity: 6, unit: null }],
    ['1,5 l lait', { name: 'lait', quantity: 1.5, unit: 'l' }],
    ['lait 1 l', { name: 'lait', quantity: 1, unit: 'l' }],
    ['citrons x3', { name: 'citrons', quantity: 3, unit: null }],
    ['½ pastèque', { name: 'pastèque', quantity: 0.5, unit: null }],
    ['2 paquets de pâtes', { name: 'pâtes', quantity: 2, unit: 'sachet' }],
    ['3 gros oignons', { name: 'gros oignons', quantity: 3, unit: null }],
    ['  Papier  Toilette ', { name: 'papier toilette', quantity: null, unit: null }],
    ['pack de 6 bières', { name: 'pack de 6 bières', quantity: null, unit: null }],
    ['7up', { name: '7up', quantity: null, unit: null }],
  ])('« %s »', (input, expected) => {
    expect(parseQuickItem(input)).toEqual(expected);
  });

  it('vide → null', () => {
    expect(parseQuickItem('   ')).toBeNull();
  });
});

describe('guessAisle', () => {
  it.each([
    ['pommes', 'fruits_legumes'],
    ['pommes de terre', 'fruits_legumes'],
    ['yaourts nature', 'cremerie_oeufs'],
    ['œufs', 'cremerie_oeufs'],
    ['baguette', 'boulangerie'],
    ['jus d\'orange', 'boissons'],
    ['petits pois surgelés', 'surgeles'],
    ['spaghetti', 'epicerie_salee'],
    ['chocolat noir', 'epicerie_sucree'],
    ['papier toilette', 'autre'],
  ])('« %s » → %s', (name, aisle) => {
    expect(guessAisle(name)).toBe(aisle);
  });

  it('préfère le rayon déjà connu (habituels, stock, recettes)', () => {
    const stock = [{ id: 's', name: 'lessive', family: 'sans_quantite', base: null, aisle: 'epicerie_salee', updatedAt: 0 }] as StockItem[];
    expect(guessAisle('Lessive', { stock })).toBe('epicerie_salee');
    expect(guessAisle('lessive', { recent: [{ name: 'lessive', quantity: null, unit: null, aisle: 'boissons', count: 1, lastAt: 0 }], stock })).toBe('boissons');
  });
});

describe('addManualItem', () => {
  it('ajoute un nouvel article', () => {
    const r = addManualItem(EMPTY_SHOPPING, { name: ' Lait ', quantity: 1, unit: 'l', aisle: 'cremerie_oeufs' }, makeId);
    expect(r.merged).toBe(false);
    expect(r.state.manualItems).toEqual([{ id: r.id, name: 'lait', quantity: 1, unit: 'l', aisle: 'cremerie_oeufs', checked: false, origin: 'manual', recipeIds: [] }]);
  });

  it('cumule un article déjà présent et non coché, en convertissant les unités', () => {
    let s = addManualItem(EMPTY_SHOPPING, { name: 'farine', quantity: 500, unit: 'g', aisle: 'epicerie_sucree' }, makeId).state;
    const r = addManualItem(s, { name: 'Farine', quantity: 1, unit: 'kg', aisle: 'epicerie_sucree' }, makeId);
    expect(r.merged).toBe(true);
    expect(r.state.manualItems).toHaveLength(1);
    expect(r.state.manualItems[0]).toMatchObject({ quantity: 1.5, unit: 'kg' });
    s = addManualItem(r.state, { name: 'farine', quantity: null, unit: null, aisle: 'epicerie_sucree' }, makeId).state;
    expect(s.manualItems[0]).toMatchObject({ quantity: 1.5, unit: 'kg' });
  });

  it('un article sans quantité prend la quantité ajoutée ensuite', () => {
    const s = addManualItem(EMPTY_SHOPPING, { name: 'citrons', quantity: null, unit: null, aisle: 'fruits_legumes' }, makeId).state;
    const r = addManualItem(s, { name: 'citrons', quantity: 3, unit: null, aisle: 'fruits_legumes' }, makeId);
    expect(r.state.manualItems).toHaveLength(1);
    expect(r.state.manualItems[0]).toMatchObject({ quantity: 3, unit: null });
  });

  it('ne cumule pas avec un article coché ni avec une autre famille d’unité', () => {
    const first = addManualItem(EMPTY_SHOPPING, { name: 'lait', quantity: 1, unit: 'l', aisle: 'cremerie_oeufs' }, makeId);
    const checked: ShoppingState = { ...first.state, checkedKeys: [`manuel:${first.id}`] };
    expect(addManualItem(checked, { name: 'lait', quantity: 1, unit: 'l', aisle: 'cremerie_oeufs' }, makeId).state.manualItems).toHaveLength(2);
    expect(addManualItem(first.state, { name: 'lait', quantity: 2, unit: 'boite', aisle: 'cremerie_oeufs' }, makeId).state.manualItems).toHaveLength(2);
  });
});

describe('editManualItem / removeManualItem', () => {
  it('modifie puis retire un article avec son état coché', () => {
    const r = addManualItem(EMPTY_SHOPPING, { name: 'lait', quantity: 1, unit: 'l', aisle: 'cremerie_oeufs' }, makeId);
    const edited = editManualItem(r.state, r.id, { name: 'Lait d\'avoine', quantity: null, unit: 'l', aisle: 'boissons' });
    expect(edited.manualItems[0]).toMatchObject({ name: 'lait d\'avoine', quantity: null, unit: null, aisle: 'boissons' });
    expect(editManualItem(r.state, r.id, { name: '  ', quantity: 1, unit: null, aisle: 'autre' })).toBe(r.state);
    const key = `manuel:${r.id}`;
    const withCheck: ShoppingState = { ...edited, checkedKeys: [key], stocked: [{ key, name: 'lait', quantity: 1, unit: 'l', aisle: 'cremerie_oeufs' }] };
    expect(removeManualItem(withCheck, r.id)).toMatchObject({ manualItems: [], checkedKeys: [], stocked: [] });
  });
});

describe('habituels', () => {
  it('retient, compte, trie et oublie', () => {
    let recent = rememberItem([], { name: 'lait', quantity: 1, unit: 'l', aisle: 'cremerie_oeufs' }, 1);
    recent = rememberItem(recent, { name: 'pain', quantity: null, unit: null, aisle: 'boulangerie' }, 2);
    recent = rememberItem(recent, { name: 'Lait', quantity: 2, unit: 'l', aisle: 'cremerie_oeufs' }, 3);
    expect(recent.map((r) => [r.name, r.count, r.quantity])).toEqual([['Lait', 2, 2], ['pain', 1, null]]);
    expect(sortRecent(recent)[0]!.name).toBe('Lait');
    expect(forgetItem(recent, 'lait').map((r) => r.name)).toEqual(['pain']);
  });

  it('garde au plus 30 habituels', () => {
    let recent = rememberItem([], { name: 'a0', quantity: null, unit: null, aisle: 'autre' }, 0);
    for (let i = 1; i < 40; i++) recent = rememberItem(recent, { name: `a${i}`, quantity: null, unit: null, aisle: 'autre' }, i);
    expect(recent).toHaveLength(30);
  });
});

describe('suggestItems', () => {
  const recipes = [{ id: 'r', ingredients: [{ name: 'Pommes de terre', quantity: 1, unit: 'kg', aisle: 'fruits_legumes' }] }] as unknown as Recipe[];
  const stock = [{ id: 's', name: 'pommes', family: 'piece', base: 2, aisle: 'fruits_legumes', updatedAt: 0 }] as StockItem[];
  const recent = [{ name: 'compote de pommes', quantity: null, unit: null, aisle: 'epicerie_sucree' as const, count: 3, lastAt: 0 }];

  it('début de nom d’abord, sans doublon ni article déjà dans la liste', () => {
    const s = suggestItems('pom', { recent, stock, recipes, pantry: [], inList: [] });
    expect(s.map((x) => x.name)).toEqual(['pommes', 'pommes de terre', 'compote de pommes']);
    expect(s[0]!.source).toBe('stock');
    const without = suggestItems('pom', { recent, stock, recipes, pantry: [], inList: ['Pommes'] });
    expect(without.map((x) => x.name)).not.toContain('pommes');
  });

  it('rien sous deux lettres, et pas la saisie elle-même', () => {
    expect(suggestItems('p', { recent, stock, recipes, pantry: [], inList: [] })).toEqual([]);
    expect(suggestItems('pommes', { recent, stock, recipes, pantry: [], inList: [] }).map((x) => x.name)).not.toContain('pommes');
  });
});
