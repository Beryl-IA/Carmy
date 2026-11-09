// Types partagés du cahier des charges (§7) utiles dès le jalon 1.

export const AISLES = [
  'fruits_legumes', 'boucherie_poissonnerie', 'cremerie_oeufs', 'boulangerie',
  'epicerie_salee', 'epicerie_sucree', 'surgeles', 'boissons', 'condiments_epices', 'autre',
] as const;
export type Aisle = (typeof AISLES)[number];

export const UNITS = [
  'g', 'kg', 'ml', 'cl', 'l', 'c_cafe', 'c_soupe', 'piece',
  'pincee', 'gousse', 'tranche', 'sachet', 'boite', 'bouquet',
] as const;
export type Unit = (typeof UNITS)[number] | null;

export interface Ingredient {
  name: string;
  quantity: number | null;
  unit: Unit;
  aisle: Aisle;
  note?: string;
  optional?: boolean;
}

export interface Step {
  text: string;
  timerSeconds?: number | null;
}

/** Résultat brut de l'IA, validé et normalisé (§8). */
export interface ExtractedRecipe {
  isRecipe: boolean;
  title: string;
  servings: number;
  prepMinutes: number | null;
  cookMinutes: number | null;
  tags: string[];
  ingredients: Ingredient[];
  steps: Step[];
  detectedLanguage: string | null;
}

export type ExtractionInput =
  | { kind: 'video'; file: Blob; fileName?: string }
  | { kind: 'text'; text: string };

export type ExtractionPhase = 'envoi' | 'traitement' | 'analyse' | 'mise_en_forme';

export interface ExtractionReport {
  recipe: ExtractedRecipe;
  /** Avertissements de normalisation (enum inconnue corrigée, etc.). */
  warnings: string[];
  /** Infos de diagnostic pour le go/no-go du jalon 1. */
  meta: {
    provider: string;
    model: string;
    transport: 'inline' | 'files_api' | 'text';
    bytes?: number;
    durationsMs: Partial<Record<ExtractionPhase, number>>;
    totalTokens?: number;
    attempts: number;
    rawJson: string;
  };
}

export interface ExtractionOptions {
  onPhase?: (phase: ExtractionPhase) => void;
  signal?: AbortSignal;
}

/** Abstraction obligatoire (F2) : on peut ajouter un autre fournisseur sans toucher au reste. */
export interface ExtractionProvider {
  readonly id: string;
  extract(input: ExtractionInput, options?: ExtractionOptions): Promise<ExtractionReport>;
}

/** Erreur d'extraction avec une catégorie exploitable par la future file d'attente (F7). */
export type ExtractionErrorKind = 'cle' | 'quota' | 'reseau' | 'trop_gros' | 'reponse_invalide' | 'api' | 'annule';

export class ExtractionError extends Error {
  constructor(public readonly kind: ExtractionErrorKind, message: string, public readonly detail?: string) {
    super(message);
    this.name = 'ExtractionError';
  }
}
