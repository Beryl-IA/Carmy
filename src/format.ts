// Affichage (pur). La mise à l'échelle et l'arrondi fin des courses arrivent au jalon 5.
import type { Aisle, Unit } from './extraction/types';

export const UNIT_LABELS: Record<Exclude<Unit, null>, string> = {
  g: 'g', kg: 'kg', ml: 'ml', cl: 'cl', l: 'l', c_cafe: 'c. à café', c_soupe: 'c. à soupe',
  piece: '', pincee: 'pincée', gousse: 'gousse', tranche: 'tranche', sachet: 'sachet', boite: 'boîte', bouquet: 'bouquet',
};

export const AISLE_LABELS: Record<Aisle, string> = {
  fruits_legumes: 'Fruits et légumes', boucherie_poissonnerie: 'Boucherie, poissonnerie', cremerie_oeufs: 'Crèmerie, œufs',
  boulangerie: 'Boulangerie', epicerie_salee: 'Épicerie salée', epicerie_sucree: 'Épicerie sucrée', surgeles: 'Surgelés',
  boissons: 'Boissons', condiments_epices: 'Condiments, épices', autre: 'Autre',
};

const FRACTIONS: [number, string][] = [[0.25, '¼'], [1 / 3, '⅓'], [0.5, '½'], [2 / 3, '⅔'], [0.75, '¾']];

export function formatQuantity(q: number | null): string {
  if (q === null) return '';
  const whole = Math.floor(q);
  const frac = q - whole;
  if (frac > 0.01) {
    const f = FRACTIONS.find(([v]) => Math.abs(v - frac) < 0.02);
    if (f) return whole ? `${whole} ${f[1]}` : f[1];
  }
  return q.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
}

/** Pluriel simple des unités comptables (« 2 gousses »). */
export function formatUnit(unit: Unit, q: number | null): string {
  if (!unit) return '';
  const label = UNIT_LABELS[unit];
  if (!label) return '';
  const plural = q !== null && q >= 2 && ['pincee', 'gousse', 'tranche', 'sachet', 'boite', 'bouquet'].includes(unit);
  return plural ? `${label}s` : label;
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m >= 60) return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
  if (m && s) return `${m} min ${s} s`;
  return m ? `${m} min` : `${s} s`;
}

export function formatBytes(n: number): string {
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo` : `${Math.round(n / 1024)} Ko`;
}
