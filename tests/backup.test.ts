import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  addToQueue, deleteQueueJob, exportAll, listQueue, loadPantry, loadSettings, loadShopping, markBackupDone, resetDbForTests,
  saveCollection, saveDishes, savePantry, saveStock, saveRecipe, saveSettings, saveShopping, updateQueueJob, writeAll, listRecipes, listCollections,
} from '../src/db/db';
import {
  backupFileName, backupReminder, blobToDataUrl, dataUrlToBlob, InvalidBackup, mergeData, parseBackup, toBackupFile, type AppData,
} from '../src/model/backup';
import { DEFAULT_SETTINGS, EMPTY_SHOPPING, QUEUE_MAX, queueJobBytes, type QueueJob, type Recipe } from '../src/model/types';

const store = new Map<string, string>();
globalThis.localStorage = {
  getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k),
} as Storage;

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 250, 0, 7]);
const recipe = (id: string, updatedAt: number, extra: Partial<Recipe> = {}): Recipe => ({
  id, title: `Recette ${id}`, servings: 2, tags: ['plat'], collectionIds: [], sourceType: 'manual', createdAt: 1, updatedAt,
  ingredients: [{ name: 'oignon', quantity: 1.5, unit: 'piece', aisle: 'fruits_legumes', note: 'émincé' }],
  steps: [{ text: 'Cuire 10 min.', timerSeconds: 600 }], ...extra,
});
const bytesOf = async (b?: Blob) => (b ? [...new Uint8Array(await b.arrayBuffer())] : null);

beforeEach(async () => {
  store.clear();
  await resetDbForTests();
});

describe('data URL', () => {
  it('fait l\'aller-retour d\'un Blob binaire', async () => {
    const url = await blobToDataUrl(new Blob([jpeg], { type: 'image/jpeg' }));
    expect(url.startsWith('data:image/jpeg;base64,')).toBe(true);
    const back = dataUrlToBlob(url)!;
    expect(back.type).toBe('image/jpeg');
    expect(await bytesOf(back)).toEqual([...jpeg]);
    expect(dataUrlToBlob('pas une url')).toBeNull();
  });
});

describe('export → import à l\'identique (critère J6)', () => {
  it('restaure recettes, miniatures, collections, garde-manger, réglages et courses, sans la clé API', async () => {
    await saveSettings({ ...(await loadSettings()), apiKey: 'SECRETE', model: 'gemini-3.5-flash-lite', defaultServings: 3 });
    await saveRecipe(recipe('a', 10, { thumbnail: new Blob([jpeg], { type: 'image/jpeg' }), collectionIds: ['c1'], sourceType: 'video', sourceUrl: 'https://x.y/z' }));
    await saveRecipe(recipe('b', 20));
    await saveCollection({ id: 'c1', name: 'Semaine' });
    await savePantry([{ name: 'sel' }, { name: 'riz' }]);
    await saveShopping({ ...EMPTY_SHOPPING, selections: [{ recipeId: 'a', servings: 4 }], checkedKeys: ['oignon|piece'] });

    await saveStock([{ id: 's1', name: 'riz', family: 'masse', base: 700, aisle: 'epicerie_salee', updatedAt: 1 }]);
    await saveDishes([{ id: 'd1', title: 'Chili', recipeId: 'a', portions: 3, place: 'congelateur', cookedAt: 1, expiresAt: 99 }]);
    const before = await exportAll();
    const file = await toBackupFile(before, new Date('2026-11-10T09:00:00Z'), '0.6.0');
    const json = JSON.stringify(file);
    expect(json).not.toContain('SECRETE');
    expect(file.tags).toEqual(['plat']);

    // Nouvel appareil : base vide, avec sa propre clé.
    await resetDbForTests();
    await saveSettings({ ...(await loadSettings()), apiKey: 'AUTRE' });
    const parsed = parseBackup(json);
    await writeAll(mergeData(await exportAll(), parsed, 'remplacer'));

    const after = await exportAll();
    const strip = (d: AppData) => ({ ...d, recipes: d.recipes.map(({ thumbnail: _t, ...r }) => r), settings: { ...d.settings, firstLaunchAt: 0 } });
    expect(strip(after)).toEqual(strip(before));
    const thumb = (await listRecipes()).find((r) => r.id === 'a')?.thumbnail;
    expect(await bytesOf(thumb)).toEqual([...jpeg]);
    expect(thumb?.type).toBe('image/jpeg');
    expect((await loadSettings()).apiKey).toBe('AUTRE');
  });

  it('nomme le fichier avec la date', () => {
    expect(backupFileName(new Date(2026, 0, 5))).toBe('carmy-sauvegarde-2026-01-05.json');
  });
});

describe('parseBackup', () => {
  it('refuse les fichiers invalides avec un message clair', () => {
    expect(() => parseBackup('{oups')).toThrow(InvalidBackup);
    expect(() => parseBackup('{"app":"autre","format":1,"recipes":[]}')).toThrow(/pas une sauvegarde Carmy/);
    expect(() => parseBackup('{"app":"carmy","format":99,"recipes":[]}')).toThrow(/plus récente/);
    expect(() => parseBackup('{"app":"carmy","format":1,"recipes":[{"id":"x"}]}')).toThrow(/Recette n° 1/);
  });
  it('ignore une clé API glissée dans le fichier', () => {
    const d = parseBackup(JSON.stringify({ app: 'carmy', format: 1, recipes: [], settings: { apiKey: 'X', model: 'm' } }));
    expect('apiKey' in d.settings).toBe(false);
  });
});

describe('fusion', () => {
  const base = (recipes: Recipe[], extra: Partial<AppData> = {}): AppData => ({
    recipes, collections: [], pantry: [], settings: { ...DEFAULT_SETTINGS, defaultServings: 1 }, shopping: EMPTY_SHOPPING, stock: [], dishes: [], planning: [], ...extra,
  });
  it('garde la version la plus récente de chaque recette et ajoute le reste', () => {
    const mine = base([recipe('a', 10, { title: 'mienne' }), recipe('b', 50, { title: 'b récente' })], {
      collections: [{ id: 'c1', name: 'Mienne' }], pantry: [{ name: 'sel' }],
    });
    const theirs = base([recipe('a', 30, { title: 'importée' }), recipe('b', 5), recipe('c', 1)], {
      collections: [{ id: 'c1', name: 'Autre nom' }, { id: 'c2', name: 'Nouvelle' }], pantry: [{ name: 'sel' }, { name: 'riz' }],
      settings: { ...DEFAULT_SETTINGS, defaultServings: 4 },
    });
    const m = mergeData(mine, theirs, 'fusionner');
    expect(m.recipes.map((r) => `${r.id}:${r.title}`).sort()).toEqual(['a:importée', 'b:b récente', 'c:Recette c']);
    expect(m.collections.map((c) => c.name)).toEqual(['Mienne', 'Nouvelle']);
    expect(m.pantry.map((p) => p.name)).toEqual(['sel', 'riz']);
    expect(m.settings.defaultServings).toBe(1);
    expect(mergeData(mine, theirs, 'remplacer').recipes).toHaveLength(3);
    expect(mergeData(mine, theirs, 'remplacer').settings.defaultServings).toBe(4);
  });
  it('fusionne la réserve sans doublon', () => {
    const item = (id: string, name: string, b: number) => ({ id, name, family: 'masse' as const, base: b, aisle: 'epicerie_salee' as const, updatedAt: 0 });
    const dish = (id: string) => ({ id, title: id, portions: 2, place: 'frigo' as const, cookedAt: 0, expiresAt: null });
    const m = mergeData(base([], { stock: [item('1', 'riz', 500)], dishes: [dish('d1')] }), base([], { stock: [item('2', 'riz', 900), item('3', 'pâtes', 500)], dishes: [dish('d1'), dish('d2')] }), 'fusionner');
    expect(m.stock.map((s) => `${s.name}:${s.base}`)).toEqual(['riz:500', 'pâtes:500']);
    expect(m.dishes.map((d) => d.id)).toEqual(['d1', 'd2']);
  });
});

describe('rappel de sauvegarde', () => {
  const DAY = 86_400_000;
  const s = { ...DEFAULT_SETTINGS, firstLaunchAt: 0 };
  it('se déclenche après 14 jours ou plus de 10 nouvelles recettes', () => {
    expect(backupReminder(s, 0, 30 * DAY)).toBeNull();
    expect(backupReminder(s, 3, 13 * DAY)).toBeNull();
    expect(backupReminder(s, 3, 14 * DAY)).toEqual({ reason: 'jours', count: 14 });
    expect(backupReminder({ ...s, lastBackupAt: 10 * DAY }, 3, 20 * DAY)).toBeNull();
    expect(backupReminder({ ...s, recipesSinceBackup: 11 }, 11, 1)).toEqual({ reason: 'recettes', count: 11 });
    expect(backupReminder({ ...s, recipesSinceBackup: 10 }, 10, 1)).toBeNull();
    expect(backupReminder({ ...s, backupSnoozeUntil: 40 * DAY }, 3, 30 * DAY)).toBeNull();
  });
  it('remet le compteur à zéro après un export', async () => {
    await saveRecipe(recipe('a', 1));
    expect((await loadSettings()).recipesSinceBackup).toBe(1);
    const s2 = await markBackupDone(123);
    expect(s2).toMatchObject({ lastBackupAt: 123, recipesSinceBackup: 0 });
  });
});

describe('file d\'attente', () => {
  const job = (id: string, createdAt: number): QueueJob => ({
    id, kind: 'video', blob: new Blob([jpeg], { type: 'video/mp4' }), status: 'error', error: 'Quota', attempts: 1, createdAt,
  });
  it('garde la vidéo, met à jour, supprime, et limite à 5', async () => {
    for (let i = 0; i < QUEUE_MAX; i++) expect(await addToQueue(job(`j${i}`, 10 - i))).toBe(true);
    expect(await addToQueue(job('trop', 0))).toBe(false);
    const q = await listQueue();
    expect(q.map((j) => j.id)).toEqual(['j4', 'j3', 'j2', 'j1', 'j0']);
    const first = q[0]!;
    expect(first.kind === 'video' && (await bytesOf(first.blob))).toEqual([...jpeg]);
    await updateQueueJob('j4', { attempts: 2, error: 'Réseau' });
    expect((await listQueue())[0]).toMatchObject({ attempts: 2, error: 'Réseau' });
    await deleteQueueJob('j4');
    expect(await listQueue()).toHaveLength(4);
  });
  it('garde aussi un lot de captures, dans l\'ordre', async () => {
    const a = new Blob([new Uint8Array([1])], { type: 'image/jpeg' });
    const b = new Blob([new Uint8Array([2, 3])], { type: 'image/jpeg' });
    await addToQueue({ id: 'img', kind: 'images', images: [a, b], status: 'error', attempts: 1, createdAt: 1 });
    const [got] = await listQueue();
    expect(got?.kind).toBe('images');
    if (got?.kind !== 'images') return;
    expect(await Promise.all(got.images.map(bytesOf))).toEqual([[1], [2, 3]]);
    expect(queueJobBytes(got)).toBe(3);
  });
  it('n\'est pas incluse dans la sauvegarde', async () => {
    await addToQueue(job('j', 1));
    expect(Object.keys(await exportAll()).sort()).toEqual(['collections', 'dishes', 'pantry', 'planning', 'recipes', 'settings', 'shopping', 'stock']);
    expect((await loadPantry()).length).toBeGreaterThan(0);
    expect(await loadShopping()).toEqual(EMPTY_SHOPPING);
    expect(await listCollections()).toEqual([]);
  });
});
