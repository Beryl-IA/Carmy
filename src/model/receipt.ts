// 1.9.0 — Ticket de caisse ou commande drive → produits du stock : logique pure (lecture de la réponse de l'IA, relecture).
import { normalizeAisle, normalizeUnit, toNumberOrNull } from '../extraction/validate';
import { normalizeText } from './search';
import { lineKey, unitFamily } from './shopping';
import { stockKey, type StockEntry, type StockItem } from './stock';
import type { Aisle, PantryItem, Recipe, Unit } from './types';

export class InvalidReceipt extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidReceipt';
  }
}

/** Produit lu sur le ticket. */
export interface ReceiptItem {
  /** Libellé tel qu'écrit sur le ticket. */
  label: string;
  name: string;
  quantity: number | null;
  unit: Unit;
  aisle: Aisle;
  /** false : produit non alimentaire (hygiène, entretien…), décoché par défaut. */
  food: boolean;
}

export interface ParsedReceipt {
  isReceipt: boolean;
  items: ReceiptItem[];
  warnings: string[];
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Valide et normalise la réponse JSON. Lève InvalidReceipt si elle est inexploitable (nouvelle tentative). */
export function parseReceipt(raw: string): ParsedReceipt {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new InvalidReceipt('La réponse de l\'IA n\'est pas un JSON valide.');
  }
  if (!isObj(data)) throw new InvalidReceipt('La réponse de l\'IA n\'est pas un objet JSON.');
  if (typeof data.isReceipt !== 'boolean') throw new InvalidReceipt('Champ « isReceipt » manquant.');
  if (!Array.isArray(data.items)) throw new InvalidReceipt('Liste de produits manquante.');
  const warnings: string[] = [];
  const items: ReceiptItem[] = [];
  data.items.forEach((v, i) => {
    const ctx = `Produit ${i + 1}`;
    if (!isObj(v)) return void warnings.push(`${ctx} ignoré (format invalide)`);
    const label = typeof v.label === 'string' ? v.label.trim() : '';
    const name = typeof v.name === 'string' ? v.name.trim().toLowerCase() : '';
    if (!name) return void warnings.push(`${ctx} ignoré (nom vide${label ? ` : « ${label} »` : ''})`);
    let quantity = toNumberOrNull(v.quantity);
    if (quantity !== null && quantity <= 0) quantity = null;
    let unit = quantity === null ? null : normalizeUnit(v.unit, warnings, ctx);
    // Sur un ticket, un nombre sans unité est un nombre d'articles.
    if (quantity !== null && unit === null) unit = 'piece';
    items.push({ label: label || name, name, quantity, unit, aisle: normalizeAisle(v.aisle, warnings, ctx), food: v.food !== false });
  });
  if (data.isReceipt && items.length === 0) throw new InvalidReceipt('Aucun produit lu sur le ticket.');
  return { isReceipt: data.isReceipt && items.length > 0, items, warnings };
}

/** Ligne de la relecture : modifiable, à cocher. */
export interface ReceiptLine extends ReceiptItem {
  id: string;
  checked: boolean;
}

/** Lignes de relecture : aliments cochés d'abord, produits non alimentaires décochés à la fin. */
export function receiptLines(items: ReceiptItem[], makeId: () => string): ReceiptLine[] {
  const lines = items.map((it) => ({ ...it, id: makeId(), checked: it.food }));
  return [...lines.filter((l) => l.food), ...lines.filter((l) => !l.food)];
}

/**
 * Le produit est-il déjà en stock ? 'cumul' : même nom et même famille d'unité, les quantités s'additionnent ;
 * 'autre_unite' : même nom mais compté autrement (g contre pièces), il sera ajouté à part.
 */
export function stockMatch(stock: StockItem[], name: string, quantity: number | null, unit: Unit): 'cumul' | 'autre_unite' | null {
  const n = name.trim().toLowerCase();
  if (!n) return null;
  const key = lineKey(n, unitFamily(quantity === null ? null : unit, quantity));
  if (stock.some((s) => stockKey(s) === key)) return 'cumul';
  const plain = normalizeText(n);
  return stock.some((s) => normalizeText(s.name) === plain) ? 'autre_unite' : null;
}

/** Ce qui part dans le stock : lignes cochées avec un nom. */
export function receiptEntries(lines: ReceiptLine[]): StockEntry[] {
  return lines
    .filter((l) => l.checked && l.name.trim())
    .map((l) => ({ name: l.name.trim(), quantity: l.quantity, unit: l.quantity === null ? null : l.unit, aisle: l.aisle }));
}

/** Nombre maximal de noms envoyés à l'IA (taille de la requête). */
export const KNOWN_NAMES_MAX = 400;

/**
 * Noms déjà connus de l'appli, pour que l'IA les reprenne à l'identique : le stock d'abord,
 * puis les ingrédients des recettes et le garde-manger. Sans doublon (accents et casse ignorés).
 */
export function knownProductNames(stock: StockItem[], recipes: Recipe[], pantry: PantryItem[] = []): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (name: string) => {
    const n = name.trim().toLowerCase();
    const key = normalizeText(n);
    if (!key || seen.has(key) || out.length >= KNOWN_NAMES_MAX) return;
    seen.add(key);
    out.push(n);
  };
  stock.forEach((s) => add(s.name));
  recipes.forEach((r) => r.ingredients.forEach((i) => add(i.name)));
  pantry.forEach((p) => add(p.name));
  return out;
}

/** Message après l'ajout : « 12 produits ajoutés au stock, dont 3 déjà présents (quantités cumulées). » */
export function receiptSummary(entries: StockEntry[], before: StockItem[]): string {
  const n = entries.length;
  const merged = new Set(entries.filter((e) => stockMatch(before, e.name, e.quantity, e.unit) === 'cumul').map((e) => normalizeText(e.name))).size;
  return `${n} produit${n > 1 ? 's' : ''} ajouté${n > 1 ? 's' : ''} au stock${merged ? `, dont ${merged} déjà présent${merged > 1 ? 's' : ''} (quantités cumulées)` : ''}.`;
}
