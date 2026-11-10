import { describe, expect, it } from 'vitest';
import { geminiImageMime } from '../src/extraction/gemini';
import { userPromptImages } from '../src/extraction/prompt';
import { fitWithin, thumbnailCrop } from '../src/media/image';
import { parseBackup } from '../src/model/backup';

describe('captures d\'écran : dimensions', () => {
  it('réduit une capture d\'iPhone 13 à 2048 px de haut, sans déformer', () => {
    expect(fitWithin(1170, 2532, 2048)).toEqual({ width: 946, height: 2048 });
  });
  it('n\'agrandit jamais une petite image', () => {
    expect(fitWithin(800, 600, 2048)).toEqual({ width: 800, height: 600 });
  });
  it('gère une image vide', () => {
    expect(fitWithin(0, 100, 2048)).toEqual({ width: 0, height: 0 });
  });
});

describe('captures d\'écran : miniature', () => {
  it('garde le haut d\'une capture verticale au format 4:5, sous la barre d\'état', () => {
    const c = thumbnailCrop(1170, 2532);
    expect(c).toEqual({ sx: 0, sy: 152, sw: 1170, sh: 1463 });
    expect(c.sw / c.sh).toBeCloseTo(4 / 5, 2);
  });
  it('recadre au centre une image large', () => {
    const c = thumbnailCrop(2000, 1000);
    expect(c).toEqual({ sx: 600, sy: 0, sw: 800, sh: 1000 });
  });
  it('ne déborde pas d\'une image presque 4:5', () => {
    const c = thumbnailCrop(800, 1020);
    expect(c.sy + c.sh).toBeLessThanOrEqual(1020);
  });
});

describe('captures d\'écran : envoi à l\'IA', () => {
  it('annonce le nombre de captures et demande une seule recette', () => {
    expect(userPromptImages(3)).toMatch(/3 captures/);
    expect(userPromptImages(3)).toMatch(/UNE SEULE recette/);
    expect(userPromptImages(1)).toMatch(/cette capture/);
  });
  it('choisit un type d\'image accepté par Gemini', () => {
    expect(geminiImageMime(new Blob([], { type: 'image/png' }))).toBe('image/png');
    expect(geminiImageMime(new Blob([], { type: 'image/heic' }))).toBe('image/heic');
    expect(geminiImageMime(new Blob([], { type: '' }))).toBe('image/jpeg');
  });
  it('restaure une recette issue de captures avec sa source', () => {
    const data = parseBackup(JSON.stringify({
      app: 'carmy', format: 1, exportedAt: '2026-11-10',
      recipes: [{ id: 'a', title: 'Riz', servings: 1, ingredients: [], steps: [], sourceType: 'image', createdAt: 1, updatedAt: 1 }],
    }));
    expect(data.recipes[0]?.sourceType).toBe('image');
  });
});
