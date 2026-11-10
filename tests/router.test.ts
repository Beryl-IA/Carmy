import { describe, expect, it } from 'vitest';
import { parseHash, routeToHash, tabOf } from '../src/router';

describe('router', () => {
  it('lit les ancres', () => {
    expect(parseHash('')).toEqual({ name: 'recettes' });
    expect(parseHash('#/ajouter')).toEqual({ name: 'ajouter' });
    expect(parseHash('#/recette/a%20b')).toEqual({ name: 'recette', id: 'a b' });
    expect(parseHash('#/recette/')).toEqual({ name: 'recettes' });
    expect(parseHash('#/nimporte')).toEqual({ name: 'recettes' });
  });
  it('fait l\'aller-retour', () => {
    expect(parseHash(routeToHash({ name: 'recette', id: 'x/y' }))).toEqual({ name: 'recette', id: 'x/y' });
    expect(tabOf({ name: 'recette', id: 'x' })).toBe('recettes');
    expect(parseHash('#/modifier/abc')).toEqual({ name: 'modifier', id: 'abc' });
    expect(parseHash('#/collections')).toEqual({ name: 'collections' });
    expect(routeToHash({ name: 'modifier', id: 'a' })).toBe('#/modifier/a');
    expect(tabOf({ name: 'collections' })).toBe('recettes');
    expect(parseHash('#/aide')).toEqual({ name: 'aide' });
    expect(tabOf({ name: 'aide' })).toBe('reglages');
    expect(parseHash('#/cuisine/abc')).toEqual({ name: 'cuisine', id: 'abc' });
    expect(parseHash('#/cuisine/abc/2/4')).toEqual({ name: 'cuisine', id: 'abc', step: 2, servings: 4 });
    expect(parseHash('#/cuisine/abc/x/0')).toEqual({ name: 'cuisine', id: 'abc' });
    expect(routeToHash({ name: 'cuisine', id: 'a', step: 3 })).toBe('#/cuisine/a/3');
    expect(routeToHash({ name: 'cuisine', id: 'a', servings: 2 })).toBe('#/cuisine/a/0/2');
    expect(parseHash(routeToHash({ name: 'cuisine', id: 'a b', step: 1, servings: 3 }))).toEqual({ name: 'cuisine', id: 'a b', step: 1, servings: 3 });
  });
  it('gère la session de batch cooking', () => {
    expect(parseHash('#/batch')).toEqual({ name: 'batch' });
    expect(parseHash('#/batch/cuisine')).toEqual({ name: 'batch-cuisine' });
    expect(parseHash('#/batch/cuisine/3')).toEqual({ name: 'batch-cuisine', step: 3 });
    expect(routeToHash({ name: 'batch-cuisine', step: 2 })).toBe('#/batch/cuisine/2');
    expect(tabOf({ name: 'batch-cuisine' })).toBe('batch');
    expect(tabOf({ name: 'batch' })).toBe('batch');
  });
});
