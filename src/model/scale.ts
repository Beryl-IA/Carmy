// Mise à l'échelle des portions (§9.1) — logique pure, réutilisée par la liste de courses (J5).
import type { Ingredient, Unit } from './types';

/** Unités comptées : arrondi au demi (au quart en dessous de 1). */
const COUNTABLE: Unit[] = [null, 'piece', 'gousse', 'tranche', 'sachet', 'boite', 'bouquet'];
/** Petites mesures : arrondi au quart (½ c. à soupe, ¼ c. à café). */
const SPOONS: Unit[] = ['c_cafe', 'c_soupe', 'pincee'];

const roundTo = (q: number, step: number) => Math.round(q / step) * step;

/** Arrondi « intelligent » pour l'affichage : jamais « 0,333 oignon ». Ne renvoie jamais 0 pour une quantité positive. */
export function roundQuantity(q: number, unit: Unit): number {
  if (q <= 0) return 0;
  let r: number;
  if (COUNTABLE.includes(unit)) r = q < 1 ? roundTo(q, 0.25) : roundTo(q, 0.5);
  else if (SPOONS.includes(unit)) r = roundTo(q, 0.25);
  else if (unit === 'g' || unit === 'ml') r = q < 10 ? roundTo(q, 0.5) : q < 100 ? Math.round(q) : roundTo(q, 5);
  else if (unit === 'cl') r = q < 10 ? roundTo(q, 0.5) : Math.round(q);
  else r = q < 1 ? roundTo(q, 0.05) : roundTo(q, 0.1); // kg, l
  // Évite les erreurs de virgule flottante et le zéro.
  r = Math.round(r * 1000) / 1000;
  return r > 0 ? r : COUNTABLE.includes(unit) || SPOONS.includes(unit) ? 0.25 : Math.round(q * 1000) / 1000;
}

/** quantité × (portions voulues ÷ portions de la fiche), arrondie. Les quantités null restent null. */
export function scaleQuantity(q: number | null, unit: Unit, baseServings: number, wanted: number): number | null {
  if (q === null) return null;
  if (!(baseServings > 0) || !(wanted > 0)) return q;
  if (baseServings === wanted) return q;
  return roundQuantity((q * wanted) / baseServings, unit);
}

export function scaleIngredients(ingredients: Ingredient[], baseServings: number, wanted: number): Ingredient[] {
  return ingredients.map((i) => ({ ...i, quantity: scaleQuantity(i.quantity, i.unit, baseServings, wanted) }));
}
