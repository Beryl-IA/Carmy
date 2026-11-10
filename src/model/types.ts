// Modèle de données (cahier des charges §7).

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
  /** Nom canonique : français, minuscule, singulier (« oignon »). */
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

export type SourceType = 'video' | 'text' | 'manual';

export interface Recipe {
  id: string;
  title: string;
  /** Portions de base de la fiche. */
  servings: number;
  prepMinutes?: number | null;
  cookMinutes?: number | null;
  tags: string[];
  collectionIds: string[];
  ingredients: Ingredient[];
  steps: Step[];
  sourceType: SourceType;
  sourceUrl?: string;
  thumbnail?: Blob;
  createdAt: number;
  updatedAt: number;
}

export interface Collection {
  id: string;
  name: string;
}

/** Article ajouté à la main (hors recettes). */
export interface ShoppingItem {
  id: string;
  name: string;
  quantity: number | null;
  unit: Unit;
  aisle: Aisle;
  checked: boolean;
  origin: 'recipe' | 'manual';
  recipeIds: string[];
}

/**
 * La liste est recalculée à partir des recettes choisies, des articles manuels et du garde-manger ;
 * on ne stocke que les choix et l'état coché (§7).
 */
export interface ShoppingState {
  selections: { recipeId: string; servings: number }[];
  manualItems: ShoppingItem[];
  checkedKeys: string[];
  /** Ajouts au §7 : lignes issues de recettes retirées de la liste, et articles du garde-manger à acheter quand même. */
  removedKeys: string[];
  pantryOverrides: string[];
}

export const EMPTY_SHOPPING: ShoppingState = { selections: [], manualItems: [], checkedKeys: [], removedKeys: [], pantryOverrides: [] };

export interface PantryItem {
  name: string;
}

export const DEFAULT_PANTRY: PantryItem[] = ['sel', 'poivre', 'huile', 'huile d\'olive', 'sucre', 'farine', 'eau'].map((name) => ({ name }));

/** Vidéo en attente d'extraction (F7) : conservée tant que la recette n'est pas validée. */
export interface QueueJob {
  id: string;
  kind: 'video';
  blob: Blob;
  sourceUrl?: string;
  status: 'pending' | 'error';
  error?: string;
  attempts: number;
  createdAt: number;
  /** Ajouts au §7 : nom du fichier et miniature, pour reconnaître la vidéo dans la file. */
  fileName?: string;
  thumbnail?: Blob;
}

/** Nombre maximal de vidéos gardées en file d'attente (§11 : mémoire). */
export const QUEUE_MAX = 5;

export interface Settings {
  apiKey?: string;
  model: string;
  defaultServings: number;
  lastBackupAt?: number;
  recipesSinceBackup: number;
  /** Ajouts au §7, issus du jalon 1 : analyse en basse résolution et test de la Files API. */
  fastMode: boolean;
  forceFilesApi: boolean;
  /** Ajouts pour le rappel de sauvegarde (F8). */
  firstLaunchAt?: number;
  backupSnoozeUntil?: number;
}

export const DEFAULT_SETTINGS: Settings = {
  model: '',
  defaultServings: 1,
  recipesSinceBackup: 0,
  fastMode: true,
  forceFilesApi: false,
};

export const TAG_SUGGESTIONS = [
  'entrée', 'plat', 'dessert', 'apéritif', 'petit-déjeuner', 'goûter', 'boisson',
  'rapide', 'végétarien', 'vegan', 'sans gluten', 'batch cooking',
];
