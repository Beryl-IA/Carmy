// Types partagés du cahier des charges (§7) utiles dès le jalon 1.

export { AISLES, UNITS } from '../model/types';
export type { Aisle, Unit, Ingredient, Step } from '../model/types';
import type { Ingredient, Nutrition, Recipe, Step, Storage } from '../model/types';

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
  /** V2-J2 : estimations de l'IA (absentes si non fournies). */
  storage?: Storage;
  nutrition?: Nutrition;
}

/** Estimations complémentaires d'une recette existante (V2-J2, « Compléter avec l'IA »). */
export interface RecipeDetails {
  storage?: Storage;
  nutrition?: Nutrition;
}

/** Ce que l'IA reçoit pour compléter une recette. */
export type RecipeForDetails = Pick<Recipe, 'title' | 'servings' | 'ingredients' | 'steps'>;

export type ExtractionInput =
  | { kind: 'video'; file: Blob; fileName?: string }
  /** Captures d'écran d'une même recette, dans l'ordre de lecture (V2-J1). */
  | { kind: 'images'; files: Blob[] }
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
    fastMode?: boolean;
    totalTokens?: number;
    attempts: number;
    rawJson: string;
  };
}

export interface ExtractionOptions {
  onPhase?: (phase: ExtractionPhase) => void;
  /** Nombre de caractères de réponse reçus (réponse en flux). */
  onReceive?: (chars: number) => void;
  signal?: AbortSignal;
}

/** Abstraction obligatoire (F2) : on peut ajouter un autre fournisseur sans toucher au reste. */
export interface ExtractionProvider {
  readonly id: string;
  extract(input: ExtractionInput, options?: ExtractionOptions): Promise<ExtractionReport>;
  /** Estime conservation et valeurs nutritionnelles d'une recette déjà saisie. */
  estimateDetails(recipe: RecipeForDetails, options?: Pick<ExtractionOptions, 'signal'>): Promise<RecipeDetails>;
}

/** Erreur d'extraction avec une catégorie exploitable par la future file d'attente (F7). */
export type ExtractionErrorKind = 'cle' | 'quota' | 'reseau' | 'trop_gros' | 'reponse_invalide' | 'api' | 'annule';

export class ExtractionError extends Error {
  /** Durées des étapes atteintes avant l'échec (diagnostic). */
  durationsMs?: Partial<Record<ExtractionPhase, number>>;

  constructor(public readonly kind: ExtractionErrorKind, message: string, public readonly detail?: string) {
    super(message);
    this.name = 'ExtractionError';
  }
}
