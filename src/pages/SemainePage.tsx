// Onglet Semaine (V2-J4) : planning midi/soir pour 1 personne à partir de la réserve, alertes, puis la réserve.
import { useEffect, useState } from 'preact/hooks';
import { listRecipes, loadDishes, loadPlanning, saveDishes, savePlanning } from '../db/db';
import {
  autoFill, availablePortions, dayKey, dayStart, MEAL_LABELS, MEALS, mealTime, planAlerts, prunePlan, slotKey, weekDays,
  type Meal, type PlanAlert, type PlannedMeal,
} from '../model/planning';
import { eatPortion, moveDish, sortDishes, type StoredDish } from '../model/stock';
import type { Recipe } from '../model/types';
import { ReserveSections } from './ReservePage';

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `m${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`);
const fmtDay = (key: string, opts: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'short' }) =>
  new Date(dayStart(key)).toLocaleDateString('fr-FR', opts);
const capitalize = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const fmtShort = (t: number) => new Date(t).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
const mealName = (p: Pick<PlannedMeal, 'day' | 'meal'>, today: string) =>
  `${p.day === today ? 'aujourd\'hui' : fmtDay(p.day, { weekday: 'long' })} ${p.meal === 'midi' ? 'midi' : 'soir'}`;

export function SemainePage({ onChanged }: { onChanged: () => void }) {
  const [dishes, setDishes] = useState<StoredDish[] | null>(null);
  const [plan, setPlan] = useState<PlannedMeal[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [offset, setOffset] = useState(0);
  const [slot, setSlot] = useState<{ day: string; meal: Meal } | null>(null);
  const [filled, setFilled] = useState<number | null>(null);
  const now = Date.now();
  const today = dayKey(now);

  useEffect(() => {
    void Promise.all([loadDishes(), loadPlanning(), listRecipes()]).then(([d, p, r]) => {
      const pruned = prunePlan(p, Date.now());
      if (pruned.length !== p.length) void savePlanning(pruned);
      setDishes(d);
      setPlan(pruned);
      setRecipes(r);
    });
  }, []);

  if (!dishes) return <main class="page" aria-busy="true" />;

  const save = (nextPlan: PlannedMeal[], nextDishes: StoredDish[] = dishes) => {
    setPlan(nextPlan);
    void savePlanning(nextPlan);
    if (nextDishes !== dishes) {
      setDishes(nextDishes);
      void saveDishes(nextDishes);
    }
    onChanged();
  };
  const updateDishes = (next: StoredDish[]) => {
    setDishes(next);
    void saveDishes(next).then(onChanged);
  };

  /** Repas mangé : une portion quitte la réserve. */
  const markEaten = (m: PlannedMeal) =>
    save(plan.map((p) => (p.id === m.id ? { ...p, eaten: true } : p)), m.dishId && dishes.some((d) => d.id === m.dishId) ? eatPortion(dishes, m.dishId) : dishes);
  const remove = (m: PlannedMeal) => save(plan.filter((p) => p.id !== m.id));
  const setMeal = (day: string, meal: Meal, entry: Omit<PlannedMeal, 'id' | 'day' | 'meal'> | null) => {
    const rest = plan.filter((p) => slotKey(p.day, p.meal) !== slotKey(day, meal));
    save(entry ? [...rest, { id: newId(), day, meal, ...entry }] : rest);
    setSlot(null);
  };

  const days = weekDays(now, offset);
  const bySlot = new Map(plan.map((p) => [slotKey(p.day, p.meal), p]));
  const alerts = planAlerts(plan, dishes, now);
  const free = dishes.reduce((n, d) => n + availablePortions(d, plan), 0);
  const upcoming = plan.filter((p) => !p.eaten && days.includes(p.day) && mealTime(p.day, p.meal) >= now);
  const emptySlots = days.flatMap((d) => MEALS.map((m) => ({ d, m }))).filter(({ d, m }) => mealTime(d, m) >= now && !bySlot.has(slotKey(d, m))).length;

  const fill = () => {
    const next = autoFill(plan, dishes, days, now, newId);
    setFilled(next.length - plan.length);
    save(next);
  };

  return (
    <main class="page stack">
      <header class="page-header">
        <h1>Semaine</h1>
      </header>

      {alerts.length > 0 && (
        <section class="card stack alerts" aria-label="Rappels">
          {alerts.map((a) => <AlertRow key={`${a.kind}-${a.meal.id}`} alert={a} today={today} dishes={dishes}
            onEaten={() => markEaten(a.meal)} onRemove={() => remove(a.meal)}
            onThaw={(dishId) => updateDishes(moveDish(dishes, dishId, 'frigo', null, Date.now()))} />)}
        </section>
      )}

      <section class="card stack">
        <div class="row between nowrap week-nav">
          <button type="button" class="icon-btn" aria-label="Semaine précédente" onClick={() => setOffset(offset - 1)}>‹</button>
          <h2 class="card-title center">
            {offset === 0 ? 'Cette semaine' : offset === 1 ? 'Semaine prochaine' : `Semaine du ${fmtDay(days[0]!, { day: 'numeric', month: 'short' })}`}
          </h2>
          <button type="button" class="icon-btn" aria-label="Semaine suivante" onClick={() => setOffset(offset + 1)}>›</button>
        </div>

        <ol class="week">
          {days.map((day) => {
            const past = dayStart(day) < dayStart(today);
            return (
              <li key={day} class={`week-day ${day === today ? 'today' : ''} ${past ? 'past' : ''}`}>
                <h3 class="week-day-title">{day === today ? `Aujourd'hui · ${fmtDay(day, { day: 'numeric', month: 'short' })}` : capitalize(fmtDay(day))}</h3>
                <div class="week-meals">
                  {MEALS.map((meal) => {
                    const p = bySlot.get(slotKey(day, meal));
                    const d = p?.dishId ? dishes.find((x) => x.id === p.dishId) : undefined;
                    const label = `${MEAL_LABELS[meal]} du ${fmtDay(day)}`;
                    return (
                      <button key={meal} type="button" class={`meal-slot ${p ? 'filled' : 'empty'} ${p?.eaten ? 'eaten' : ''}`}
                        aria-label={p ? `${label} : ${p.title}${p.eaten ? ', mangé' : ''}` : `${label} : rien de prévu, choisir un plat`}
                        onClick={() => setSlot({ day, meal })}>
                        <span class="meal-label">{MEAL_LABELS[meal]}</span>
                        {p ? (
                          <span class="meal-title">
                            {p.eaten ? '✓ ' : d?.place === 'congelateur' ? '❄️ ' : ''}{p.title}
                          </span>
                        ) : (
                          <span class="meal-title muted">{past ? '—' : '+ Choisir'}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ol>

        {filled !== null && <p class="ok small" role="status">{filled ? `${filled} repas ajouté${filled > 1 ? 's' : ''}.` : 'Aucun plat de la réserve ne convient aux repas libres.'}</p>}
        {emptySlots > 0 && free > 0 && (
          <button type="button" class="btn" onClick={fill}>✨ Remplir avec la réserve ({free} portion{free > 1 ? 's' : ''} libre{free > 1 ? 's' : ''})</button>
        )}
        {free === 0 && emptySlots > 0 && (
          <p class="muted small">Plus de portions libres en réserve : lance une <a href="#/batch">session de batch cooking</a>, ou choisis une recette ou un autre repas en touchant un créneau.</p>
        )}
        {upcoming.length > 0 && (
          <button type="button" class="btn ghost danger-text"
            onClick={() => { if (confirm('Retirer les repas à venir de cette semaine ? Les plats restent dans la réserve.')) save(plan.filter((p) => !upcoming.includes(p))); }}>
            Vider les repas à venir
          </button>
        )}
      </section>

      <ReserveSections dishes={dishes} recipes={recipes} plan={plan} onDishes={updateDishes} />

      {slot && (
        <SlotSheet
          day={slot.day}
          meal={slot.meal}
          current={bySlot.get(slotKey(slot.day, slot.meal))}
          dishes={dishes}
          plan={plan}
          recipes={recipes}
          canEat={mealTime(slot.day, slot.meal) - 3 * 3600e3 <= now}
          onClose={() => setSlot(null)}
          onSet={(entry) => setMeal(slot.day, slot.meal, entry)}
          onEaten={(m) => { markEaten(m); setSlot(null); }}
        />
      )}
    </main>
  );
}

function AlertRow({ alert, today, dishes, onEaten, onRemove, onThaw }: {
  alert: PlanAlert; today: string; dishes: StoredDish[]; onEaten: () => void; onRemove: () => void; onThaw: (dishId: string) => void;
}) {
  const m = alert.meal;
  const when = mealName(m, today);
  switch (alert.kind) {
    case 'a_confirmer':
      return (
        <div class="alert-row">
          <p>🍽️ As-tu mangé <strong>{m.title}</strong> ({when}) ?</p>
          <div class="row nowrap">
            <button type="button" class="btn small" onClick={onEaten}>✓ Oui</button>
            <button type="button" class="btn small ghost" onClick={onRemove}>Non</button>
          </div>
        </div>
      );
    case 'decongeler':
      return (
        <div class="alert-row">
          <p>❄️ <strong>{m.title}</strong> est prévu {when} : {alert.when === 'ce_soir' ? 'sors-le du congélateur ce soir pour le mettre au frigo.' : 'décongèle-le maintenant.'}</p>
          <button type="button" class="btn small secondary" onClick={() => m.dishId && onThaw(m.dishId)}>🧊 C'est fait (au frigo)</button>
        </div>
      );
    case 'perime': {
      const d = dishes.find((x) => x.id === m.dishId);
      return (
        <div class="alert-row warn">
          <p>⚠︎ <strong>{m.title}</strong> sera périmé avant {when}{d?.expiresAt ? ` (limite : ${fmtShort(d.expiresAt)})` : ''}. Mange-le plus tôt ou congèle-le.</p>
          <button type="button" class="btn small ghost" onClick={onRemove}>Retirer ce repas</button>
        </div>
      );
    }
    case 'manque':
      return (
        <div class="alert-row warn">
          <p>⚠︎ Plus assez de portions de <strong>{m.title}</strong> pour {when}.</p>
          <button type="button" class="btn small ghost" onClick={onRemove}>Retirer ce repas</button>
        </div>
      );
  }
}

function SlotSheet({ day, meal, current, dishes, plan, recipes, canEat, onClose, onSet, onEaten }: {
  day: string; meal: Meal; current?: PlannedMeal; dishes: StoredDish[]; plan: PlannedMeal[]; recipes: Recipe[]; canEat: boolean;
  onClose: () => void; onSet: (entry: Omit<PlannedMeal, 'id' | 'day' | 'meal'> | null) => void; onEaten: (m: PlannedMeal) => void;
}) {
  const [other, setOther] = useState('');
  const [recipeId, setRecipeId] = useState('');
  const options = sortDishes(dishes).filter((d) => availablePortions(d, plan) > 0 || d.id === current?.dishId);
  return (
    <div class="sheet-backdrop" onClick={onClose}>
      <section class="sheet" role="dialog" aria-modal="true" aria-label={`${MEAL_LABELS[meal]} du ${fmtDay(day)}`} onClick={(e) => e.stopPropagation()}>
        <div class="row between nowrap">
          <h2 class="card-title">{MEAL_LABELS[meal]} · {fmtDay(day)}</h2>
          <button type="button" class="cook-icon" aria-label="Fermer" onClick={onClose}>✕</button>
        </div>

        {current && (
          <div class="stack">
            <p><strong>{current.title}</strong>{current.eaten ? ' · mangé ✓' : ''}</p>
            {current.recipeId && <a href={`#/recette/${encodeURIComponent(current.recipeId)}`}>Voir la recette</a>}
            <div class="row">
              {!current.eaten && canEat && <button type="button" class="btn grow" onClick={() => onEaten(current)}>✓ Mangé</button>}
              <button type="button" class="btn ghost danger-text" onClick={() => onSet(null)}>Retirer du planning</button>
            </div>
            {!current.eaten && <h3 class="sheet-group">Remplacer par</h3>}
          </div>
        )}

        {!current?.eaten && (
          <>
            <h3 class="sheet-group">Dans la réserve</h3>
            {options.length === 0 ? (
              <p class="muted small">Aucune portion libre dans la réserve.</p>
            ) : (
              <ul class="list flush">
                {options.map((d) => (
                  <li key={d.id}>
                    <button type="button" class="slot-option" aria-pressed={d.id === current?.dishId}
                      onClick={() => onSet({ title: d.title, dishId: d.id, ...(d.recipeId ? { recipeId: d.recipeId } : {}) })}>
                      <span>{d.place === 'congelateur' ? '❄️' : '🧊'} {d.title}</span>
                      <span class="muted small">
                        {availablePortions(d, plan)} libre{availablePortions(d, plan) > 1 ? 's' : ''}
                        {d.expiresAt !== null && ` · ${d.place === 'frigo' ? 'avant' : 'jusqu\'au'} ${fmtShort(d.expiresAt)}`}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <h3 class="sheet-group">Une recette à cuisiner</h3>
            <div class="row nowrap">
              <select class="grow" aria-label="Recette à cuisiner" value={recipeId} onChange={(e) => setRecipeId(e.currentTarget.value)}>
                <option value="">— Choisir —</option>
                {recipes.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
              </select>
              <button type="button" class="btn small" disabled={!recipeId}
                onClick={() => { const r = recipes.find((x) => x.id === recipeId); if (r) onSet({ title: r.title, recipeId: r.id }); }}>OK</button>
            </div>

            <h3 class="sheet-group">Autre</h3>
            <div class="row nowrap">
              <input class="grow" type="text" aria-label="Autre repas" placeholder="Restaurant, repas improvisé…" value={other} onInput={(e) => setOther(e.currentTarget.value)} />
              <button type="button" class="btn small" disabled={!other.trim()} onClick={() => onSet({ title: other.trim() })}>OK</button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
