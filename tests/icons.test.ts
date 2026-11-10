import { describe, expect, it } from 'vitest';
import { ingredientIcon } from '../src/model/icons';

describe('ingredientIcon', () => {
  it('reconnaît les ingrédients courants, avec accents et pluriels', () => {
    expect(ingredientIcon('oignons', 'fruits_legumes')).toBe('🧅');
    expect(ingredientIcon('Œuf', 'cremerie_oeufs')).toBe('🥚');
    expect(ingredientIcon('riz basmati', 'epicerie_salee')).toBe('🍚');
    expect(ingredientIcon('crème fraîche', 'cremerie_oeufs')).toBe('🥛');
    expect(ingredientIcon('noix', 'epicerie_salee')).toBe('🌰');
  });
  it('privilégie l\'expression précise', () => {
    expect(ingredientIcon('pomme de terre', 'fruits_legumes')).toBe('🥔');
    expect(ingredientIcon('pomme', 'fruits_legumes')).toBe('🍎');
    expect(ingredientIcon("huile d'olive", 'epicerie_salee')).toBe('🫒');
    expect(ingredientIcon('huile de tournesol', 'epicerie_salee')).toBe('🫗');
    expect(ingredientIcon('beurre de cacahuète', 'epicerie_sucree')).toBe('🥜');
    expect(ingredientIcon('lait de coco', 'epicerie_salee')).toBe('🥥');
  });
  it('ne confond pas les mots proches', () => {
    expect(ingredientIcon('poivre', 'condiments_epices')).toBe('🧂');
    expect(ingredientIcon('poivron rouge', 'fruits_legumes')).toBe('🫑');
    expect(ingredientIcon('ail', 'fruits_legumes')).toBe('🧄');
    expect(ingredientIcon('bouillon de volaille', 'epicerie_salee')).toBe('🍲');
  });
  it('se replie sur le rayon', () => {
    expect(ingredientIcon('za\'atar', 'condiments_epices')).toBe('🧂');
    expect(ingredientIcon('truc inconnu', 'autre')).toBe('🥄');
  });
});
