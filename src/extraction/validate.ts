// Validation et normalisation (pure) de la réponse JSON de l'IA (§8).
import { AISLES, UNITS, type Aisle, type ExtractedRecipe, type Ingredient, type Step, type Unit } from './types';

export class InvalidRecipeJson extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidRecipeJson';
  }
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Synonymes fréquents renvoyés malgré l'énumération. */
const UNIT_ALIASES: Record<string, Exclude<Unit, null>> = {
  gramme: 'g', grammes: 'g', gr: 'g', kilo: 'kg', kilogramme: 'kg',
  millilitre: 'ml', centilitre: 'cl', litre: 'l',
  'c. à café': 'c_cafe', cac: 'c_cafe', 'cuillère à café': 'c_cafe', tsp: 'c_cafe',
  'c. à soupe': 'c_soupe', cas: 'c_soupe', 'cuillère à soupe': 'c_soupe', tbsp: 'c_soupe',
  pièce: 'piece', pieces: 'piece', pièces: 'piece', unité: 'piece',
  pincée: 'pincee', gousses: 'gousse', tranches: 'tranche', sachets: 'sachet', boîte: 'boite', boites: 'boite',
};

function toNumberOrNull(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.replace(',', '.'));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function toPositiveIntOrNull(v: unknown): number | null {
  const n = toNumberOrNull(v);
  return n !== null && n >= 0 ? Math.round(n) : null;
}

function normalizeUnit(v: unknown, warnings: string[], ctx: string): Unit {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v !== 'string') {
    warnings.push(`${ctx} : unité ignorée (${JSON.stringify(v)})`);
    return null;
  }
  const s = v.trim().toLowerCase();
  if ((UNITS as readonly string[]).includes(s)) return s as Unit;
  const alias = UNIT_ALIASES[s];
  if (alias) return alias;
  warnings.push(`${ctx} : unité inconnue « ${v} » remplacée par aucune unité`);
  return null;
}

function normalizeAisle(v: unknown, warnings: string[], ctx: string): Aisle {
  if (typeof v === 'string' && (AISLES as readonly string[]).includes(v)) return v as Aisle;
  warnings.push(`${ctx} : rayon inconnu « ${String(v)} » remplacé par « autre »`);
  return 'autre';
}

function normalizeIngredient(v: unknown, i: number, warnings: string[]): Ingredient | null {
  const ctx = `Ingrédient ${i + 1}`;
  if (!isObj(v)) {
    warnings.push(`${ctx} ignoré (format invalide)`);
    return null;
  }
  const name = typeof v.name === 'string' ? v.name.trim().toLowerCase() : '';
  if (!name) {
    warnings.push(`${ctx} ignoré (nom vide)`);
    return null;
  }
  const ing: Ingredient = {
    name,
    quantity: toNumberOrNull(v.quantity),
    unit: normalizeUnit(v.unit, warnings, ctx),
    aisle: normalizeAisle(v.aisle, warnings, ctx),
  };
  if (ing.quantity !== null && ing.quantity <= 0) ing.quantity = null;
  if (typeof v.note === 'string' && v.note.trim()) ing.note = v.note.trim();
  if (v.optional === true) ing.optional = true;
  return ing;
}

function normalizeStep(v: unknown, i: number, warnings: string[]): Step | null {
  const text = isObj(v) && typeof v.text === 'string' ? v.text.trim() : typeof v === 'string' ? v.trim() : '';
  if (!text) {
    warnings.push(`Étape ${i + 1} ignorée (texte vide)`);
    return null;
  }
  const timer = isObj(v) ? toPositiveIntOrNull(v.timerSeconds) : null;
  return { text, timerSeconds: timer && timer > 0 ? timer : null };
}

/**
 * Parse et valide la réponse. Lève InvalidRecipeJson si la structure est inexploitable
 * (déclenche une nouvelle tentative puis la file d'attente). Corrige les écarts mineurs
 * en les signalant dans `warnings`.
 */
export function parseExtractedRecipe(raw: string): { recipe: ExtractedRecipe; warnings: string[] } {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new InvalidRecipeJson('La réponse de l\'IA n\'est pas un JSON valide.');
  }
  if (!isObj(data)) throw new InvalidRecipeJson('La réponse de l\'IA n\'est pas un objet JSON.');
  if (typeof data.isRecipe !== 'boolean') throw new InvalidRecipeJson('Champ « isRecipe » manquant.');

  const warnings: string[] = [];
  const language = typeof data.detectedLanguage === 'string' && data.detectedLanguage.trim()
    ? data.detectedLanguage.trim().toLowerCase()
    : null;

  if (!data.isRecipe) {
    return {
      recipe: { isRecipe: false, title: '', servings: 1, prepMinutes: null, cookMinutes: null, tags: [], ingredients: [], steps: [], detectedLanguage: language },
      warnings,
    };
  }

  const title = typeof data.title === 'string' ? data.title.trim() : '';
  if (!title) throw new InvalidRecipeJson('Recette sans titre.');
  if (!Array.isArray(data.ingredients)) throw new InvalidRecipeJson('Liste d\'ingrédients manquante.');
  if (!Array.isArray(data.steps)) throw new InvalidRecipeJson('Liste d\'étapes manquante.');

  let servings = toPositiveIntOrNull(data.servings);
  if (!servings || servings < 1) {
    warnings.push('Nombre de portions absent : 1 par défaut');
    servings = 1;
  }

  const tags = Array.isArray(data.tags)
    ? [...new Set(data.tags.filter((t): t is string => typeof t === 'string').map((t) => t.trim().toLowerCase()).filter(Boolean))]
    : [];

  return {
    recipe: {
      isRecipe: true,
      title,
      servings,
      prepMinutes: toPositiveIntOrNull(data.prepMinutes),
      cookMinutes: toPositiveIntOrNull(data.cookMinutes),
      tags,
      ingredients: data.ingredients.map((v, i) => normalizeIngredient(v, i, warnings)).filter((x): x is Ingredient => x !== null),
      steps: data.steps.map((v, i) => normalizeStep(v, i, warnings)).filter((x): x is Step => x !== null),
      detectedLanguage: language,
    },
    warnings,
  };
}
