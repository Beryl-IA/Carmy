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
  });
});
