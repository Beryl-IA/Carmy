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

/** `image` : une ou plusieurs captures d'écran (V2-J1). */
/**
 * Conservation conseillée du plat cuisiné (V2-J2), en boîte hermétique.
 * null = inconnu ; freezerMonths = 0 : congélation déconseillée.
 */
export interface Storage {
  fridgeDays: number | null;
  freezerMonths: number | null;
}

/** Valeurs nutritionnelles estimées par portion (V2-J2). */
export interface Nutrition {
  kcal: number | null;
  /** Grammes. */
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fiber: number | null;
}

export const NUTRIENTS = ['kcal', 'protein', 'carbs', 'fat', 'fiber'] as const satisfies readonly (keyof Nutrition)[];

export type SourceType = 'video' | 'image' | 'text' | 'manual';

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
  /** Ajouts V2-J2 : facultatifs (anciennes recettes : « Compléter avec l'IA »). */
  storage?: Storage;
  nutrition?: Nutrition;
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
  /** 1.6.0 : ce que chaque ligne cochée a ajouté au stock (pour le retirer si on la décoche). */
  stocked: StockedLine[];
}

/** Article entré en stock en cochant une ligne de courses. `created` : produit sans quantité créé par ce cochage. */
export interface StockedLine {
  key: string;
  name: string;
  quantity: number | null;
  unit: Unit;
  aisle: Aisle;
  created?: boolean;
}

export const EMPTY_SHOPPING: ShoppingState = { selections: [], manualItems: [], checkedKeys: [], removedKeys: [], pantryOverrides: [], stocked: [] };

export interface PantryItem {
  name: string;
}

export const DEFAULT_PANTRY: PantryItem[] = ['sel', 'poivre', 'huile', 'huile d\'olive', 'sucre', 'farine', 'eau'].map((name) => ({ name }));

interface QueueJobBase {
  id: string;
  sourceUrl?: string;
  status: 'pending' | 'error';
  error?: string;
  attempts: number;
  createdAt: number;
  /** Ajouts au §7 : nom du fichier et miniature, pour reconnaître le média dans la file. */
  fileName?: string;
  thumbnail?: Blob;
}

/**
 * Média en attente d'extraction (F7) : conservé tant que la recette n'est pas validée.
 * V2-J1 : la file accepte aussi un lot de captures d'écran (dans l'ordre de lecture).
 */
export type QueueJob = QueueJobBase & ({ kind: 'video'; blob: Blob } | { kind: 'images'; images: Blob[] });

/** Champs modifiables d'un élément de la file. */
export type QueueJobPatch = Partial<Pick<QueueJobBase, 'status' | 'error' | 'attempts'>>;

/** Poids total d'un élément de la file. */
export function queueJobBytes(job: QueueJob): number {
  return job.kind === 'video' ? job.blob.size : job.images.reduce((n, b) => n + b.size, 0);
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
  /** 1.6.0 : mode Toulouse (en déplacement) : rien ne modifie le stock. */
  toulouse?: boolean;
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
