import { describe, expect, it } from 'vitest';
import {
  InvalidBatchPlan, batchPayload, parseBatchPlan, planIsStale, resolveSelections, selectionKey, simplePlan, storageAdvice,
  type BatchSelection,
} from '../src/model/batch';
import type { Recipe } from '../src/model/types';

const recipe = (id: string, extra: Partial<Recipe> = {}): Recipe => ({
  id, title: id, servings: 4, tags: [], collectionIds: [], sourceType: 'manual', createdAt: 0, updatedAt: 0,
  ingredients: [{ name: 'riz', quantity: 400, unit: 'g', aisle: 'epicerie_salee' }],
  steps: [{ text: `${id} étape 1`, timerSeconds: null }, { text: `${id} étape 2`, timerSeconds: 600 }], ...extra,
});
const chili = recipe('chili', { cookMinutes: 60, storage: { fridgeDays: 4, freezerMonths: 3 } });
const salade = recipe('salade', { cookMinutes: 0, storage: { fridgeDays: 2, freezerMonths: 0 } });
const sel: BatchSelection[] = [{ recipeId: 'salade', servings: 2 }, { recipeId: 'chili', servings: 6 }];

describe('session de batch cooking', () => {
  it('met les ingrédients à l\'échelle et ignore une recette supprimée', () => {
    const items = resolveSelections([...sel, { recipeId: 'disparue', servings: 1 }], [chili, salade]);
    expect(items.map((i) => i.recipe.id)).toEqual(['salade', 'chili']);
    expect(items[1]?.ingredients[0]?.quantity).toBe(600);
  });
  it('déroulé simple : la plus longue cuisson d\'abord, puis le rangement', () => {
    const items = resolveSelections(sel, [chili, salade]);
    const plan = simplePlan(items, sel, 5);
    expect(plan.steps.map((s) => s.text)).toEqual(['chili étape 1', 'chili étape 2', 'salade étape 1', 'salade étape 2', expect.stringMatching(/boîtes hermétiques/)]);
    expect(plan.steps[0]?.recipes).toEqual([1]);
    expect(plan.steps[1]?.timerSeconds).toBe(600);
    expect(plan.steps.at(-1)?.recipes).toEqual([0, 1]);
    expect(plan.source).toBe('simple');
  });
  it('repère un déroulé qui ne correspond plus aux portions', () => {
    const items = resolveSelections(sel, [chili, salade]);
    const session = { id: 's', selections: sel, plan: simplePlan(items, sel, 0) };
    expect(planIsStale(session)).toBe(false);
    expect(planIsStale({ ...session, selections: [{ recipeId: 'salade', servings: 3 }, sel[1]!] })).toBe(true);
    expect(selectionKey(sel)).toBe('salade:2|chili:6');
  });
  it('envoie à l\'IA les quantités de la session et les minuteurs', () => {
    const p = batchPayload(resolveSelections(sel, [chili, salade]));
    expect(p[1]).toMatchObject({ index: 1, title: 'chili', servings: 6, ingredients: ['600 g riz'] });
    const q = batchPayload(resolveSelections([{ recipeId: 'o', servings: 2 }], [recipe('o', { ingredients: [{ name: 'oignon', quantity: 2, unit: 'piece', aisle: 'fruits_legumes', note: 'émincé' }] })]));
    expect(q[0]?.ingredients[0]).toBe("1 oignon (émincé)");
    expect(p[1]?.steps[1]).toMatch(/\[minuteur 10 min\]/);
  });
});

describe('réponse de l\'IA', () => {
  const ok = { totalMinutes: 95, steps: [
    { text: 'Lancer le chili', recipes: [1], timerSeconds: 3600 },
    { text: 'Préparer la salade', recipes: [0, 7, 0], timerSeconds: 0 },
    { text: '  ', recipes: [0], timerSeconds: null },
  ] };
  it('valide et nettoie le déroulé', () => {
    const plan = parseBatchPlan(JSON.stringify(ok), 2, sel, 9);
    expect(plan.steps).toEqual([
      { text: 'Lancer le chili', recipes: [1], timerSeconds: 3600 },
      { text: 'Préparer la salade', recipes: [0], timerSeconds: null },
    ]);
    expect(plan).toMatchObject({ totalMinutes: 95, source: 'ia', forKey: selectionKey(sel), createdAt: 9 });
  });
  it('refuse un déroulé qui oublie une recette ou qui est illisible', () => {
    expect(() => parseBatchPlan(JSON.stringify({ steps: [{ text: 'x', recipes: [0] }] }), 2, sel, 0)).toThrow(/n° 2 manque/);
    expect(() => parseBatchPlan('oups', 2, sel, 0)).toThrow(InvalidBatchPlan);
    expect(() => parseBatchPlan('{"steps":[]}', 2, sel, 0)).toThrow(InvalidBatchPlan);
  });
});

describe('récapitulatif de conservation', () => {
  it('calcule les dates limites', () => {
    const cooked = new Date(2026, 10, 10, 18).getTime();
    const [s, c] = storageAdvice(resolveSelections(sel, [chili, salade]), cooked);
    expect(s).toMatchObject({ title: 'salade', servings: 2, freezable: false, freezerUntil: null });
    expect(new Date(s!.fridgeUntil!).getDate()).toBe(12);
    expect(c?.freezable).toBe(true);
    expect(new Date(c!.freezerUntil!).getMonth()).toBe(1); // février
  });
  it('reste prudent sans données de conservation', () => {
    const [a] = storageAdvice(resolveSelections([{ recipeId: 'x', servings: 1 }], [recipe('x')]), 0);
    expect(a).toMatchObject({ fridgeUntil: null, freezerUntil: null, freezable: null });
  });
});
