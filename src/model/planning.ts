// Planning de la semaine (V2-J4) — logique pure : midi et soir, 1 personne, à partir des plats de la réserve.
import { dishStatus, type StoredDish } from './stock';

export type Meal = 'midi' | 'soir';
export const MEALS: Meal[] = ['midi', 'soir'];
export const MEAL_LABELS: Record<Meal, string> = { midi: 'Midi', soir: 'Soir' };
/** Heure de référence de chaque repas (pour les dates limites et « à confirmer »). */
const MEAL_HOUR: Record<Meal, [number, number]> = { midi: [12, 30], soir: [19, 30] };
/** Un repas passé de 2 h est « à confirmer ». */
const CONFIRM_DELAY = 2 * 3600 * 1000;
/** Les repas confirmés de plus de 4 semaines sont oubliés. */
const KEEP_DAYS = 28;
const DAY = 24 * 3600 * 1000;

export interface PlannedMeal {
  id: string;
  /** Jour local « AAAA-MM-JJ ». */
  day: string;
  meal: Meal;
  title: string;
  /** Plat de la réserve (une portion lui sera retirée une fois mangé). */
  dishId?: string;
  recipeId?: string;
  eaten?: boolean;
}

export function dayKey(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function dayStart(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1).getTime();
}

export function mealTime(day: string, meal: Meal): number {
  const d = new Date(dayStart(day));
  d.setHours(...MEAL_HOUR[meal]);
  return d.getTime();
}

/** Les 7 jours (lundi → dimanche) de la semaine qui contient `t`, décalée de `offset` semaines. */
export function weekDays(t: number, offset = 0): string[] {
  const d = new Date(t);
  d.setHours(12, 0, 0, 0); // midi : évite les décalages au changement d'heure
  const monday = d.getTime() - ((d.getDay() + 6) % 7) * DAY + offset * 7 * DAY;
  return Array.from({ length: 7 }, (_, i) => dayKey(monday + i * DAY));
}

export const slotKey = (day: string, meal: Meal) => `${day}|${meal}`;

/** Portions d'un plat déjà prévues et pas encore mangées. */
export function plannedPortions(plan: PlannedMeal[], dishId: string): number {
  return plan.filter((p) => p.dishId === dishId && !p.eaten).length;
}

export function availablePortions(dish: StoredDish, plan: PlannedMeal[]): number {
  return Math.max(0, dish.portions - plannedPortions(plan, dish.id));
}

/** Un plat peut-il être servi à ce repas ? Frigo : pas périmé ; congélateur : à partir du lendemain (décongélation). */
export function canServe(dish: StoredDish, day: string, meal: Meal, now: number): boolean {
  const at = mealTime(day, meal);
  if (dish.place === 'frigo') return dish.expiresAt === null || dish.expiresAt >= dayStart(day);
  return dayStart(day) >= dayStart(dayKey(now)) + DAY && (dish.expiresAt === null || dish.expiresAt >= at);
}

/**
 * Remplit les repas libres à venir avec les portions disponibles : d'abord le frigo (ce qui périme
 * le plus tôt), puis le congélateur. Évite de servir le même plat deux repas de suite quand c'est possible.
 */
export function autoFill(plan: PlannedMeal[], dishes: StoredDish[], days: string[], now: number, makeId: () => string): PlannedMeal[] {
  const out = [...plan];
  const taken = new Set(out.map((p) => slotKey(p.day, p.meal)));
  const left = new Map(dishes.map((d) => [d.id, availablePortions(d, out)]));
  let previous: string | undefined;
  for (const day of days) {
    for (const meal of MEALS) {
      const key = slotKey(day, meal);
      const existing = out.find((p) => slotKey(p.day, p.meal) === key);
      if (existing) {
        previous = existing.dishId;
        continue;
      }
      if (mealTime(day, meal) < now || taken.has(key)) continue;
      const candidates = dishes
        .filter((d) => (left.get(d.id) ?? 0) > 0 && canServe(d, day, meal, now))
        .sort((a, b) => Number(a.place === 'congelateur') - Number(b.place === 'congelateur') || (a.expiresAt ?? Infinity) - (b.expiresAt ?? Infinity));
      const pick = candidates.find((d) => d.id !== previous) ?? candidates[0];
      previous = pick?.id;
      if (!pick) continue;
      left.set(pick.id, (left.get(pick.id) ?? 1) - 1);
      out.push({ id: makeId(), day, meal, title: pick.title, dishId: pick.id, ...(pick.recipeId ? { recipeId: pick.recipeId } : {}) });
    }
  }
  return out;
}

export type PlanAlert =
  | { kind: 'decongeler'; meal: PlannedMeal; when: 'ce_soir' | 'maintenant' }
  | { kind: 'perime'; meal: PlannedMeal }
  | { kind: 'manque'; meal: PlannedMeal }
  | { kind: 'a_confirmer'; meal: PlannedMeal };

/**
 * Alertes pour les repas prévus (non mangés) :
 * - plat congelé prévu demain → le sortir ce soir ; aujourd'hui → décongeler maintenant ;
 * - plat du frigo dont la date limite tombe avant le repas ;
 * - plus de repas prévus que de portions (les derniers sont signalés), ou plat retiré de la réserve ;
 * - repas passé, à confirmer (mangé ou non).
 */
export function planAlerts(plan: PlannedMeal[], dishes: StoredDish[], now: number): PlanAlert[] {
  const byId = new Map(dishes.map((d) => [d.id, d]));
  const alerts: PlanAlert[] = [];
  const pending = plan.filter((p) => !p.eaten).sort((a, b) => mealTime(a.day, a.meal) - mealTime(b.day, b.meal));
  const used = new Map<string, number>();
  const today = dayKey(now);
  const tomorrow = dayKey(dayStart(today) + DAY + 12 * 3600 * 1000);
  for (const p of pending) {
    // Un repas passé non confirmé occupe quand même une portion.
    const n = p.dishId ? (used.get(p.dishId) ?? 0) + 1 : 0;
    if (p.dishId) used.set(p.dishId, n);
    if (mealTime(p.day, p.meal) + CONFIRM_DELAY < now) {
      alerts.push({ kind: 'a_confirmer', meal: p });
      continue;
    }
    if (!p.dishId) continue;
    const d = byId.get(p.dishId);
    if (!d || n > d.portions) {
      alerts.push({ kind: 'manque', meal: p });
      continue;
    }
    if (d.place === 'congelateur') {
      if (p.day === tomorrow) alerts.push({ kind: 'decongeler', meal: p, when: 'ce_soir' });
      else if (p.day === today) alerts.push({ kind: 'decongeler', meal: p, when: 'maintenant' });
    } else if (d.expiresAt !== null && d.expiresAt < dayStart(p.day)) {
      alerts.push({ kind: 'perime', meal: p });
    }
  }
  return alerts;
}

/** Oublie les repas de plus de 4 semaines. */
export function prunePlan(plan: PlannedMeal[], now: number): PlannedMeal[] {
  const limit = dayStart(dayKey(now)) - KEEP_DAYS * DAY;
  return plan.filter((p) => dayStart(p.day) >= limit);
}

/** Pastille de l'onglet Semaine : plats urgents, plats à décongeler ce soir/maintenant, repas à confirmer. */
export function weekBadge(dishes: StoredDish[], plan: PlannedMeal[], now: number): number {
  const urgent = dishes.filter((d) => {
    const s = dishStatus(d, now);
    return s === 'perime' || (s === 'urgent' && d.place === 'frigo');
  }).length;
  const alerts = planAlerts(plan, dishes, now).filter((a) => a.kind === 'decongeler' || a.kind === 'a_confirmer').length;
  return urgent + alerts;
}
