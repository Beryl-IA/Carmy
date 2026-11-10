// Sauvegarde / restauration (F8) — logique pure : format du fichier, validation, fusion, rappel.
import { APP_NAME } from '../config';
import {
  EMPTY_SHOPPING, type Collection, type PantryItem, type Recipe, type Settings, type ShoppingState,
} from './types';

export const BACKUP_FORMAT = 1;
const DAY = 24 * 3600 * 1000;

/** Données de l'appli, telles qu'elles sont stockées (miniatures en Blob). */
export interface AppData {
  recipes: Recipe[];
  collections: Collection[];
  pantry: PantryItem[];
  /** Réglages sans la clé API. */
  settings: Omit<Settings, 'apiKey'>;
  shopping: ShoppingState;
}

type StoredRecipe = Omit<Recipe, 'thumbnail'> & { thumbnail?: string };

/** Contenu du fichier JSON (miniatures en data URL base64). */
export interface BackupFile {
  app: string;
  format: number;
  exportedAt: string;
  appVersion: string;
  recipes: StoredRecipe[];
  collections: Collection[];
  tags: string[];
  pantry: PantryItem[];
  settings: Omit<Settings, 'apiKey'>;
  shopping: ShoppingState;
}

// ---------- Blob <-> data URL (fonctionne aussi hors navigateur) ----------

export async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${blob.type || 'application/octet-stream'};base64,${btoa(bin)}`;
}

export function dataUrlToBlob(url: string): Blob | null {
  const m = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(url);
  if (!m || !m[2]) return null;
  try {
    const bin = atob(m[3] ?? '');
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: m[1] || 'application/octet-stream' });
  } catch {
    return null;
  }
}

// ---------- Export ----------

export function backupFileName(date: Date): string {
  const d = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return `${APP_NAME.toLowerCase()}-sauvegarde-${d}.json`;
}

export async function toBackupFile(data: AppData, now: Date, appVersion: string): Promise<BackupFile> {
  const recipes: StoredRecipe[] = [];
  for (const r of data.recipes) {
    const { thumbnail, ...rest } = r;
    recipes.push(thumbnail ? { ...rest, thumbnail: await blobToDataUrl(thumbnail) } : rest);
  }
  const { apiKey: _never, ...settings } = data.settings as Settings;
  return {
    app: APP_NAME.toLowerCase(),
    format: BACKUP_FORMAT,
    exportedAt: now.toISOString(),
    appVersion,
    recipes,
    collections: data.collections,
    tags: [...new Set(data.recipes.flatMap((r) => r.tags))].sort((a, b) => a.localeCompare(b, 'fr')),
    pantry: data.pantry,
    settings,
    shopping: data.shopping,
  };
}

// ---------- Import ----------

export class InvalidBackup extends Error {}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function checkRecipe(r: unknown, i: number): StoredRecipe {
  if (!isObj(r) || typeof r.id !== 'string' || typeof r.title !== 'string' || !Array.isArray(r.ingredients) || !Array.isArray(r.steps))
    throw new InvalidBackup(`Recette n° ${i + 1} illisible.`);
  return {
    ...(r as unknown as StoredRecipe),
    tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
    collectionIds: Array.isArray(r.collectionIds) ? (r.collectionIds as string[]) : [],
    servings: typeof r.servings === 'number' && r.servings > 0 ? r.servings : 1,
    sourceType: r.sourceType === 'video' || r.sourceType === 'text' ? r.sourceType : 'manual',
    createdAt: typeof r.createdAt === 'number' ? r.createdAt : 0,
    updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : 0,
  };
}

/** Lit et valide un fichier de sauvegarde, et reconstruit les miniatures. */
export function parseBackup(text: string): AppData & { exportedAt: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new InvalidBackup('Ce fichier n\'est pas un fichier JSON valide.');
  }
  if (!isObj(raw) || raw.app !== APP_NAME.toLowerCase() || typeof raw.format !== 'number')
    throw new InvalidBackup(`Ce fichier n'est pas une sauvegarde ${APP_NAME}.`);
  if (raw.format > BACKUP_FORMAT) throw new InvalidBackup('Sauvegarde créée par une version plus récente de l\'appli : mets l\'appli à jour.');
  if (!Array.isArray(raw.recipes)) throw new InvalidBackup('Sauvegarde incomplète (recettes manquantes).');

  const recipes: Recipe[] = raw.recipes.map((r, i) => {
    const { thumbnail, ...rest } = checkRecipe(r, i);
    const blob = typeof thumbnail === 'string' ? dataUrlToBlob(thumbnail) : null;
    return blob ? { ...rest, thumbnail: blob } : rest;
  });
  const collections = Array.isArray(raw.collections)
    ? raw.collections.filter((c): c is Collection => isObj(c) && typeof c.id === 'string' && typeof c.name === 'string')
    : [];
  const pantry = Array.isArray(raw.pantry) ? raw.pantry.filter((p): p is PantryItem => isObj(p) && typeof p.name === 'string') : [];
  const settings = (isObj(raw.settings) ? raw.settings : {}) as Omit<Settings, 'apiKey'>;
  delete (settings as Partial<Settings>).apiKey;
  const shopping = { ...EMPTY_SHOPPING, ...(isObj(raw.shopping) ? (raw.shopping as Partial<ShoppingState>) : {}) };
  return { recipes, collections, pantry, settings, shopping, exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : '' };
}

export type ImportMode = 'remplacer' | 'fusionner';

/**
 * Remplacer : les données importées prennent la place des données actuelles (clé API conservée).
 * Fusionner : on ajoute ce qui manque ; pour une même recette, la version modifiée le plus récemment gagne ;
 * réglages et liste de courses actuels conservés.
 */
export function mergeData(current: AppData, incoming: AppData, mode: ImportMode): AppData {
  if (mode === 'remplacer') return { ...incoming, settings: { ...current.settings, ...incoming.settings } };

  const recipes = new Map(current.recipes.map((r) => [r.id, r]));
  for (const r of incoming.recipes) {
    const mine = recipes.get(r.id);
    if (!mine || r.updatedAt > mine.updatedAt) recipes.set(r.id, r);
  }
  const collections = new Map(current.collections.map((c) => [c.id, c]));
  for (const c of incoming.collections) if (!collections.has(c.id)) collections.set(c.id, c);
  const pantryNames = new Set(current.pantry.map((p) => p.name));
  const pantry = [...current.pantry, ...incoming.pantry.filter((p) => !pantryNames.has(p.name))];
  return { ...current, recipes: [...recipes.values()], collections: [...collections.values()], pantry };
}

// ---------- Rappel (F8) ----------

/** Rappel si aucune sauvegarde depuis 14 jours ou plus de 10 recettes ajoutées depuis la dernière. */
export function backupReminder(s: Settings, recipeCount: number, now: number): null | { reason: 'jours' | 'recettes'; count: number } {
  if (recipeCount === 0) return null;
  if (s.backupSnoozeUntil && now < s.backupSnoozeUntil) return null;
  if (s.recipesSinceBackup > 10) return { reason: 'recettes', count: s.recipesSinceBackup };
  const since = s.lastBackupAt ?? s.firstLaunchAt ?? now;
  if (now - since >= 14 * DAY) return { reason: 'jours', count: Math.floor((now - since) / DAY) };
  return null;
}
