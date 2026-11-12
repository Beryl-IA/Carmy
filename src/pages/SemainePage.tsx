// Onglet Semaine (V2-J4) : planning midi/soir pour 1 personne à partir du stock, alertes.
// 1.6.0 : repas simples (produits du stock, retirés une fois le repas mangé) et mode Toulouse.
import { useEffect, useState } from 'preact/hooks';
import { listRecipes, loadDishes, loadPlanning, loadStock, saveDishes, savePlanning, saveStock } from '../db/db';
import { ToulouseSwitch } from '../components/ToulouseSwitch';
import { formatQuantity, formatUnit } from '../format';
import { numberToInput, parseQuantity } from '../model/draft';
import { ingredientIcon } from '../model/icons';
import { displayQuantity } from '../model/shopping';
import {
  autoFill, availablePortions, dayKey, dayStart, MEAL_LABELS, MEALS, mealTime, planAlerts, prunePlan, reservedProducts, slotKey, weekDays,
  type Meal, type PlanAlert, type PlannedMeal,
} from '../model/planning';
import { consumeProducts, eatPortion, moveDish, reservedOf, sortDishes, stockDisplay, type MealProduct, type StockItem, type StoredDish } from '../model/stock';
import type { Recipe, Settings, Unit } from '../model/types';

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `m${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`);
const fmtDay = (key: string, opts: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'short' }) =>
  new Date(dayStart(key)).toLocaleDateString('fr-FR', opts);
const capitalize = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const fmtShort = (t: number) => new Date(t).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
const qty = (q: { quantity: number | null; unit: Unit }) => [formatQuantity(q.quantity), formatUnit(q.unit, q.quantity)].filter(Boolean).join(' ');
const productText = (p: MealProduct) => (p.quantity === null ? p.name : `${qty(p)} · ${p.name}`);
const mealName = (p: Pick<PlannedMeal, 'day' | 'meal'>, today: string) =>
  `${p.day === today ? 'aujourd\'hui' : fmtDay(p.day, { weekday: 'long' })} ${p.meal === 'midi' ? 'midi' : 'soir'}`;

export function SemainePage({ onChanged, settings, onSettings }: { onChanged: () => void; settings: Settings; onSettings: (s: Settings) => void }) {
  const toulouse = Boolean(settings.toulouse);
  const [stock, setStock] = useState<StockItem[]>([]);
  const [dishes, setDishes] = useState<StoredDish[] | null>(null);
  const [plan, setPlan] = useState<PlannedMeal[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [offset, setOffset] = useState(0);
  const [slot, setSlot] = useState<{ day: string; meal: Meal } | null>(null);
  const [filled, setFilled] = useState<number | null>(null);
  const now = Date.now();
  const today = dayKey(now);

  useEffect(() => {
    void Promise.all([loadDishes(), loadPlanning(), listRecipes(), loadStock()]).then(([d, p, r, st]) => {
      setStock(st);
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

  /** Repas mangé : la portion du plat ou les produits du repas simple quittent le stock (sauf en mode Toulouse). */
  const markEaten = (m: PlannedMeal) => {
    const affects = !toulouse && !m.away;
    if (affects && m.products?.length) {
      const next = consumeProducts(stock, m.products, Date.now());
      setStock(next);
      void saveStock(next);
    }
    // Mangé en déplacement : le repas ne retient plus de portion ni de produits à la maison.
    const { dishId: _dish, products: _products, ...rest } = m;
    save(plan.map((p) => (p.id === m.id ? (affects ? { ...p, eaten: true } : { ...rest, eaten: true, away: true }) : p)),
      affects && m.dishId && dishes.some((d) => d.id === m.dishId) ? eatPortion(dishes, m.dishId) : dishes);
  };
  const remove = (m: PlannedMeal) => save(plan.filter((p) => p.id !== m.id));
  const setMeal = (day: string, meal: Meal, entry: Omit<PlannedMeal, 'id' | 'day' | 'meal'> | null) => {
    const rest = plan.filter((p) => slotKey(p.day, p.meal) !== slotKey(day, meal));
    save(entry ? [...rest, { id: newId(), day, meal, ...entry, ...(toulouse ? { away: true } : {}) }] : rest);
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
        <a class="btn small secondary header-action" href="#/stock">Stock</a>
      </header>

      <ToulouseSwitch banner settings={settings} onChange={onSettings} />

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
                            {p.eaten ? '✓ ' : p.away ? '📍 ' : d?.place === 'congelateur' ? '❄️ ' : ''}{p.title}
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

        {filled !== null && <p class="ok small" role="status">{filled ? `${filled} repas ajouté${filled > 1 ? 's' : ''}.` : 'Aucun plat du stock ne convient aux repas libres.'}</p>}
        {emptySlots > 0 && free > 0 && !toulouse && (
          <button type="button" class="btn" onClick={fill}>✨ Remplir avec le stock ({free} portion{free > 1 ? 's' : ''} libre{free > 1 ? 's' : ''})</button>
        )}
        {free === 0 && emptySlots > 0 && !toulouse && (
          <p class="muted small">Plus de portions de plats cuisinés en stock : lance une <a href="#/batch">session de batch cooking</a>, ou touche un créneau pour choisir une recette ou composer un repas simple avec tes produits.</p>
        )}
        {upcoming.length > 0 && (
          <button type="button" class="btn ghost danger-text"
            onClick={() => { if (confirm('Retirer les repas à venir de cette semaine ? Les plats et les produits restent en stock.')) save(plan.filter((p) => !upcoming.includes(p))); }}>
            Vider les repas à venir
          </button>
        )}
      </section>

      {slot && (
        <SlotSheet
          day={slot.day}
          meal={slot.meal}
          current={bySlot.get(slotKey(slot.day, slot.meal))}
          dishes={dishes}
          plan={plan}
          stock={stock}
          toulouse={toulouse}
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

function SlotSheet({ day, meal, current, dishes, plan, stock, toulouse, recipes, canEat, onClose, onSet, onEaten }: {
  day: string; meal: Meal; current?: PlannedMeal; dishes: StoredDish[]; plan: PlannedMeal[]; stock: StockItem[]; toulouse: boolean; recipes: Recipe[]; canEat: boolean;
  onClose: () => void; onSet: (entry: Omit<PlannedMeal, 'id' | 'day' | 'meal'> | null) => void; onEaten: (m: PlannedMeal) => void;
}) {
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
            <p><strong>{current.title}</strong>{current.eaten ? ' · mangé ✓' : ''}{current.away ? ' · 📍 Toulouse' : ''}</p>
            {current.products && current.products.length > 0 && (
              <p class="muted small">
                {current.eaten ? 'Retiré du stock' : 'Sera retiré du stock une fois mangé'} : {current.products.map(productText).join(', ')}.
              </p>
            )}
            {current.recipeId && <a href={`#/recette/${encodeURIComponent(current.recipeId)}`}>Voir la recette</a>}
            <div class="row">
              {!current.eaten && canEat && <button type="button" class="btn grow" onClick={() => onEaten(current)}>✓ Mangé</button>}
              <button type="button" class="btn ghost danger-text" onClick={() => onSet(null)}>Retirer du planning</button>
            </div>
            {!current.eaten && <h3 class="sheet-group">Remplacer par</h3>}
          </div>
        )}

        {!current?.eaten && toulouse && (
          <p class="muted small">📍 Mode Toulouse : ce repas ne touchera pas au stock.</p>
        )}
        {!current?.eaten && (
          <>
            {!toulouse && <h3 class="sheet-group">Plats cuisinés en stock</h3>}
            {toulouse ? null : options.length === 0 ? (
              <p class="muted small">Aucune portion de plat cuisiné libre.</p>
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

            <h3 class="sheet-group">Repas simple</h3>
            <SimpleMealForm stock={toulouse ? [] : stock} toulouse={toulouse} current={current}
              reserved={reservedProducts(plan.filter((p) => p.id !== current?.id))} onSet={onSet} />
          </>
        )}
      </section>
    </div>
  );
}

interface ProductPick { on: boolean; qty: string }

/** Repas simple, hors recette : un nom et, si on veut, des produits du stock avec la quantité utilisée. */
function SimpleMealForm({ stock, toulouse, current, reserved, onSet }: {
  stock: StockItem[]; toulouse: boolean; current?: PlannedMeal; reserved: MealProduct[];
  onSet: (entry: Omit<PlannedMeal, 'id' | 'day' | 'meal'>) => void;
}) {
  const editing = current && !current.dishId && !current.recipeId ? current : undefined;
  /** Quantité encore libre d'un produit (unité de base), une fois retiré ce que d'autres repas ont réservé. */
  const freeBase = (s: StockItem) => {
    const r = reservedOf(s, reserved);
    return s.base === null ? null : Math.max(0, s.base - (r === 'tout' ? s.base : r));
  };
  const defaultQty = (s: StockItem) => {
    const free = freeBase(s);
    if (free === null) return '';
    const d = displayQuantity(free, s.family, new Set());
    // À la pièce (boîte, tranche…) : 1 par défaut ; au poids ou au volume : tout ce qui reste.
    return numberToInput(s.family === 'masse' || s.family === 'volume' ? d.quantity : Math.min(1, d.quantity));
  };
  const [title, setTitle] = useState(editing?.title ?? '');
  const [query, setQuery] = useState('');
  const [picks, setPicks] = useState<Record<string, ProductPick>>(() =>
    Object.fromEntries((editing?.products ?? []).map((p) => [p.stockId, { on: true, qty: numberToInput(p.quantity) }])));

  const items = [...stock].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  const shown = items.filter((s) => picks[s.id]?.on || s.name.includes(query.trim().toLowerCase()));
  const chosen = items.filter((s) => picks[s.id]?.on);
  const parsed = chosen.map((s) => {
    const unit = stockDisplay(s).unit;
    const q = s.base === null ? null : parseQuantity(picks[s.id]!.qty);
    return { s, unit, q };
  });
  const invalid = parsed.some((p) => p.s.base !== null && (p.q === undefined || p.q === null || p.q <= 0));
  const auto = chosen.map((s) => s.name).join(' + ');
  const name = title.trim() || (auto ? auto.charAt(0).toUpperCase() + auto.slice(1) : '');

  const submit = () => {
    if (!name || invalid) return;
    const products: MealProduct[] = parsed.map(({ s, unit, q }) => ({ stockId: s.id, name: s.name, quantity: q ?? null, unit: q == null ? null : unit, aisle: s.aisle }));
    onSet({ title: name, ...(products.length ? { products } : {}) });
  };

  return (
    <div class="stack simple-meal">
      <input type="text" aria-label="Nom du repas simple" placeholder={toulouse ? 'Restaurant, cantine, repas improvisé…' : auto ? name : 'Ex. : steak + haricots verts, restaurant…'}
        value={title} onInput={(e) => setTitle(e.currentTarget.value)} />
      {!toulouse && (
        items.length === 0 ? (
          <p class="muted small">Aucun produit en <a href="#/stock">stock</a> : le repas sera noté sans rien retirer.</p>
        ) : (
          <>
            <p class="muted small">Coche les produits utilisés : ils seront retirés du stock quand tu auras mangé.</p>
            {items.length > 8 && (
              <input type="search" aria-label="Chercher un produit" placeholder="Chercher un produit…" autocapitalize="off" value={query} onInput={(e) => setQuery(e.currentTarget.value)} />
            )}
            <ul class="list flush product-picks">
              {shown.map((s) => {
                const pick = picks[s.id];
                const free = freeBase(s);
                const unit = stockDisplay(s).unit;
                return (
                  <li key={s.id}>
                    <label class="check compact grow">
                      <input type="checkbox" checked={Boolean(pick?.on)}
                        onChange={(e) => setPicks({ ...picks, [s.id]: { on: e.currentTarget.checked, qty: pick?.qty || defaultQty(s) } })} />
                      <span class="shop-icon" aria-hidden="true">{ingredientIcon(s.name, s.aisle)}</span>
                      <span class="grow">
                        {s.name}
                        <span class="sources">{free === null ? 'en stock' : `${qty(displayQuantity(free, s.family, new Set()))} disponible${s.family === 'masse' || s.family === 'volume' || free <= 1 ? '' : 's'}`}</span>
                      </span>
                    </label>
                    {pick?.on && s.base !== null && (
                      <span class="pick-qty">
                        <input class="qty-input" type="text" inputMode="decimal" aria-label={`Quantité de ${s.name} utilisée`} value={pick.qty}
                          onInput={(e) => setPicks({ ...picks, [s.id]: { on: true, qty: e.currentTarget.value } })} />
                        <span class="small">{formatUnit(unit, parseQuantity(pick.qty) ?? 2) || '×'}</span>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
            {shown.length === 0 && <p class="muted small">Aucun produit ne correspond.</p>}
          </>
        )
      )}
      {invalid && <p class="error small" role="alert">Indique une quantité valide pour chaque produit coché (exemples : 2, 1,5, 1/2).</p>}
      <button type="button" class="btn" disabled={!name || invalid} onClick={submit}>
        {editing ? 'Enregistrer le repas' : 'Ajouter ce repas'}{chosen.length > 0 ? ` (${chosen.length} produit${chosen.length > 1 ? 's' : ''})` : ''}
      </button>
    </div>
  );
}
