// Brouillon éditable de l'écran de relecture (F3). Logique pure : conversion et validation.
import type { ExtractedRecipe } from '../extraction/types';
import type { Aisle, Recipe, SourceType, Unit } from './types';

export interface IngredientDraft {
  key: string;
  quantity: string;
  unit: Unit;
  name: string;
  aisle: Aisle;
  note: string;
  optional: boolean;
}

export interface StepDraft {
  key: string;
  text: string;
  /** Minuteur saisi en minutes (« 1,5 » = 90 s). */
  timerMinutes: string;
}

export interface RecipeDraft {
  /** Présent quand on modifie une recette existante. */
  id?: string;
  createdAt?: number;
  title: string;
  servings: string;
  prepMinutes: string;
  cookMinutes: string;
  tags: string[];
  collectionIds: string[];
  ingredients: IngredientDraft[];
  steps: StepDraft[];
  sourceType: SourceType;
  sourceUrl: string;
  thumbnail?: Blob;
}

let keySeq = 0;
export const newKey = () => `k${Date.now().toString(36)}${(keySeq++).toString(36)}`;

export const emptyIngredient = (): IngredientDraft => ({
  key: newKey(), quantity: '', unit: null, name: '', aisle: 'autre', note: '', optional: false,
});
export const emptyStep = (): StepDraft => ({ key: newKey(), text: '', timerMinutes: '' });

const VULGAR: Record<string, number> = { '¼': 0.25, '½': 0.5, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 };

/**
 * Lit une quantité saisie à la main : « 2 », « 1,5 », « 1/2 », « 1 1/2 », « ½ », « 1½ ».
 * Renvoie null si vide, undefined si illisible.
 */
export function parseQuantity(input: string): number | null | undefined {
  let s = input.trim().replace(',', '.');
  if (!s) return null;
  let total = 0;
  const v = Object.keys(VULGAR).find((c) => s.endsWith(c));
  if (v) {
    total += VULGAR[v] ?? 0;
    s = s.slice(0, -v.length).trim();
    if (!s) return total;
  }
  const mixed = /^(\d+)\s+(\d+)\/(\d+)$/.exec(s);
  if (mixed) {
    const den = Number(mixed[3]);
    return den ? total + Number(mixed[1]) + Number(mixed[2]) / den : undefined;
  }
  const frac = /^(\d+)\/(\d+)$/.exec(s);
  if (frac) {
    const den = Number(frac[2]);
    return den ? total + Number(frac[1]) / den : undefined;
  }
  if (!/^\d*\.?\d+$/.test(s)) return undefined;
  return total + Number(s);
}

/** Nombre → texte de champ (« 0,5 », « 250 »). */
export function numberToInput(n: number | null | undefined): string {
  if (n === null || n === undefined) return '';
  return String(Math.round(n * 1000) / 1000).replace('.', ',');
}

export function emptyDraft(defaultServings = 1): RecipeDraft {
  return {
    title: '', servings: String(defaultServings), prepMinutes: '', cookMinutes: '',
    tags: [], collectionIds: [], ingredients: [emptyIngredient()], steps: [emptyStep()],
    sourceType: 'manual', sourceUrl: '',
  };
}

export function draftFromExtracted(
  r: ExtractedRecipe,
  source: { type: SourceType; url?: string; thumbnail?: Blob },
): RecipeDraft {
  return {
    title: r.title,
    servings: String(r.servings),
    prepMinutes: numberToInput(r.prepMinutes),
    cookMinutes: numberToInput(r.cookMinutes),
    tags: [...r.tags],
    collectionIds: [],
    ingredients: r.ingredients.map((i) => ({
      key: newKey(), quantity: numberToInput(i.quantity), unit: i.unit, name: i.name, aisle: i.aisle,
      note: i.note ?? '', optional: i.optional ?? false,
    })),
    steps: r.steps.map((s) => ({ key: newKey(), text: s.text, timerMinutes: s.timerSeconds ? numberToInput(s.timerSeconds / 60) : '' })),
    sourceType: source.type,
    sourceUrl: source.url ?? '',
    thumbnail: source.thumbnail,
  };
}

export function draftFromRecipe(r: Recipe): RecipeDraft {
  return {
    ...draftFromExtracted(
      { isRecipe: true, title: r.title, servings: r.servings, prepMinutes: r.prepMinutes ?? null, cookMinutes: r.cookMinutes ?? null,
        tags: r.tags, ingredients: r.ingredients, steps: r.steps, detectedLanguage: null },
      { type: r.sourceType, url: r.sourceUrl, thumbnail: r.thumbnail },
    ),
    id: r.id,
    createdAt: r.createdAt,
    collectionIds: [...r.collectionIds],
  };
}

export function normalizeTag(t: string): string {
  return t.trim().toLowerCase().replace(/\s+/g, ' ');
}

function parseMinutes(s: string, label: string, errors: string[]): number | null {
  if (!s.trim()) return null;
  const n = parseQuantity(s);
  if (n === undefined || n === null) {
    errors.push(`${label} : nombre de minutes illisible.`);
    return null;
  }
  return Math.round(n);
}

export type DraftResult = { ok: true; recipe: Recipe } | { ok: false; errors: string[] };

/** Valide le brouillon et produit la recette à enregistrer. Les lignes entièrement vides sont ignorées. */
export function draftToRecipe(d: RecipeDraft, now: number, makeId: () => string): DraftResult {
  const errors: string[] = [];
  const title = d.title.trim();
  if (!title) errors.push('Le titre est obligatoire.');

  const servings = parseQuantity(d.servings);
  if (servings === undefined || servings === null || servings < 1 || !Number.isInteger(servings))
    errors.push('Le nombre de portions doit être un entier supérieur ou égal à 1.');

  const prepMinutes = parseMinutes(d.prepMinutes, 'Préparation', errors);
  const cookMinutes = parseMinutes(d.cookMinutes, 'Cuisson', errors);

  const ingredients: Recipe['ingredients'] = [];
  d.ingredients.forEach((i, idx) => {
    const name = i.name.trim().toLowerCase();
    const isEmpty = !name && !i.quantity.trim() && !i.note.trim();
    if (isEmpty) return;
    if (!name) {
      errors.push(`Ingrédient ${idx + 1} : le nom est obligatoire.`);
      return;
    }
    const q = parseQuantity(i.quantity);
    if (q === undefined) {
      errors.push(`Ingrédient « ${name} » : quantité illisible (exemples : 2, 1,5, 1/2).`);
      return;
    }
    ingredients.push({
      name,
      quantity: q !== null && q > 0 ? q : null,
      unit: i.unit,
      aisle: i.aisle,
      ...(i.note.trim() ? { note: i.note.trim() } : {}),
      ...(i.optional ? { optional: true } : {}),
    });
  });

  const steps: Recipe['steps'] = [];
  d.steps.forEach((s, idx) => {
    const text = s.text.trim();
    if (!text) return;
    let timerSeconds: number | null = null;
    if (s.timerMinutes.trim()) {
      const m = parseQuantity(s.timerMinutes);
      if (m === undefined || m === null) errors.push(`Étape ${idx + 1} : minuteur illisible.`);
      else if (m > 0) timerSeconds = Math.round(m * 60);
    }
    steps.push({ text, timerSeconds });
  });

  const sourceUrl = d.sourceUrl.trim();
  if (sourceUrl && !/^https?:\/\/\S+$/i.test(sourceUrl)) errors.push('Le lien d\'origine doit commencer par https://');

  if (errors.length) return { ok: false, errors };

  const tags = [...new Set(d.tags.map(normalizeTag).filter(Boolean))];
  return {
    ok: true,
    recipe: {
      id: d.id ?? makeId(),
      title,
      servings: servings as number,
      prepMinutes,
      cookMinutes,
      tags,
      collectionIds: [...d.collectionIds],
      ingredients,
      steps,
      sourceType: d.sourceType,
      ...(sourceUrl ? { sourceUrl } : {}),
      ...(d.thumbnail ? { thumbnail: d.thumbnail } : {}),
      createdAt: d.createdAt ?? now,
      updatedAt: now,
    },
  };
}

/** Déplace l'élément i d'un cran (-1 vers le haut, +1 vers le bas). Renvoie un nouveau tableau. */
export function moveItem<T>(list: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (i < 0 || i >= list.length || j < 0 || j >= list.length) return list;
  const out = [...list];
  [out[i], out[j]] = [out[j] as T, out[i] as T];
  return out;
}
