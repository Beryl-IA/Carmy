// Fin de cuisson (V2-J3) : ranger les portions dans la réserve et déduire les ingrédients utilisés.
import { useEffect, useMemo, useState } from 'preact/hooks';
import { loadDishes, loadStock, saveDishes, saveStock } from '../db/db';
import { formatQuantity, formatUnit } from '../format';
import type { BatchRecipe } from '../model/batch';
import { ingredientIcon } from '../model/icons';
import { consumeFromStock, defaultSplit, dishesFromPlan, type StockItem } from '../model/stock';
import type { Unit } from '../model/types';

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `d${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`);
const qty = (q: { quantity: number | null; unit: Unit }) => [formatQuantity(q.quantity), formatUnit(q.unit, q.quantity)].filter(Boolean).join(' ');

interface Props {
  items: BatchRecipe[];
  /** Recette seule : on suppose une portion mangée tout de suite. Session : tout est rangé. */
  mode: 'recipe' | 'batch';
  onDone: () => void;
  onCancel: () => void;
  /** Mode Toulouse : rien n'est rangé ni déduit. */
  toulouse?: boolean;
}

export function CookedSheet({ items, mode, onDone, onCancel, toulouse }: Props) {
  const [stock, setStock] = useState<StockItem[] | null>(null);
  const [deduct, setDeduct] = useState(true);
  const [saving, setSaving] = useState(false);
  const [split, setSplit] = useState(() =>
    items.map((it) => {
      const keep = mode === 'recipe' ? Math.max(0, it.servings - 1) : it.servings;
      return defaultSplit(keep, it.recipe.storage?.fridgeDays, it.recipe.storage?.freezerMonths, items.length);
    }));

  useEffect(() => void loadStock().then(setStock), []);
  const consumption = useMemo(() => (stock ? consumeFromStock(stock, items.flatMap((it) => it.ingredients), Date.now()) : null), [stock, items]);

  async function confirm() {
    setSaving(true);
    const now = Date.now();
    const added = dishesFromPlan(items.map((it, i) => ({
      recipeId: it.recipe.id, title: it.recipe.title, fridge: split[i]?.fridge ?? 0, freezer: split[i]?.freezer ?? 0,
      fridgeDays: it.recipe.storage?.fridgeDays ?? null, freezerMonths: it.recipe.storage?.freezerMonths ?? null,
    })), now, newId);
    if (added.length) await saveDishes([...(await loadDishes()), ...added]);
    if (deduct && consumption?.changes.length) await saveStock(consumeFromStock(await loadStock(), items.flatMap((it) => it.ingredients), now).stock);
    onDone();
  }

  const set = (i: number, key: 'fridge' | 'freezer', v: number) =>
    setSplit(split.map((s, j) => (j === i ? { ...s, [key]: Math.max(0, v) } : s)));

  if (toulouse)
    return (
      <div class="sheet-backdrop" onClick={onCancel}>
        <section class="sheet" role="dialog" aria-modal="true" aria-label="Fin de cuisson" onClick={(e) => e.stopPropagation()}>
          <h2 class="card-title">{mode === 'batch' ? 'Session terminée 🎉' : 'Bon appétit !'}</h2>
          <p>📍 <strong>Mode Toulouse actif</strong> : aucun plat n'est rangé et aucun ingrédient n'est déduit du stock.</p>
          <button type="button" class="btn" onClick={onDone}>Terminer</button>
        </section>
      </div>
    );

  return (
    <div class="sheet-backdrop" onClick={onCancel}>
      <section class="sheet" role="dialog" aria-modal="true" aria-label="Fin de cuisson" onClick={(e) => e.stopPropagation()}>
        <div class="row between nowrap">
          <h2 class="card-title">{mode === 'batch' ? 'Session terminée 🎉' : 'Bon appétit !'}</h2>
          <button type="button" class="cook-icon" aria-label="Fermer" onClick={onCancel}>✕</button>
        </div>

        <h3 class="sheet-group">Ranger dans le stock</h3>
        <p class="muted small">{mode === 'recipe' ? 'Portions à garder pour plus tard (une est comptée comme mangée maintenant).' : 'Portions à garder au frigo et au congélateur.'}</p>
        <ul class="list flush cooked-rows">
          {items.map((it, i) => {
            const s = split[i] ?? { fridge: 0, freezer: 0 };
            const noFreeze = it.recipe.storage?.freezerMonths === 0;
            return (
              <li key={it.recipe.id} class="stack">
                <strong>{it.recipe.title}</strong>
                <div class="row between nowrap">
                  <span>🧊 Frigo</span>
                  <Stepper label={`Portions de ${it.recipe.title} au frigo`} value={s.fridge} onChange={(v) => set(i, 'fridge', v)} />
                </div>
                <div class="row between nowrap">
                  <span>❄️ Congélateur{noFreeze ? ' (déconseillé)' : ''}</span>
                  <Stepper label={`Portions de ${it.recipe.title} au congélateur`} value={s.freezer} onChange={(v) => set(i, 'freezer', v)} />
                </div>
              </li>
            );
          })}
        </ul>

        <h3 class="sheet-group">Ingrédients utilisés</h3>
        {!consumption ? (
          <p class="muted small">…</p>
        ) : consumption.changes.length === 0 ? (
          <p class="muted small">Aucun de ces ingrédients n'est suivi dans ton stock.</p>
        ) : (
          <>
            <label class="check">
              <input type="checkbox" checked={deduct} onChange={(e) => setDeduct(e.currentTarget.checked)} />
              <span>Déduire du stock</span>
            </label>
            <ul class="list flush deduct-rows">
              {consumption.changes.map((c) => (
                <li key={c.id}>
                  <span class="shop-icon" aria-hidden="true">{ingredientIcon(c.name, c.aisle)}</span>
                  <span class="grow">{c.name}</span>
                  <span class="small">{qty(c.before)} → <strong>{c.after ? qty(c.after) : 'épuisé'}</strong></span>
                </li>
              ))}
            </ul>
          </>
        )}

        <button type="button" class="btn" disabled={saving || !consumption} onClick={() => void confirm()}>Valider</button>
        <button type="button" class="btn ghost" disabled={saving} onClick={onDone}>Ne rien ranger</button>
      </section>
    </div>
  );
}

function Stepper({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div class="stepper small" role="group" aria-label={label}>
      <button type="button" class="icon-btn" aria-label="Une de moins" disabled={value <= 0} onClick={() => onChange(value - 1)}>−</button>
      <span aria-live="polite">{value}</span>
      <button type="button" class="icon-btn" aria-label="Une de plus" disabled={value >= 50} onClick={() => onChange(value + 1)}>+</button>
    </div>
  );
}
