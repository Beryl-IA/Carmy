// Réserve (V2-J3), affichée sous le planning de l'onglet Semaine (V2-J4) : plats cuisinés (portions,
// frigo/congélateur, dates limites) et produits achetés (quantités).
import { useEffect, useMemo, useState } from 'preact/hooks';
import { loadPantry, loadStock, saveStock } from '../db/db';
import { plannedPortions, type PlannedMeal } from '../model/planning';
import { AISLE_LABELS, formatQuantity, formatUnit } from '../format';
import { numberToInput, parseQuantity } from '../model/draft';
import { ingredientIcon } from '../model/icons';
import {
  addToStock, dishStatus, DEFAULT_FRIDGE_DAYS, dishesFromPlan, eatPortion, moveDish, setStockQuantity, sortDishes, stockDisplay,
  type DishPlace, type StockItem, type StoredDish,
} from '../model/stock';
import { AISLES, UNITS, type Aisle, type PantryItem, type Recipe, type Unit } from '../model/types';

const UNIT_OPTIONS: Record<Exclude<Unit, null>, string> = {
  g: 'g', kg: 'kg', ml: 'ml', cl: 'cl', l: 'l', c_cafe: 'c. à café', c_soupe: 'c. à soupe', piece: 'pièce(s)',
  pincee: 'pincée', gousse: 'gousse', tranche: 'tranche', sachet: 'sachet', boite: 'boîte', bouquet: 'bouquet',
};
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `r${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`);
const fmtDate = (t: number) => new Date(t).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
/** « aujourd'hui », « demain », sinon la date. */
function relDate(t: number, now: number): string {
  const day = (x: number) => { const d = new Date(x); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const diff = Math.round((day(t) - day(now)) / 864e5);
  return diff === 0 ? 'aujourd\'hui' : diff === 1 ? 'demain' : fmtDate(t);
}
const qty = (q: { quantity: number | null; unit: Unit }) => [formatQuantity(q.quantity), formatUnit(q.unit, q.quantity)].filter(Boolean).join(' ');

interface Props {
  dishes: StoredDish[];
  recipes: Recipe[];
  plan: PlannedMeal[];
  onDishes: (next: StoredDish[]) => void;
}

export function ReserveSections({ dishes, recipes, plan, onDishes: updateDishes }: Props) {
  const [stock, setStock] = useState<StockItem[]>([]);
  const [pantry, setPantry] = useState<PantryItem[]>([]);
  const now = Date.now();

  useEffect(() => {
    void Promise.all([loadStock(), loadPantry()]).then(([s, p]) => {
      setStock(s);
      setPantry(p);
    });
  }, []);

  const byId = useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes]);
  const updateStock = (next: StockItem[]) => {
    setStock(next);
    void saveStock(next);
  };

  const editQuantity = (s: StockItem) => {
    const d = stockDisplay(s);
    const raw = prompt(`Quantité de ${s.name}${d.unit ? ` (en ${UNIT_OPTIONS[d.unit as Exclude<Unit, null>]})` : ''} — 0 pour le retirer`, numberToInput(d.quantity));
    if (raw === null) return;
    const q = parseQuantity(raw);
    if (q === undefined) return alert('Quantité illisible (exemples : 2, 1,5, 1/2).');
    updateStock(setStockQuantity(stock, s.id, q, q === null ? null : d.unit, Date.now()));
  };

  const fridge = sortDishes(dishes.filter((d) => d.place === 'frigo'));
  const freezer = sortDishes(dishes.filter((d) => d.place === 'congelateur'));
  const portions = (list: StoredDish[]) => list.reduce((n, d) => n + d.portions, 0);
  const byAisle = AISLES.map((aisle) => ({ aisle, items: stock.filter((s) => s.aisle === aisle).sort((a, b) => a.name.localeCompare(b.name, 'fr')) }))
    .filter((g) => g.items.length);

  const dishRow = (d: StoredDish) => {
    const status = dishStatus(d, now);
    const freezable = byId.get(d.recipeId ?? '')?.storage?.freezerMonths !== 0;
    return (
      <li key={d.id} class="dish-row">
        <div class="grow dish-info">
          {d.recipeId && byId.has(d.recipeId) ? <a href={`#/recette/${encodeURIComponent(d.recipeId)}`}>{d.title}</a> : <span>{d.title}</span>}
          <span class="small">
            {d.portions} portion{d.portions > 1 ? 's' : ''}
            {plannedPortions(plan, d.id) > 0 && ` (${plannedPortions(plan, d.id)} prévue${plannedPortions(plan, d.id) > 1 ? 's' : ''})`}
            {d.expiresAt !== null && (
              <span class={`dish-date st-${status}`}>
                {' · '}
                {status === 'perime' ? `⚠︎ date dépassée (${fmtDate(d.expiresAt)})` : d.place === 'frigo' ? `à manger ${relDate(d.expiresAt, now) === 'aujourd\'hui' || relDate(d.expiresAt, now) === 'demain' ? `au plus tard ${relDate(d.expiresAt, now)}` : `avant ${fmtDate(d.expiresAt)}`}` : `jusqu'au ${fmtDate(d.expiresAt)}`}
              </span>
            )}
          </span>
        </div>
        <div class="dish-actions">
          <button type="button" class="btn small" aria-label={`J'ai mangé une portion de ${d.title}`} onClick={() => updateDishes(eatPortion(dishes, d.id))}>−1</button>
          {d.place === 'frigo' ? (
            freezable && (
              <button type="button" class="icon-btn" aria-label={`Congeler ${d.title}`} title="Congeler"
                onClick={() => updateDishes(moveDish(dishes, d.id, 'congelateur', byId.get(d.recipeId ?? '')?.storage?.freezerMonths, Date.now()))}>❄️</button>
            )
          ) : (
            <button type="button" class="icon-btn" aria-label={`Décongeler ${d.title} (à manger sous 24 h)`} title="Décongeler"
              onClick={() => updateDishes(moveDish(dishes, d.id, 'frigo', null, Date.now()))}>🧊</button>
          )}
          <button type="button" class="icon-btn danger" aria-label={`Retirer ${d.title} de la réserve`}
            onClick={() => { if (confirm(`Retirer « ${d.title} » (${d.portions} portion${d.portions > 1 ? 's' : ''}) de la réserve ?`)) updateDishes(dishes.filter((x) => x.id !== d.id)); }}>✕</button>
        </div>
      </li>
    );
  };

  return (
    <>
      <h2 class="section-title">Réserve</h2>
      <section class="card stack">
        <h2 class="card-title">🧊 Frigo {fridge.length > 0 && <span class="muted small">· {portions(fridge)} portion{portions(fridge) > 1 ? 's' : ''}</span>}</h2>
        {fridge.length ? <ul class="list flush">{fridge.map(dishRow)}</ul> : <p class="muted small">Aucun plat cuisiné au frigo.</p>}
      </section>

      <section class="card stack">
        <h2 class="card-title">❄️ Congélateur {freezer.length > 0 && <span class="muted small">· {portions(freezer)} portion{portions(freezer) > 1 ? 's' : ''}</span>}</h2>
        {freezer.length ? <ul class="list flush">{freezer.map(dishRow)}</ul> : <p class="muted small">Aucun plat au congélateur.</p>}
        <p class="muted small">Décongeler (🧊) : le plat passe au frigo, à manger sous 24 h.</p>
      </section>

      <DishForm recipes={recipes} onAdd={(d) => updateDishes([...dishes, ...d])} />

      <section class="card stack">
        <h2 class="card-title">Produits</h2>
        {byAisle.length === 0 ? (
          <p class="muted small">Coche tes articles dans Courses puis touche « Ranger les courses » : ils arrivent ici avec leurs quantités, et se déduisent quand tu cuisines.</p>
        ) : (
          byAisle.map((g) => (
            <div key={g.aisle} class="stock-group">
              <h3 class="sheet-group">{AISLE_LABELS[g.aisle]}</h3>
              <ul class="list flush">
                {g.items.map((s) => (
                  <li key={s.id} class="stock-row">
                    <span class="shop-icon" aria-hidden="true">{ingredientIcon(s.name, s.aisle)}</span>
                    <span class="grow">{s.name}</span>
                    <button type="button" class="link-btn stock-qty" aria-label={`Modifier la quantité de ${s.name}`} onClick={() => editQuantity(s)}>
                      {s.base === null ? 'en stock' : qty(stockDisplay(s))}
                    </button>
                    <button type="button" class="icon-btn danger" aria-label={`${s.name} : terminé, retirer de la réserve`} onClick={() => updateStock(stock.filter((x) => x.id !== s.id))}>✕</button>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
        <StockForm onAdd={(e) => updateStock(addToStock(stock, [e], Date.now(), newId))} />
      </section>

      {pantry.length > 0 && (
        <p class="muted small">
          Basiques toujours à la maison (non décomptés) : {pantry.map((p) => p.name).join(', ')}. <a href="#/reglages">Modifier</a>
        </p>
      )}
    </>
  );
}

function DishForm({ recipes, onAdd }: { recipes: Recipe[]; onAdd: (d: StoredDish[]) => void }) {
  const [open, setOpen] = useState(false);
  const [recipeId, setRecipeId] = useState('');
  const [title, setTitle] = useState('');
  const [portions, setPortions] = useState(2);
  const [place, setPlace] = useState<DishPlace>('frigo');
  if (!open) return <button type="button" class="btn secondary" onClick={() => setOpen(true)}>+ Ajouter un plat (restes…)</button>;
  const recipe = recipes.find((r) => r.id === recipeId);
  const name = recipe?.title ?? title.trim();
  return (
    <section class="card stack">
      <h2 class="card-title">Ajouter un plat</h2>
      <label class="field">
        <span>Recette</span>
        <select value={recipeId} onChange={(e) => setRecipeId(e.currentTarget.value)}>
          <option value="">— Autre plat —</option>
          {recipes.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
        </select>
      </label>
      {!recipe && (
        <label class="field">
          <span>Nom du plat</span>
          <input type="text" value={title} placeholder="Ex. : reste de lasagnes" onInput={(e) => setTitle(e.currentTarget.value)} />
        </label>
      )}
      <div class="row between">
        <span>Portions</span>
        <div class="stepper small" role="group" aria-label="Portions du plat">
          <button type="button" class="icon-btn" aria-label="Une portion de moins" disabled={portions <= 1} onClick={() => setPortions(portions - 1)}>−</button>
          <span>{portions}</span>
          <button type="button" class="icon-btn" aria-label="Une portion de plus" onClick={() => setPortions(portions + 1)}>+</button>
        </div>
      </div>
      <div class="segmented" role="radiogroup" aria-label="Où le ranger">
        {([['frigo', '🧊 Frigo'], ['congelateur', '❄️ Congélateur']] as [DishPlace, string][]).map(([p, label]) => (
          <button key={p} type="button" role="radio" aria-checked={place === p} class={place === p ? 'active' : ''} onClick={() => setPlace(p)}>{label}</button>
        ))}
      </div>
      <div class="row">
        <button type="button" class="btn ghost" onClick={() => setOpen(false)}>Annuler</button>
        <button
          type="button"
          class="btn grow"
          disabled={!name}
          onClick={() => {
            const st = recipe?.storage;
            onAdd(dishesFromPlan([{
              ...(recipe ? { recipeId: recipe.id } : {}), title: name,
              fridge: place === 'frigo' ? portions : 0, freezer: place === 'congelateur' ? portions : 0,
              fridgeDays: st?.fridgeDays ?? DEFAULT_FRIDGE_DAYS, freezerMonths: st?.freezerMonths ?? null,
            }], Date.now(), newId));
            setOpen(false);
            setTitle('');
            setRecipeId('');
          }}
        >
          Ajouter
        </button>
      </div>
    </section>
  );
}

function StockForm({ onAdd }: { onAdd: (e: { name: string; quantity: number | null; unit: Unit; aisle: Aisle }) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [q, setQ] = useState('');
  const [unit, setUnit] = useState<Unit>(null);
  const [aisle, setAisle] = useState<Aisle>('autre');
  const [error, setError] = useState('');
  if (!open) return <button type="button" class="btn secondary" onClick={() => setOpen(true)}>+ Ajouter un produit</button>;
  const submit = () => {
    const quantity = parseQuantity(q);
    if (!name.trim()) return;
    if (quantity === undefined) return setError('Quantité illisible (exemples : 2, 1,5, 1/2).');
    onAdd({ name: name.trim(), quantity, unit: quantity === null ? null : unit, aisle });
    setName('');
    setQ('');
    setError('');
  };
  return (
    <div class="stack">
      <input type="text" aria-label="Produit" placeholder="produit (ex. : riz)" autocapitalize="off" value={name} onInput={(e) => setName(e.currentTarget.value)} />
      <div class="ing-line">
        <input class="qty-input" type="text" inputMode="decimal" aria-label="Quantité" placeholder="Qté" value={q} onInput={(e) => setQ(e.currentTarget.value)} />
        <select class="unit-select" aria-label="Unité" value={unit ?? ''} onChange={(e) => setUnit((e.currentTarget.value || null) as Unit)}>
          <option value="">—</option>
          {UNITS.map((u) => <option key={u} value={u}>{UNIT_OPTIONS[u]}</option>)}
        </select>
        <select class="grow" aria-label="Rayon" value={aisle} onChange={(e) => setAisle(e.currentTarget.value as Aisle)}>
          {AISLES.map((a) => <option key={a} value={a}>{AISLE_LABELS[a]}</option>)}
        </select>
      </div>
      {error && <p class="error small" role="alert">{error}</p>}
      <div class="row">
        <button type="button" class="btn ghost" onClick={() => setOpen(false)}>Fermer</button>
        <button type="button" class="btn grow" disabled={!name.trim()} onClick={submit}>Ajouter à la réserve</button>
      </div>
    </div>
  );
}
