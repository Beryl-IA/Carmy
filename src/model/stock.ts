// Réserve (V2-J3) — logique pure : produits achetés (avec quantités) et plats cuisinés (portions, dates limites).
import { displayQuantity, lineKey, unitFamily, TO_BASE, type UnitFamily } from './shopping';
import { normalizeText } from './search';
import type { Aisle, Ingredient, Unit } from './types';

/** Produit en réserve. Quantité en unité de base de sa famille (g, ml, ou nombre d'unités). */
export interface StockItem {
  id: string;
  name: string;
  family: UnitFamily;
  /** null : présent, quantité non suivie (famille « sans_quantite »). */
  base: number | null;
  aisle: Aisle;
  updatedAt: number;
}

export type DishPlace = 'frigo' | 'congelateur';

/** Plat cuisiné en réserve. */
export interface StoredDish {
  id: string;
  title: string;
  recipeId?: string;
  portions: number;
  place: DishPlace;
  cookedAt: number;
  /** Date limite de consommation (frigo) ou de conservation (congélateur) ; null si inconnue. */
  expiresAt: number | null;
}

/** Ce qu'on ajoute à la réserve (article de courses, saisie à la main). */
export interface StockEntry {
  name: string;
  quantity: number | null;
  unit: Unit;
  aisle: Aisle;
}

const EPSILON = 1e-6;
const DAY = 24 * 3600 * 1000;

export const stockKey = (s: Pick<StockItem, 'name' | 'family'>) => lineKey(s.name, s.family);

export function toBase(quantity: number, unit: Unit): number {
  return quantity * (unit ? TO_BASE[unit] ?? 1 : 1);
}

/** Quantité lisible d'un produit (« 700 g », « 1,2 l », « 3 »). */
export function stockDisplay(s: StockItem): { quantity: number | null; unit: Unit } {
  if (s.base === null || s.family === 'sans_quantite') return { quantity: null, unit: null };
  return displayQuantity(s.base, s.family, new Set());
}

/** Ajoute des articles : même nom et même famille d'unité → quantités cumulées. */
export function addToStock(stock: StockItem[], entries: StockEntry[], now: number, makeId: () => string): StockItem[] {
  const out = stock.map((s) => ({ ...s }));
  for (const e of entries) {
    const name = e.name.trim().toLowerCase();
    if (!name) continue;
    const family = unitFamily(e.unit, e.quantity);
    const existing = out.find((s) => stockKey(s) === lineKey(name, family));
    const base = e.quantity === null ? null : toBase(e.quantity, e.unit);
    if (existing) {
      existing.base = existing.base === null || base === null ? existing.base ?? base : existing.base + base;
      existing.updatedAt = now;
    } else {
      out.push({ id: makeId(), name, family, base, aisle: e.aisle, updatedAt: now });
    }
  }
  return out;
}

/**
 * Annule un ajout fait en cochant une ligne de courses (ligne décochée) : la quantité ajoutée repart,
 * un produit vidé est retiré. Un produit sans quantité n'est retiré que s'il avait été créé par le cochage.
 */
export function removeFromStock(stock: StockItem[], entries: (StockEntry & { created?: boolean })[], now: number): StockItem[] {
  let out = stock;
  for (const e of entries) {
    const key = lineKey(e.name.trim().toLowerCase(), unitFamily(e.unit, e.quantity));
    out = out.flatMap((s) => {
      if (stockKey(s) !== key) return [s];
      if (e.quantity === null || s.base === null) return e.created ? [] : [s];
      const left = s.base - toBase(e.quantity, e.unit);
      return left > EPSILON ? [{ ...s, base: left, updatedAt: now }] : [];
    });
  }
  return out;
}

/** Produit du stock utilisé par un repas simple. `quantity` null : le produit entier. */
export interface MealProduct {
  stockId: string;
  name: string;
  quantity: number | null;
  unit: Unit;
  aisle: Aisle;
}

/** Repas simple mangé : les produits choisis quittent le stock (quantité choisie, ou produit entier). */
export function consumeProducts(stock: StockItem[], products: MealProduct[], now: number): StockItem[] {
  let out = stock;
  for (const p of products) {
    const family = unitFamily(p.unit, p.quantity);
    const target = out.find((s) => s.id === p.stockId)
      ?? out.find((s) => normalizeText(s.name) === normalizeText(p.name) && (p.quantity === null || s.family === family));
    if (!target) continue;
    out = out.flatMap((s) => {
      if (s !== target) return [s];
      if (p.quantity === null || s.base === null) return [];
      const left = s.base - toBase(p.quantity, p.unit);
      return left > EPSILON ? [{ ...s, base: left, updatedAt: now }] : [];
    });
  }
  return out;
}

/** Part d'un produit réservée par des repas simples prévus : quantité (unité de base), ou 'tout'. */
export function reservedOf(item: StockItem, products: MealProduct[]): number | 'tout' {
  const mine = products.filter((p) => p.stockId === item.id);
  if (mine.some((p) => p.quantity === null)) return 'tout';
  return mine.reduce((n, p) => n + toBase(p.quantity ?? 0, p.unit), 0);
}

/** Remplace la quantité d'un produit (saisie dans la réserve). Une quantité nulle ou négative le retire. */
export function setStockQuantity(stock: StockItem[], id: string, quantity: number | null, unit: Unit, now: number): StockItem[] {
  return stock.flatMap((s) => {
    if (s.id !== id) return [s];
    if (quantity !== null && quantity <= 0) return [];
    const family = unitFamily(unit, quantity);
    return [{ ...s, family, base: quantity === null ? null : toBase(quantity, unit), updatedAt: now }];
  });
}

export interface StockChange {
  id: string;
  name: string;
  aisle: Aisle;
  before: { quantity: number | null; unit: Unit };
  /** null : le produit est épuisé et retiré de la réserve. */
  after: { quantity: number | null; unit: Unit } | null;
}

/**
 * Déduit des ingrédients cuisinés (déjà mis à l'échelle). Seuls les produits suivis en quantité, de même nom
 * et même famille d'unité, sont décomptés ; un produit épuisé est retiré.
 */
export function consumeFromStock(stock: StockItem[], ingredients: Ingredient[], now: number): { stock: StockItem[]; changes: StockChange[] } {
  const need = new Map<string, number>();
  for (const ing of ingredients) {
    if (ing.quantity === null || ing.optional) continue;
    const key = lineKey(ing.name.trim().toLowerCase(), unitFamily(ing.unit, ing.quantity));
    need.set(key, (need.get(key) ?? 0) + toBase(ing.quantity, ing.unit));
  }
  const changes: StockChange[] = [];
  const out: StockItem[] = [];
  for (const s of stock) {
    const n = s.base === null ? undefined : need.get(stockKey(s));
    if (n === undefined || s.base === null) {
      out.push(s);
      continue;
    }
    const left = s.base - n;
    const next = left > EPSILON ? { ...s, base: left, updatedAt: now } : null;
    changes.push({ id: s.id, name: s.name, aisle: s.aisle, before: stockDisplay(s), after: next ? stockDisplay(next) : null });
    if (next) out.push(next);
  }
  return { stock: out, changes };
}

/** Quantité disponible pour une ligne de courses : 'present' si le produit est là sans suivi de quantité. */
export function availableFor(stock: StockItem[], name: string, family: UnitFamily): number | 'present' | 0 {
  const n = normalizeText(name);
  const same = stock.filter((s) => normalizeText(s.name) === n);
  if (same.some((s) => s.family === 'sans_quantite' || s.base === null)) return 'present';
  if (family === 'sans_quantite') return same.length ? 'present' : 0;
  return same.find((s) => s.family === family)?.base ?? 0;
}

// ---------- Plats cuisinés ----------

export function addMonths(t: number, months: number): number {
  const d = new Date(t);
  d.setMonth(d.getMonth() + months);
  return d.getTime();
}

/** Mange une portion ; le plat disparaît à la dernière. */
export function eatPortion(dishes: StoredDish[], id: string): StoredDish[] {
  return dishes.flatMap((d) => (d.id !== id ? [d] : d.portions > 1 ? [{ ...d, portions: d.portions - 1 }] : []));
}

/** Durées utilisées quand la recette n'a pas de conservation renseignée. */
export const DEFAULT_FRIDGE_DAYS = 3;
export const DEFAULT_FREEZER_MONTHS = 3;
/** Un plat décongelé se garde 24 h au frigo. */
export const THAWED_DAYS = 1;

/**
 * Change un plat de place. Congeler : nouvelle limite selon la conservation au congélateur.
 * Décongeler : à manger sous 24 h.
 */
export function moveDish(dishes: StoredDish[], id: string, place: DishPlace, freezerMonths: number | null | undefined, now: number): StoredDish[] {
  return dishes.map((d) => {
    if (d.id !== id || d.place === place) return d;
    const expiresAt = place === 'congelateur' ? addMonths(now, freezerMonths || DEFAULT_FREEZER_MONTHS) : now + THAWED_DAYS * DAY;
    return { ...d, place, expiresAt };
  });
}

export type DishStatus = 'perime' | 'urgent' | 'ok' | 'inconnu';

/** Périmé, à manger aujourd'hui ou demain, ou OK. */
export function dishStatus(d: StoredDish, now: number): DishStatus {
  if (d.expiresAt === null) return 'inconnu';
  const end = endOfDay(d.expiresAt);
  if (now > end) return 'perime';
  return end - now <= 2 * DAY ? 'urgent' : 'ok';
}

function endOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

/** Plats à surveiller (pastille de l'onglet Réserve). */
export function urgentCount(dishes: StoredDish[], now: number): number {
  return dishes.filter((d) => {
    const s = dishStatus(d, now);
    return s === 'perime' || (s === 'urgent' && d.place === 'frigo');
  }).length;
}

export function sortDishes(dishes: StoredDish[]): StoredDish[] {
  return [...dishes].sort((a, b) => (a.expiresAt ?? Infinity) - (b.expiresAt ?? Infinity) || a.title.localeCompare(b.title, 'fr'));
}

export interface StoragePlan {
  recipeId?: string;
  title: string;
  fridge: number;
  freezer: number;
  fridgeDays: number | null;
  freezerMonths: number | null;
}

/**
 * Répartition proposée en fin de cuisson : au frigo ce qu'on mangera avant la date limite
 * (2 repas par jour pour une personne, plats en alternance), le reste au congélateur si possible.
 */
export function defaultSplit(portions: number, fridgeDays: number | null | undefined, freezerMonths: number | null | undefined, dishCount: number): { fridge: number; freezer: number } {
  if (portions <= 0) return { fridge: 0, freezer: 0 };
  if (freezerMonths === 0) return { fridge: portions, freezer: 0 };
  const days = fridgeDays ?? DEFAULT_FRIDGE_DAYS;
  const perDay = 2 / Math.max(1, dishCount);
  const fridge = Math.min(portions, Math.max(1, Math.floor(days * perDay)));
  return { fridge, freezer: portions - fridge };
}

/** Plats à ajouter à la réserve d'après la répartition choisie (une entrée par lieu). */
export function dishesFromPlan(plans: StoragePlan[], now: number, makeId: () => string): StoredDish[] {
  const out: StoredDish[] = [];
  for (const p of plans) {
    const base = { title: p.title, ...(p.recipeId ? { recipeId: p.recipeId } : {}), cookedAt: now };
    if (p.fridge > 0)
      out.push({ ...base, id: makeId(), portions: p.fridge, place: 'frigo', expiresAt: now + (p.fridgeDays ?? DEFAULT_FRIDGE_DAYS) * DAY });
    if (p.freezer > 0)
      out.push({ ...base, id: makeId(), portions: p.freezer, place: 'congelateur', expiresAt: addMonths(now, p.freezerMonths || DEFAULT_FREEZER_MONTHS) });
  }
  return out;
}
