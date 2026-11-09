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

export interface Settings {
  apiKey?: string;
  model: string;
  defaultServings: number;
  lastBackupAt?: number;
  recipesSinceBackup: number;
  /** Ajouts au §7, issus du jalon 1 : analyse en basse résolution et test de la Files API. */
  fastMode: boolean;
  forceFilesApi: boolean;
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
