import { describe, expect, it } from 'vitest';
import {
  autoFill, availablePortions, canServe, dayKey, mealTime, planAlerts, prunePlan, reservedProducts, weekBadge, weekDays, type PlannedMeal,
} from '../src/model/planning';
import type { StoredDish } from '../src/model/stock';

let n = 0;
const id = () => `p${n++}`;
const DAY = 864e5;
// Mardi 10 novembre 2026, 10 h.
const now = new Date(2026, 10, 10, 10).getTime();
const at = (d: number, h = 12) => new Date(2026, 10, d, h).getTime();
const dish = (id: string, extra: Partial<StoredDish> = {}): StoredDish => ({
  id, title: id, portions: 2, place: 'frigo', cookedAt: now, expiresAt: at(14), ...extra,
});

describe('semaine', () => {
  it('va du lundi au dimanche', () => {
    expect(weekDays(now)).toEqual(['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15']);
    expect(weekDays(at(15, 23))[0]).toBe('2026-11-09');
    expect(weekDays(now, 1)[0]).toBe('2026-11-16');
    expect(weekDays(now, -1)[6]).toBe('2026-11-08');
  });
  it('place les repas à midi et le soir', () => {
    expect(new Date(mealTime('2026-11-10', 'soir')).getHours()).toBe(19);
    expect(dayKey(now)).toBe('2026-11-10');
  });
});

describe('remplissage automatique', () => {
  it('sert d\'abord le frigo qui périme le plus tôt, alterne les plats, puis le congélateur', () => {
    const dishes = [
      dish('chili', { portions: 2, expiresAt: at(13) }),
      dish('curry', { portions: 2, expiresAt: at(12) }),
      dish('lasagnes', { portions: 3, place: 'congelateur', expiresAt: at(10) + 90 * DAY }),
    ];
    const plan = autoFill([], dishes, weekDays(now).slice(1, 5), now, id);
    expect(plan.map((p) => `${p.day.slice(8)} ${p.meal} ${p.title}`)).toEqual([
      '10 midi curry', '10 soir chili', '11 midi curry', '11 soir chili',
      '12 midi lasagnes', '12 soir lasagnes', '13 midi lasagnes',
    ]);
  });
  it('ne touche pas aux repas passés ni déjà prévus, et ne sert pas un plat périmé', () => {
    const existing: PlannedMeal[] = [{ id: 'x', day: '2026-11-10', meal: 'soir', title: 'Restaurant' }];
    const plan = autoFill(existing, [dish('soupe', { portions: 5, expiresAt: at(10) })], ['2026-11-09', '2026-11-10', '2026-11-11'], now, id);
    expect(plan.map((p) => `${p.day.slice(8)} ${p.meal} ${p.title}`)).toEqual(['10 soir Restaurant', '10 midi soupe']);
  });
  it('un plat congelé n\'est servi qu\'à partir du lendemain', () => {
    const d = dish('l', { place: 'congelateur', expiresAt: null });
    expect(canServe(d, '2026-11-10', 'soir', now)).toBe(false);
    expect(canServe(d, '2026-11-11', 'midi', now)).toBe(true);
  });
  it('compte les portions encore libres', () => {
    const d = dish('chili', { portions: 3 });
    expect(availablePortions(d, [
      { id: 'a', day: '2026-11-10', meal: 'soir', title: 'chili', dishId: 'chili' },
      { id: 'b', day: '2026-11-09', meal: 'soir', title: 'chili', dishId: 'chili', eaten: true },
    ])).toBe(2);
  });
});

describe('alertes', () => {
  it('rappelle de décongeler, signale les dates dépassées, les portions manquantes et les repas à confirmer', () => {
    const dishes = [
      dish('lasagnes', { place: 'congelateur', expiresAt: null }),
      dish('soupe', { portions: 1, expiresAt: at(11) }),
    ];
    const plan: PlannedMeal[] = [
      { id: '1', day: '2026-11-11', meal: 'midi', title: 'lasagnes', dishId: 'lasagnes' },
      { id: '2', day: '2026-11-10', meal: 'soir', title: 'lasagnes', dishId: 'lasagnes' },
      { id: '3', day: '2026-11-12', meal: 'soir', title: 'soupe', dishId: 'soupe' },
      { id: '4', day: '2026-11-13', meal: 'soir', title: 'soupe', dishId: 'soupe' },
      { id: '5', day: '2026-11-09', meal: 'soir', title: 'Pâtes', eaten: false },
      { id: '6', day: '2026-11-09', meal: 'midi', title: 'Pâtes', eaten: true },
    ];
    expect(planAlerts(plan, dishes, now).map((a) => `${a.kind}:${a.meal.id}${'when' in a ? `:${a.when}` : ''}`)).toEqual([
      'a_confirmer:5', 'decongeler:2:maintenant', 'decongeler:1:ce_soir', 'perime:3', 'manque:4',
    ]);
    expect(weekBadge(dishes, plan, now)).toBe(3); // à confirmer + 2 à décongeler (les plats urgents sont comptés sur l'onglet Stock)
  });
  it('repas simples : produits réservés tant que le repas n\'est pas mangé ; repas en mode Toulouse ignorés', () => {
    const prod = (stockId: string) => ({ stockId, name: stockId, quantity: 1, unit: 'boite' as const, aisle: 'epicerie_salee' as const });
    const meals: PlannedMeal[] = [
      { id: 'a', day: '2026-11-12', meal: 'midi', title: 'Steak + haricots', products: [prod('steak'), prod('haricots')] },
      { id: 'b', day: '2026-11-12', meal: 'soir', title: 'Thon', products: [prod('thon')], eaten: true },
      { id: 'c', day: '2026-11-01', meal: 'midi', title: 'Cantine', away: true },
    ];
    expect(reservedProducts(meals).map((p) => p.stockId)).toEqual(['steak', 'haricots']);
    // Le repas passé pris à Toulouse ne demande aucune confirmation.
    expect(planAlerts(meals, [], new Date(2026, 10, 10, 12).getTime())).toEqual([]);
  });
  it('oublie les repas de plus de 4 semaines', () => {
    expect(prunePlan([{ id: 'a', day: '2026-10-01', meal: 'midi', title: 'x' }, { id: 'b', day: '2026-11-01', meal: 'midi', title: 'y' }], now).map((p) => p.id)).toEqual(['b']);
  });
});
