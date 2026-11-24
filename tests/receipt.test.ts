import { describe, expect, it } from 'vitest';
import { RECEIPT_SCHEMA, userPromptReceipt } from '../src/extraction/prompt';
import {
  InvalidReceipt, KNOWN_NAMES_MAX, knownProductNames, parseReceipt, receiptEntries, receiptLines, receiptSummary, stockMatch,
} from '../src/model/receipt';
import { addToStock, stockDisplay, type StockItem } from '../src/model/stock';
import type { Recipe } from '../src/model/types';

let n = 0;
const id = () => `r${n++}`;
const now = new Date(2026, 10, 24, 12).getTime();

const stock: StockItem[] = addToStock([], [
  { name: 'fromage blanc', quantity: 500, unit: 'g', aisle: 'cremerie_oeufs' },
  { name: 'riz', quantity: 1, unit: 'kg', aisle: 'epicerie_salee' },
  { name: 'œuf', quantity: 2, unit: 'piece', aisle: 'cremerie_oeufs' },
], now, id);

const ticket = {
  isReceipt: true,
  items: [
    { label: 'FROM BLC 0% 1KG', name: 'Fromage blanc', quantity: 1, unit: 'kg', aisle: 'cremerie_oeufs', food: true },
    { label: 'LDL OEUFS PA X6', name: 'oeuf', quantity: 12, unit: 'piece', aisle: 'cremerie_oeufs', food: true },
    { label: 'TOMATE GRAPPE', name: 'tomate', quantity: '0,856', unit: 'kg', aisle: 'fruits_legumes', food: true },
    { label: 'BAGUETTE', name: 'baguette', quantity: 2, unit: null, aisle: 'boulangerie', food: true },
    { label: 'SEL FIN', name: 'sel', quantity: null, unit: 'g', aisle: 'condiments_epices', food: true },
    { label: 'LESSIVE 2L', name: 'lessive', quantity: 2, unit: 'l', aisle: 'autre', food: false },
    { label: 'XXX', name: '', quantity: 1, unit: 'piece', aisle: 'autre', food: true },
  ],
};

describe('ticket de caisse : lecture de la réponse', () => {
  it('normalise les produits et ignore les lignes sans nom', () => {
    const r = parseReceipt(JSON.stringify(ticket));
    expect(r.isReceipt).toBe(true);
    expect(r.items).toHaveLength(6);
    expect(r.items[0]).toEqual({ label: 'FROM BLC 0% 1KG', name: 'fromage blanc', quantity: 1, unit: 'kg', aisle: 'cremerie_oeufs', food: true });
    expect(r.items[2]).toMatchObject({ name: 'tomate', quantity: 0.856, unit: 'kg' });
    expect(r.warnings).toEqual(['Produit 7 ignoré (nom vide : « XXX »)']);
  });
  it('un nombre sans unité devient des pièces, une quantité absente efface l\'unité', () => {
    const r = parseReceipt(JSON.stringify(ticket));
    expect(r.items[3]).toMatchObject({ name: 'baguette', quantity: 2, unit: 'piece' });
    expect(r.items[4]).toMatchObject({ name: 'sel', quantity: null, unit: null });
  });
  it('corrige un rayon inconnu et garde le libellé', () => {
    const r = parseReceipt(JSON.stringify({ isReceipt: true, items: [{ label: '', name: 'Pâtes', quantity: 500, unit: 'grammes', aisle: 'pates', food: true }] }));
    expect(r.items[0]).toEqual({ label: 'pâtes', name: 'pâtes', quantity: 500, unit: 'g', aisle: 'autre', food: true });
    expect(r.warnings.some((w) => w.includes('rayon inconnu'))).toBe(true);
  });
  it('reconnaît une image sans ticket', () => {
    expect(parseReceipt(JSON.stringify({ isReceipt: false, items: [] }))).toEqual({ isReceipt: false, items: [], warnings: [] });
  });
  it('rejette une réponse inexploitable (nouvelle tentative)', () => {
    expect(() => parseReceipt('pas du json')).toThrow(InvalidReceipt);
    expect(() => parseReceipt(JSON.stringify({ items: [] }))).toThrow(InvalidReceipt);
    expect(() => parseReceipt(JSON.stringify({ isReceipt: true }))).toThrow(InvalidReceipt);
    expect(() => parseReceipt(JSON.stringify({ isReceipt: true, items: [] }))).toThrow(InvalidReceipt);
  });
});

describe('ticket de caisse : relecture et ajout au stock', () => {
  const items = parseReceipt(JSON.stringify(ticket)).items;

  it('coche les aliments et range les produits non alimentaires décochés à la fin', () => {
    const lines = receiptLines(items, id);
    expect(lines.map((l) => [l.name, l.checked])).toEqual([
      ['fromage blanc', true], ['oeuf', true], ['tomate', true], ['baguette', true], ['sel', true], ['lessive', false],
    ]);
  });

  it('signale ce qui se cumule avec le stock et ce qui sera ajouté à part', () => {
    expect(stockMatch(stock, 'Fromage blanc', 1, 'kg')).toBe('cumul');
    expect(stockMatch(stock, 'oeuf', 12, 'piece')).toBe('cumul');
    expect(stockMatch(stock, 'riz', 2, 'piece')).toBe('autre_unite');
    expect(stockMatch(stock, 'tomate', 856, 'g')).toBeNull();
    expect(stockMatch(stock, '  ', 1, 'g')).toBeNull();
  });

  it('n\'ajoute que les lignes cochées et cumule les quantités', () => {
    const lines = receiptLines(items, id).map((l) => (l.name === 'baguette' ? { ...l, checked: false } : l));
    const entries = receiptEntries(lines);
    expect(entries.map((e) => e.name)).toEqual(['fromage blanc', 'oeuf', 'tomate', 'sel']);
    const next = addToStock(stock, entries, now, id);
    expect(stockDisplay(next.find((s) => s.name === 'fromage blanc')!)).toEqual({ quantity: 1.5, unit: 'kg' });
    // « oeuf » rejoint « œuf » (accents et ligatures ignorés).
    expect(next.filter((s) => s.family === 'piece')).toHaveLength(1);
    expect(stockDisplay(next.find((s) => s.family === 'piece')!)).toEqual({ quantity: 14, unit: 'piece' });
    expect(next.find((s) => s.name === 'tomate')?.base).toBeCloseTo(856, 6);
    expect(next.find((s) => s.name === 'sel')?.base).toBeNull();
    expect(next.find((s) => s.name === 'lessive')).toBeUndefined();
  });

  it('ignore une ligne cochée dont le nom a été vidé', () => {
    const lines = receiptLines(items, id).map((l, i) => (i === 0 ? { ...l, name: '  ' } : l));
    expect(receiptEntries(lines).map((e) => e.name)).not.toContain('');
  });

  it('résume l\'ajout', () => {
    const entries = receiptEntries(receiptLines(items, id));
    expect(receiptSummary(entries, stock)).toBe('5 produits ajoutés au stock, dont 2 déjà présents (quantités cumulées).');
    expect(receiptSummary(entries.slice(2, 3), stock)).toBe('1 produit ajouté au stock.');
  });
});

describe('ticket de caisse : consigne envoyée à l\'IA', () => {
  const recipe = { ingredients: [{ name: 'Oignon' }, { name: 'riz' }, { name: 'tomate' }] } as unknown as Recipe;

  it('reprend les noms du stock, des recettes et du garde-manger, sans doublon', () => {
    expect(knownProductNames(stock, [recipe], [{ name: 'sel' }, { name: 'Oignon' }])).toEqual(['fromage blanc', 'riz', 'œuf', 'oignon', 'tomate', 'sel']);
  });
  it('limite la liste', () => {
    const many = { ingredients: Array.from({ length: 600 }, (_, i) => ({ name: `produit ${i}` })) } as unknown as Recipe;
    expect(knownProductNames([], [many])).toHaveLength(KNOWN_NAMES_MAX);
  });
  it('décrit une ou plusieurs images et transmet les noms connus', () => {
    expect(userPromptReceipt(1, [])).toBe('Liste les produits achetés sur ce ticket de caisse ou cette commande drive.');
    const p = userPromptReceipt(3, ['riz', 'œuf']);
    expect(p).toContain('Ces 3 images');
    expect(p).toContain('riz, œuf');
  });
  it('le schéma exige le libellé, le nom, la quantité, l\'unité, le rayon et le type de produit', () => {
    expect(RECEIPT_SCHEMA.properties.items.items.required).toEqual(['label', 'name', 'quantity', 'unit', 'aisle', 'food']);
  });
});
