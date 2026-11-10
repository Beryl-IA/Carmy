// Liste de courses (F6, §9) — logique pure : mise à l'échelle, fusion, conversions, rayons, garde-manger.
import { roundQuantity } from './scale';
import { normalizeText } from './search';
import { AISLES, type Aisle, type PantryItem, type Recipe, type ShoppingState, type Unit } from './types';
import { availableFor, type StockItem } from './stock';

/** Famille d'unité : seules les unités d'une même famille se cumulent (§9.2–9.4). */
export type UnitFamily = 'masse' | 'volume' | 'sans_quantite' | Exclude<Unit, null> | 'aucune';

export const TO_BASE: Partial<Record<Exclude<Unit, null>, number>> = {
  g: 1, kg: 1000, // → grammes
  ml: 1, cl: 10, l: 1000, c_soupe: 15, c_cafe: 5, // → millilitres
};

export function unitFamily(unit: Unit, quantity: number | null): UnitFamily {
  if (quantity === null) return 'sans_quantite';
  if (unit === 'g' || unit === 'kg') return 'masse';
  if (unit === 'ml' || unit === 'cl' || unit === 'l' || unit === 'c_soupe' || unit === 'c_cafe') return 'volume';
  return unit ?? 'aucune';
}

export function lineKey(name: string, family: UnitFamily): string {
  return `${normalizeText(name)}|${family}`;
}

export interface ShoppingLine {
  key: string;
  name: string;
  quantity: number | null;
  unit: Unit;
  aisle: Aisle;
  origin: 'recipe' | 'manual';
  recipeIds: string[];
  checked: boolean;
  optional: boolean;
  /** V2-J3 : pourquoi la ligne est dans « Déjà à la maison » (garde-manger ou réserve). */
  covered?: 'pantry' | 'stock';
  /** V2-J3 : quantité déjà en réserve (la ligne n'affiche que ce qui manque), ou 'present'. */
  inStock?: { quantity: number; unit: Unit } | 'present';
}

export interface ShoppingList {
  sections: { aisle: Aisle; lines: ShoppingLine[] }[];
  /** Ingrédients du garde-manger ou entièrement en réserve, affichés à part (« Déjà à la maison »). */
  pantry: ShoppingLine[];
  remaining: number;
  total: number;
}

interface Acc {
  name: string;
  family: UnitFamily;
  base: number;
  units: Set<Unit>;
  aisle: Aisle;
  recipeIds: Set<string>;
  allOptional: boolean;
}

/** Quantité cumulée (en unité de base) → unité la plus lisible (§9.3). */
export function displayQuantity(base: number, family: UnitFamily, units: Set<Unit>): { quantity: number; unit: Unit } {
  const only = units.size === 1 ? [...units][0]! : undefined;
  if (family === 'masse') {
    if (only === 'kg') return { quantity: roundQuantity(base / 1000, 'kg'), unit: 'kg' };
    const g = roundQuantity(base, 'g');
    return g >= 1000 ? { quantity: roundQuantity(base / 1000, 'kg'), unit: 'kg' } : { quantity: g, unit: 'g' };
  }
  if (family === 'volume') {
    // Une seule unité : on la garde (3 c. à soupe plutôt que 45 ml), sauf ml qui passe en l au-delà d'un litre.
    if (only && only !== 'ml') return { quantity: roundQuantity(base / (TO_BASE[only] ?? 1), only), unit: only };
    const ml = roundQuantity(base, 'ml');
    return ml >= 1000 ? { quantity: roundQuantity(base / 1000, 'l'), unit: 'l' } : { quantity: ml, unit: 'ml' };
  }
  const unit = (family === 'aucune' ? null : family) as Unit;
  return { quantity: roundQuantity(base, unit), unit };
}

export function buildShoppingList(recipes: Recipe[], state: ShoppingState, pantry: PantryItem[], stock: StockItem[] = []): ShoppingList {
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const acc = new Map<string, Acc>();

  for (const sel of state.selections) {
    const r = byId.get(sel.recipeId);
    if (!r || !(sel.servings > 0)) continue;
    const factor = sel.servings / (r.servings > 0 ? r.servings : 1);
    for (const ing of r.ingredients) {
      const name = ing.name.trim().toLowerCase();
      if (!name) continue;
      const family = unitFamily(ing.unit, ing.quantity);
      const key = lineKey(name, family);
      let a = acc.get(key);
      if (!a) {
        a = { name, family, base: 0, units: new Set(), aisle: ing.aisle, recipeIds: new Set(), allOptional: true };
        acc.set(key, a);
      }
      if (ing.quantity !== null) {
        a.base += ing.quantity * factor * (ing.unit ? TO_BASE[ing.unit] ?? 1 : 1);
        a.units.add(ing.unit);
      }
      a.recipeIds.add(r.id);
      if (!ing.optional) a.allOptional = false;
    }
  }

  const checked = new Set(state.checkedKeys);
  const removed = new Set(state.removedKeys);
  const overrides = new Set(state.pantryOverrides);
  const pantrySet = new Set(pantry.map((p) => normalizeText(p.name)).filter(Boolean));

  const lines: ShoppingLine[] = [];
  const pantryLines: ShoppingLine[] = [];

  for (const [key, a] of acc) {
    if (removed.has(key)) continue;
    const { quantity, unit } =
      a.family === 'sans_quantite' ? { quantity: null, unit: null as Unit } : displayQuantity(a.base, a.family, a.units);
    const line: ShoppingLine = {
      key, name: a.name, quantity, unit, aisle: a.aisle, origin: 'recipe',
      recipeIds: [...a.recipeIds], checked: checked.has(key), optional: a.allOptional,
    };
    if (overrides.has(key)) {
      lines.push(line);
      continue;
    }
    if (pantrySet.has(normalizeText(a.name))) {
      pantryLines.push({ ...line, covered: 'pantry' });
      continue;
    }
    // V2-J3 : la réserve couvre tout ou partie du besoin.
    const avail = availableFor(stock, a.name, a.family);
    if (avail === 'present') {
      pantryLines.push({ ...line, covered: 'stock', inStock: 'present' });
      continue;
    }
    if (avail > 0 && a.family !== 'sans_quantite') {
      const inStock = displayQuantity(avail, a.family, new Set());
      if (avail >= a.base - 1e-6) {
        pantryLines.push({ ...line, covered: 'stock', inStock });
        continue;
      }
      const missing = displayQuantity(a.base - avail, a.family, a.units);
      lines.push({ ...line, quantity: missing.quantity, unit: missing.unit, inStock });
      continue;
    }
    lines.push(line);
  }

  // Articles manuels : lignes séparées, jamais fusionnées ni masquées par le garde-manger.
  for (const m of state.manualItems) {
    const key = `manuel:${m.id}`;
    lines.push({
      key, name: m.name, quantity: m.quantity, unit: m.unit, aisle: m.aisle, origin: 'manual',
      recipeIds: [], checked: checked.has(key), optional: false,
    });
  }

  const byName = (a: ShoppingLine, b: ShoppingLine) => a.name.localeCompare(b.name, 'fr');
  const sections = AISLES.map((aisle) => ({
    aisle,
    // Les articles cochés descendent en bas de leur rayon.
    lines: lines.filter((l) => l.aisle === aisle).sort((a, b) => Number(a.checked) - Number(b.checked) || byName(a, b)),
  })).filter((s) => s.lines.length > 0);

  return {
    sections,
    pantry: pantryLines.sort(byName),
    remaining: lines.filter((l) => !l.checked).length,
    total: lines.length,
  };
}
