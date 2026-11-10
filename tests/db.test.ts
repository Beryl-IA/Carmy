import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  deleteCollection, deleteRecipe, getRecipe, listCollections, listRecipes, loadSettings, resetDbForTests, saveCollection, saveRecipe,
  saveSettings, setRecipeInCollection, loadShopping, saveShopping, addToShopping, loadPantry, savePantry,
} from '../src/db/db';
import type { Recipe } from '../src/model/types';

const recipe = (id: string, updatedAt: number): Recipe => ({
  id, title: `Recette ${id}`, servings: 2, tags: [], collectionIds: [], ingredients: [], steps: [],
  sourceType: 'manual', createdAt: updatedAt, updatedAt,
});

const store = new Map<string, string>();
globalThis.localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
} as Storage;

beforeEach(async () => {
  store.clear();
  await resetDbForTests();
});

describe('recettes', () => {
  it('enregistre, relit, trie par date de modification et supprime', async () => {
    await saveRecipe(recipe('a', 1));
    await saveRecipe(recipe('b', 3));
    await saveRecipe(recipe('c', 2));
    expect((await listRecipes()).map((r) => r.id)).toEqual(['b', 'c', 'a']);
    expect((await getRecipe('c'))?.title).toBe('Recette c');
    await deleteRecipe('c');
    expect(await getRecipe('c')).toBeUndefined();
  });

  it('compte les nouvelles recettes depuis la dernière sauvegarde, pas les modifications', async () => {
    await saveRecipe(recipe('a', 1));
    await saveRecipe({ ...recipe('a', 2), title: 'modifiée' });
    await saveRecipe(recipe('b', 3));
    expect((await loadSettings()).recipesSinceBackup).toBe(2);
  });
});

describe('réglages', () => {
  it('migre une fois les réglages du prototype J1', async () => {
    store.set('carmy.settings.v0', JSON.stringify({ apiKey: 'CLE', model: 'gemini-3.5-flash-lite', forceFilesApi: false, fastMode: false }));
    const s = await loadSettings();
    expect(s).toMatchObject({ apiKey: 'CLE', model: 'gemini-3.5-flash-lite', fastMode: false, defaultServings: 1 });
    expect(store.has('carmy.settings.v0')).toBe(false);
    await saveSettings({ ...s, defaultServings: 3 });
    expect((await loadSettings()).defaultServings).toBe(3);
  });

  it('ne perd pas le compteur quand on enregistre des réglages périmés', async () => {
    const s = await loadSettings();
    await saveRecipe(recipe('a', 1));
    await saveSettings({ ...s, model: 'x' });
    expect(await loadSettings()).toMatchObject({ model: 'x', recipesSinceBackup: 1 });
  });
});

describe('collections', () => {
  it('crée, renomme, trie, range une recette et supprime proprement', async () => {
    await saveCollection({ id: 'c2', name: 'Été' });
    await saveCollection({ id: 'c1', name: 'apéro' });
    await saveCollection({ id: 'c1', name: 'Apéro' });
    expect((await listCollections()).map((c) => c.name)).toEqual(['Apéro', 'Été']);
    await saveRecipe(recipe('a', 5));
    await setRecipeInCollection('a', 'c1', true);
    await setRecipeInCollection('a', 'c2', true);
    await setRecipeInCollection('a', 'c2', true);
    expect((await getRecipe('a'))?.collectionIds).toEqual(['c1', 'c2']);
    expect((await getRecipe('a'))?.updatedAt).toBe(5);
    await deleteCollection('c1');
    expect((await listCollections()).map((c) => c.id)).toEqual(['c2']);
    expect((await getRecipe('a'))?.collectionIds).toEqual(['c2']);
    await setRecipeInCollection('a', 'c2', false);
    expect((await getRecipe('a'))?.collectionIds).toEqual([]);
  });
});

describe('courses et garde-manger', () => {
  it('propose un garde-manger par défaut puis garde celui de l\'utilisateur', async () => {
    expect((await loadPantry()).map((p) => p.name)).toContain('sel');
    await savePantry([{ name: 'riz' }]);
    expect(await loadPantry()).toEqual([{ name: 'riz' }]);
  });
  it('ajoute une recette, met à jour ses portions et réinitialise les lignes retirées', async () => {
    expect((await loadShopping()).selections).toEqual([]);
    await saveShopping({ ...(await loadShopping()), removedKeys: ['x|masse'], checkedKeys: ['y|masse'] });
    expect(await addToShopping('a', 2)).toBe(false);
    expect(await loadShopping()).toMatchObject({ selections: [{ recipeId: 'a', servings: 2 }], removedKeys: [], checkedKeys: ['y|masse'] });
    expect(await addToShopping('a', 4)).toBe(true);
    expect((await loadShopping()).selections).toEqual([{ recipeId: 'a', servings: 4 }]);
  });
});
