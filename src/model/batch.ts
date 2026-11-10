// Session de batch cooking (V2-J2b) — logique pure : déroulé, validation de la réponse de l'IA, récapitulatif.
import { formatQuantity, formatUnit } from '../format';
import { scaleIngredients } from './scale';
import type { Ingredient, Recipe } from './types';

export interface BatchSelection {
  recipeId: string;
  servings: number;
}

export interface BatchStep {
  text: string;
  /** Index des recettes concernées dans `selections` (une étape peut en servir plusieurs). */
  recipes: number[];
  timerSeconds: number | null;
}

export interface BatchPlan {
  steps: BatchStep[];
  /** Durée totale estimée de la session, en minutes. */
  totalMinutes: number | null;
  /** 'ia' : déroulé optimisé par l'IA ; 'simple' : recettes l'une après l'autre. */
  source: 'ia' | 'simple';
  /** Signature des recettes et portions pour lesquelles le déroulé a été construit. */
  forKey: string;
  createdAt: number;
}

export interface BatchSession {
  id: string;
  selections: BatchSelection[];
  plan?: BatchPlan;
  /** Étape en cours dans le mode cuisine de la session. */
  step?: number;
  startedAt?: number;
  finishedAt?: number;
}

/** Couleurs des pastilles de recette (fond clair + texte foncé, contraste AA). */
export const RECIPE_COLORS = [
  { bg: '#FDE2C8', fg: '#7A3412' },
  { bg: '#DCEBD9', fg: '#2F5233' },
  { bg: '#E3E0F4', fg: '#3E3570' },
  { bg: '#FBE0E6', fg: '#7A2238' },
  { bg: '#DDEEF5', fg: '#1D4F66' },
  { bg: '#F5EBC8', fg: '#5E4A0F' },
] as const;

export const recipeColor = (i: number) => RECIPE_COLORS[i % RECIPE_COLORS.length] ?? RECIPE_COLORS[0];

/** Nombre maximal de recettes par session (lisibilité du déroulé, taille de la requête). */
export const BATCH_MAX_RECIPES = 6;

export function selectionKey(selections: BatchSelection[]): string {
  return selections.map((s) => `${s.recipeId}:${s.servings}`).join('|');
}

/** Le déroulé ne correspond plus aux recettes ou portions choisies. */
export function planIsStale(session: BatchSession): boolean {
  return Boolean(session.plan && session.plan.forKey !== selectionKey(session.selections));
}

export interface BatchRecipe {
  recipe: Recipe;
  servings: number;
  /** Ingrédients mis à l'échelle des portions de la session. */
  ingredients: Ingredient[];
}

/** Associe chaque sélection à sa recette (les recettes supprimées sont ignorées). */
export function resolveSelections(selections: BatchSelection[], recipes: Recipe[]): BatchRecipe[] {
  const byId = new Map(recipes.map((r) => [r.id, r]));
  return selections.flatMap((s) => {
    const recipe = byId.get(s.recipeId);
    return recipe ? [{ recipe, servings: s.servings, ingredients: scaleIngredients(recipe.ingredients, recipe.servings, s.servings) }] : [];
  });
}

const minutes = (r: Recipe) => (r.prepMinutes ?? 0) + (r.cookMinutes ?? 0);

/**
 * Déroulé sans IA : les recettes l'une après l'autre, la plus longue à cuire d'abord
 * (on avance les autres pendant qu'elle cuit), puis le rangement.
 */
export function simplePlan(items: BatchRecipe[], selections: BatchSelection[], now: number): BatchPlan {
  const order = items.map((_, i) => i).sort((a, b) => (items[b]?.recipe.cookMinutes ?? 0) - (items[a]?.recipe.cookMinutes ?? 0));
  const steps: BatchStep[] = [];
  for (const i of order) {
    const it = items[i];
    if (!it) continue;
    for (const s of it.recipe.steps) steps.push({ text: s.text, recipes: [i], timerSeconds: s.timerSeconds ?? null });
  }
  if (items.length)
    steps.push({ text: 'Laisse refroidir les plats (2 h maximum à température ambiante), puis répartis-les en portions dans des boîtes hermétiques, étiquetées avec la date.', recipes: items.map((_, i) => i), timerSeconds: null });
  const total = items.reduce((n, it) => n + minutes(it.recipe), 0);
  return { steps, totalMinutes: total || null, source: 'simple', forKey: selectionKey(selections), createdAt: now };
}

/** Données envoyées à l'IA pour construire le déroulé. */
export function batchPayload(items: BatchRecipe[]) {
  return items.map((it, i) => ({
    index: i,
    title: it.recipe.title,
    servings: it.servings,
    prepMinutes: it.recipe.prepMinutes ?? null,
    cookMinutes: it.recipe.cookMinutes ?? null,
    ingredients: it.ingredients.map((g) => [formatQuantity(g.quantity), formatUnit(g.unit, g.quantity), g.name, g.note ? `(${g.note})` : ''].filter(Boolean).join(' ')),
    steps: it.recipe.steps.map((s) => (s.timerSeconds ? `${s.text} [minuteur ${Math.round(s.timerSeconds / 60)} min]` : s.text)),
  }));
}

export class InvalidBatchPlan extends Error {}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Valide la réponse de l'IA : étapes non vides, index de recettes existants.
 * Lève InvalidBatchPlan si aucune étape exploitable ou si une recette n'apparaît dans aucune étape.
 */
export function parseBatchPlan(raw: string, recipeCount: number, selections: BatchSelection[], now: number): BatchPlan {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new InvalidBatchPlan('La réponse de l\'IA n\'est pas un JSON valide.');
  }
  if (!isObj(data) || !Array.isArray(data.steps)) throw new InvalidBatchPlan('Déroulé absent de la réponse.');
  const steps: BatchStep[] = [];
  for (const s of data.steps) {
    if (!isObj(s) || typeof s.text !== 'string' || !s.text.trim()) continue;
    const recipes = Array.isArray(s.recipes)
      ? [...new Set(s.recipes.filter((n): n is number => Number.isInteger(n) && (n as number) >= 0 && (n as number) < recipeCount))].sort((a, b) => a - b)
      : [];
    const t = typeof s.timerSeconds === 'number' && Number.isFinite(s.timerSeconds) && s.timerSeconds > 0 ? Math.round(s.timerSeconds) : null;
    steps.push({ text: s.text.trim(), recipes, timerSeconds: t });
  }
  if (!steps.length) throw new InvalidBatchPlan('Déroulé vide.');
  for (let i = 0; i < recipeCount; i++)
    if (!steps.some((s) => s.recipes.includes(i))) throw new InvalidBatchPlan(`La recette n° ${i + 1} manque dans le déroulé.`);
  const total = typeof data.totalMinutes === 'number' && data.totalMinutes > 0 ? Math.round(data.totalMinutes) : null;
  return { steps, totalMinutes: total, source: 'ia', forKey: selectionKey(selections), createdAt: now };
}

const DAY = 24 * 3600 * 1000;

export interface StorageAdvice {
  title: string;
  servings: number;
  /** Date limite au frigo (null si inconnue). */
  fridgeUntil: number | null;
  /** Date limite au congélateur ; null si inconnue ou déconseillée. */
  freezerUntil: number | null;
  freezable: boolean | null;
}

/** Récapitulatif de fin de session : jusqu'à quand garder chaque plat. */
export function storageAdvice(items: BatchRecipe[], cookedAt: number): StorageAdvice[] {
  return items.map((it) => {
    const st = it.recipe.storage;
    const freezable = st?.freezerMonths == null ? null : st.freezerMonths > 0;
    const freezerUntil = st?.freezerMonths ? addMonths(cookedAt, st.freezerMonths) : null;
    return {
      title: it.recipe.title,
      servings: it.servings,
      fridgeUntil: st?.fridgeDays != null ? cookedAt + st.fridgeDays * DAY : null,
      freezerUntil,
      freezable,
    };
  });
}

function addMonths(t: number, months: number): number {
  const d = new Date(t);
  d.setMonth(d.getMonth() + months);
  return d.getTime();
}
