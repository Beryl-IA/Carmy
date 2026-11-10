// Stockage local IndexedDB (via `idb`). Aucune donnée ne quitte l'appareil.
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import {
  DEFAULT_PANTRY, DEFAULT_SETTINGS, EMPTY_SHOPPING, QUEUE_MAX, type Collection, type PantryItem, type QueueJob, type QueueJobPatch, type Recipe, type Settings,
  type ShoppingState,
} from '../model/types';
import type { AppData } from '../model/backup';
import type { BatchSession } from '../model/batch';

const DB_NAME = 'carmy';
const DB_VERSION = 1;

interface CarmyDB extends DBSchema {
  recipes: { key: string; value: Recipe; indexes: { updatedAt: number } };
  collections: { key: string; value: Collection };
  /** Petits objets uniques : réglages, état des courses, garde-manger… */
  kv: { key: string; value: unknown };
  /** File d'attente d'extraction (jalon 6), créée dès maintenant pour éviter une migration. */
  queue: { key: string; value: QueueJob };
}

let dbPromise: Promise<IDBPDatabase<CarmyDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<CarmyDB>> {
  dbPromise ??= openDB<CarmyDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        const recipes = db.createObjectStore('recipes', { keyPath: 'id' });
        recipes.createIndex('updatedAt', 'updatedAt');
        db.createObjectStore('collections', { keyPath: 'id' });
        db.createObjectStore('kv');
        db.createObjectStore('queue', { keyPath: 'id' });
      }
    },
  });
  return dbPromise;
}

/** Réservé aux tests. */
export async function resetDbForTests(): Promise<void> {
  if (dbPromise) (await dbPromise).close();
  dbPromise = null;
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ---------- Recettes ----------

/** Toutes les recettes, de la plus récemment modifiée à la plus ancienne. */
export async function listRecipes(): Promise<Recipe[]> {
  const all = await (await getDb()).getAllFromIndex('recipes', 'updatedAt');
  return all.reverse();
}

export async function getRecipe(id: string): Promise<Recipe | undefined> {
  return (await getDb()).get('recipes', id);
}

/**
 * Enregistre (création ou modification). Une nouvelle recette incrémente le compteur
 * utilisé par le rappel de sauvegarde (F8).
 */
export async function saveRecipe(recipe: Recipe): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['recipes', 'kv'], 'readwrite');
  const existing = await tx.objectStore('recipes').get(recipe.id);
  await tx.objectStore('recipes').put(recipe);
  if (!existing) {
    const s = { ...DEFAULT_SETTINGS, ...((await tx.objectStore('kv').get(SETTINGS_KEY)) as Partial<Settings> | undefined) };
    await tx.objectStore('kv').put({ ...s, recipesSinceBackup: s.recipesSinceBackup + 1 }, SETTINGS_KEY);
  }
  await tx.done;
}

export async function deleteRecipe(id: string): Promise<void> {
  await (await getDb()).delete('recipes', id);
}

// ---------- Collections ----------

export async function listCollections(): Promise<Collection[]> {
  const all = await (await getDb()).getAll('collections');
  return all.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

/** Création ou renommage. */
export async function saveCollection(c: Collection): Promise<void> {
  await (await getDb()).put('collections', c);
}

/** Supprime la collection et la retire des recettes (les recettes, elles, sont conservées). */
export async function deleteCollection(id: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['collections', 'recipes'], 'readwrite');
  await tx.objectStore('collections').delete(id);
  let cursor = await tx.objectStore('recipes').openCursor();
  while (cursor) {
    if (cursor.value.collectionIds.includes(id))
      await cursor.update({ ...cursor.value, collectionIds: cursor.value.collectionIds.filter((x) => x !== id) });
    cursor = await cursor.continue();
  }
  await tx.done;
}

/** Ajoute ou retire une recette d'une collection, sans toucher à sa date de modification. */
export async function setRecipeInCollection(recipeId: string, collectionId: string, inside: boolean): Promise<Recipe | undefined> {
  const db = await getDb();
  const tx = db.transaction('recipes', 'readwrite');
  const r = await tx.store.get(recipeId);
  if (r) {
    const ids = r.collectionIds.filter((x) => x !== collectionId);
    if (inside) ids.push(collectionId);
    r.collectionIds = ids;
    await tx.store.put(r);
  }
  await tx.done;
  return r;
}

// ---------- Réglages ----------

const SETTINGS_KEY = 'settings';
/** Réglages du prototype J1 (localStorage), migrés une seule fois. */
const LEGACY_KEY = 'carmy.settings.v0';

export async function loadSettings(): Promise<Settings> {
  const db = await getDb();
  const stored = (await db.get('kv', SETTINGS_KEY)) as Partial<Settings> | undefined;
  if (stored) {
    // Réglages antérieurs au jalon 6 : la date de premier lancement sert au rappel de sauvegarde.
    if (!stored.firstLaunchAt) {
      stored.firstLaunchAt = Date.now();
      await db.put('kv', stored, SETTINGS_KEY);
    }
    return { ...DEFAULT_SETTINGS, ...stored };
  }

  let migrated: Settings = { ...DEFAULT_SETTINGS, firstLaunchAt: Date.now() };
  try {
    const raw = globalThis.localStorage?.getItem(LEGACY_KEY);
    if (raw) {
      const old = JSON.parse(raw) as Partial<Settings> & { apiKey?: string };
      migrated = {
        ...migrated,
        ...(old.apiKey ? { apiKey: old.apiKey } : {}),
        ...(old.model ? { model: old.model } : {}),
        ...(typeof old.fastMode === 'boolean' ? { fastMode: old.fastMode } : {}),
        ...(typeof old.forceFilesApi === 'boolean' ? { forceFilesApi: old.forceFilesApi } : {}),
      };
    }
  } catch { /* localStorage indisponible : réglages par défaut */ }
  await db.put('kv', migrated, SETTINGS_KEY);
  try {
    globalThis.localStorage?.removeItem(LEGACY_KEY);
  } catch { /* ignore */ }
  return migrated;
}

export async function saveSettings(settings: Settings): Promise<void> {
  // On relit le compteur pour ne pas écraser une incrémentation faite par saveRecipe.
  const db = await getDb();
  const tx = db.transaction('kv', 'readwrite');
  const current = (await tx.store.get(SETTINGS_KEY)) as Partial<Settings> | undefined;
  await tx.store.put({ ...settings, recipesSinceBackup: current?.recipesSinceBackup ?? settings.recipesSinceBackup }, SETTINGS_KEY);
  await tx.done;
}

// ---------- Liste de courses et garde-manger (F6) ----------

const SHOPPING_KEY = 'shopping';
const PANTRY_KEY = 'pantry';

export async function loadShopping(): Promise<ShoppingState> {
  const s = (await (await getDb()).get('kv', SHOPPING_KEY)) as Partial<ShoppingState> | undefined;
  return { ...EMPTY_SHOPPING, ...s };
}

export async function saveShopping(state: ShoppingState): Promise<void> {
  await (await getDb()).put('kv', state, SHOPPING_KEY);
}

/** Garde-manger ; la liste par défaut est proposée au premier lancement. */
export async function loadPantry(): Promise<PantryItem[]> {
  const p = (await (await getDb()).get('kv', PANTRY_KEY)) as PantryItem[] | undefined;
  return p ?? DEFAULT_PANTRY;
}

export async function savePantry(items: PantryItem[]): Promise<void> {
  await (await getDb()).put('kv', items, PANTRY_KEY);
}

/** Ajoute une recette à la liste (ou met à jour ses portions). Renvoie true si elle y était déjà. */
export async function addToShopping(recipeId: string, servings: number): Promise<boolean> {
  const s = await loadShopping();
  const existing = s.selections.find((x) => x.recipeId === recipeId);
  const selections = existing
    ? s.selections.map((x) => (x.recipeId === recipeId ? { ...x, servings } : x))
    : [...s.selections, { recipeId, servings }];
  // Nouvelle recette = nouvelles courses : les lignes retirées réapparaissent.
  await saveShopping({ ...s, selections, removedKeys: existing ? s.removedKeys : [] });
  return Boolean(existing);
}

// ---------- Session de batch cooking (V2-J2b) ----------

const BATCH_KEY = 'batch';

/** Session en cours (une seule à la fois). */
export async function loadBatch(): Promise<BatchSession | null> {
  return ((await (await getDb()).get('kv', BATCH_KEY)) as BatchSession | undefined) ?? null;
}

export async function saveBatch(session: BatchSession | null): Promise<void> {
  const db = await getDb();
  if (session) await db.put('kv', session, BATCH_KEY);
  else await db.delete('kv', BATCH_KEY);
}

// ---------- File d'attente d'extraction (F7) ----------

export async function listQueue(): Promise<QueueJob[]> {
  const all = await (await getDb()).getAll('queue');
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

/** Ajoute une vidéo ou un lot de captures à la file. Renvoie false si la file est pleine (QUEUE_MAX). */
export async function addToQueue(job: QueueJob): Promise<boolean> {
  const db = await getDb();
  const tx = db.transaction('queue', 'readwrite');
  if ((await tx.store.count()) >= QUEUE_MAX) {
    await tx.done;
    return false;
  }
  await tx.store.put(job);
  await tx.done;
  return true;
}

export async function updateQueueJob(id: string, patch: QueueJobPatch): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('queue', 'readwrite');
  const job = await tx.store.get(id);
  if (job) await tx.store.put({ ...job, ...patch });
  await tx.done;
}

export async function deleteQueueJob(id: string): Promise<void> {
  await (await getDb()).delete('queue', id);
}

// ---------- Export / import (F8) ----------

export async function exportAll(): Promise<AppData> {
  const [recipes, collections, pantry, settings, shopping] = await Promise.all([
    listRecipes(), listCollections(), loadPantry(), loadSettings(), loadShopping(),
  ]);
  const { apiKey: _secret, ...safe } = settings;
  return { recipes, collections, pantry, settings: safe, shopping };
}

/** Remplace toutes les données (recettes, collections, garde-manger, réglages hors clé, courses). */
export async function writeAll(data: AppData): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['recipes', 'collections', 'kv'], 'readwrite');
  const current = (await tx.objectStore('kv').get(SETTINGS_KEY)) as Partial<Settings> | undefined;
  await tx.objectStore('recipes').clear();
  for (const r of data.recipes) await tx.objectStore('recipes').put(r);
  await tx.objectStore('collections').clear();
  for (const c of data.collections) await tx.objectStore('collections').put(c);
  await tx.objectStore('kv').put(data.pantry, PANTRY_KEY);
  await tx.objectStore('kv').put(data.shopping, SHOPPING_KEY);
  // La clé API n'est jamais dans une sauvegarde : on garde celle de l'appareil.
  await tx.objectStore('kv').put({ ...DEFAULT_SETTINGS, ...data.settings, ...(current?.apiKey ? { apiKey: current.apiKey } : {}) }, SETTINGS_KEY);
  await tx.done;
}

/** Après un export réussi : remet à zéro le compteur du rappel. */
export async function markBackupDone(at: number): Promise<Settings> {
  const s = await loadSettings();
  const next: Settings = { ...s, lastBackupAt: at, recipesSinceBackup: 0 };
  delete next.backupSnoozeUntil;
  const db = await getDb();
  await db.put('kv', next, SETTINGS_KEY);
  return next;
}

// ---------- Persistance du stockage (F8) ----------

/** Demande au navigateur de ne pas purger les données. Renvoie l'état final. */
export async function requestPersistence(): Promise<boolean | null> {
  if (!navigator.storage?.persist) return null;
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}
