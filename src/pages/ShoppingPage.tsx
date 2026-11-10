// Onglet Courses (F6) : recettes choisies, liste fusionnée par rayon, garde-manger, cases, ajout manuel.
import { ingredientIcon } from '../model/icons';
import { RecipePicker } from '../components/RecipePicker';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { listRecipes, loadPantry, loadShopping, saveShopping } from '../db/db';
import { AISLE_LABELS, formatQuantity, formatUnit } from '../format';
import { parseQuantity } from '../model/draft';
import { buildShoppingList, type ShoppingLine } from '../model/shopping';
import { AISLES, UNITS, type Aisle, type PantryItem, type Recipe, type ShoppingState, type Unit } from '../model/types';

const UNIT_OPTIONS: Record<Exclude<Unit, null>, string> = {
  g: 'g', kg: 'kg', ml: 'ml', cl: 'cl', l: 'l', c_cafe: 'c. à café', c_soupe: 'c. à soupe', piece: 'pièce(s)',
  pincee: 'pincée', gousse: 'gousse', tranche: 'tranche', sachet: 'sachet', boite: 'boîte', bouquet: 'bouquet',
};

export function ShoppingPage({ defaultServings }: { defaultServings: number }) {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [state, setState] = useState<ShoppingState | null>(null);
  const [pantry, setPantry] = useState<PantryItem[]>([]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set(['pantry']));
  const [picking, setPicking] = useState(false);
  const [openSources, setOpenSources] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([listRecipes(), loadShopping(), loadPantry()]).then(([r, s, p]) => {
      setRecipes(r);
      setState(s);
      setPantry(p);
    });
  }, []);

  const update = (next: ShoppingState) => {
    setState(next);
    void saveShopping(next);
  };

  const list = useMemo(() => (state ? buildShoppingList(recipes, state, pantry) : null), [recipes, state, pantry]);
  const byId = useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes]);

  if (!state || !list) return <main class="page" aria-busy="true" />;

  // Recettes supprimées de la bibliothèque : on ne les affiche pas.
  const selections = state.selections.filter((s) => byId.has(s.recipeId));
  const isEmpty = selections.length === 0 && state.manualItems.length === 0;
  const checkedCount = list.total - list.remaining;

  const toggle = (key: string) =>
    update({ ...state, checkedKeys: state.checkedKeys.includes(key) ? state.checkedKeys.filter((k) => k !== key) : [...state.checkedKeys, key] });

  const toggleSection = (id: string) =>
    setCollapsed((c) => {
      const n = new Set(c);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const setServings = (recipeId: string, servings: number) =>
    update({ ...state, selections: state.selections.map((s) => (s.recipeId === recipeId ? { ...s, servings: Math.max(1, servings) } : s)) });

  const removeRecipe = (recipeId: string) => update({ ...state, selections: state.selections.filter((s) => s.recipeId !== recipeId) });

  const addRecipe = (recipeId: string) =>
    update({ ...state, selections: [...state.selections, { recipeId, servings: defaultServings }], removedKeys: [] });

  const deleteChecked = () => {
    const checkedLines = list.sections.flatMap((s) => s.lines).filter((l) => l.checked);
    const recipeKeys = checkedLines.filter((l) => l.origin === 'recipe').map((l) => l.key);
    const manualKeys = new Set(checkedLines.filter((l) => l.origin === 'manual').map((l) => l.key));
    update({
      ...state,
      manualItems: state.manualItems.filter((m) => !manualKeys.has(`manuel:${m.id}`)),
      removedKeys: [...new Set([...state.removedKeys, ...recipeKeys])],
      checkedKeys: state.checkedKeys.filter((k) => !recipeKeys.includes(k) && !manualKeys.has(k)),
    });
  };

  const clearAll = () => {
    if (!confirm('Vider la liste de courses ? Les recettes choisies et les articles ajoutés à la main seront retirés.')) return;
    update({ selections: [], manualItems: [], checkedKeys: [], removedKeys: [], pantryOverrides: [] });
  };

  return (
    <main class="page stack">
      <header class="page-header">
        <h1>Courses</h1>
        {list.total > 0 && <span class="muted count">{list.remaining} à acheter</span>}
      </header>

      {isEmpty && (
        <section class="card empty">
          <span class="empty-icon" aria-hidden="true">🛒</span>
          <h2 class="card-title">Ta liste est vide</h2>
          <p class="muted">Choisis des recettes : leurs ingrédients seront regroupés et rangés par rayon.</p>
          {recipes.length > 0 ? (
            <button type="button" class="btn" onClick={() => setPicking(true)}>Choisir des recettes</button>
          ) : (
            <a class="btn" href="#/ajouter">Ajouter une recette</a>
          )}
        </section>
      )}

      {selections.length > 0 && (
        <section class="card stack">
          <h2 class="card-title">Recettes ({selections.length})</h2>
          <ul class="list flush">
            {selections.map((s) => (
              <li key={s.recipeId}>
                <a class="grow ellipsis" href={`#/recette/${encodeURIComponent(s.recipeId)}`}>{byId.get(s.recipeId)!.title}</a>
                <div class="stepper small" role="group" aria-label={`Portions pour ${byId.get(s.recipeId)!.title}`}>
                  <button type="button" class="icon-btn" aria-label="Une portion de moins" disabled={s.servings <= 1} onClick={() => setServings(s.recipeId, s.servings - 1)}>−</button>
                  <span>{s.servings}</span>
                  <button type="button" class="icon-btn" aria-label="Une portion de plus" onClick={() => setServings(s.recipeId, s.servings + 1)}>+</button>
                </div>
                <button type="button" class="icon-btn danger" aria-label={`Retirer ${byId.get(s.recipeId)!.title} de la liste`} onClick={() => removeRecipe(s.recipeId)}>✕</button>
              </li>
            ))}
          </ul>
          <button type="button" class="btn secondary" onClick={() => setPicking(true)}>+ Ajouter des recettes</button>
        </section>
      )}

      {list.sections.map((sec) => {
        const open = !collapsed.has(sec.aisle);
        const left = sec.lines.filter((l) => !l.checked).length;
        return (
          <section key={sec.aisle} class="card aisle">
            <button type="button" class="aisle-head" aria-expanded={open} onClick={() => toggleSection(sec.aisle)}>
              <span>{AISLE_LABELS[sec.aisle]}</span>
              <span class="muted small">{left ? `${left} / ${sec.lines.length}` : '✓'} {open ? '▴' : '▾'}</span>
            </button>
            {open && (
              <ul class="shop-lines">
                {sec.lines.map((l) => (
                  <ShopLine
                    key={l.key}
                    line={l}
                    onToggle={() => toggle(l.key)}
                    sourcesOpen={openSources === l.key}
                    onSources={() => setOpenSources(openSources === l.key ? null : l.key)}
                    sources={l.recipeIds.map((id) => byId.get(id)?.title).filter((t): t is string => Boolean(t))}
                  />
                ))}
              </ul>
            )}
          </section>
        );
      })}

      {list.pantry.length > 0 && (
        <section class="card aisle pantry">
          <button type="button" class="aisle-head" aria-expanded={!collapsed.has('pantry')} onClick={() => toggleSection('pantry')}>
            <span>🏠 Déjà à la maison ({list.pantry.length})</span>
            <span class="muted small">{collapsed.has('pantry') ? '▾' : '▴'}</span>
          </button>
          {!collapsed.has('pantry') && (
            <>
              <ul class="shop-lines">
                {list.pantry.map((l) => (
                  <li key={l.key} class="shop-line pantry-line">
                    <span class="shop-qty">{qtyText(l)}</span>
                    <span class="grow">{l.name}</span>
                    <button type="button" class="btn small secondary" onClick={() => update({ ...state, pantryOverrides: [...state.pantryOverrides, l.key] })}>
                      + À acheter
                    </button>
                  </li>
                ))}
              </ul>
              <p class="muted small"><a href="#/reglages">Modifier le garde-manger</a></p>
            </>
          )}
        </section>
      )}

      {!isEmpty || recipes.length > 0 ? <ManualItemForm onAdd={(item) => update({ ...state, manualItems: [...state.manualItems, item] })} /> : null}

      {list.total > 0 && (
        <section class="row center shop-actions">
          <button type="button" class="btn small ghost" disabled={checkedCount === 0} onClick={() => update({ ...state, checkedKeys: [] })}>Tout décocher</button>
          <button type="button" class="btn small secondary" disabled={checkedCount === 0} onClick={deleteChecked}>Supprimer les cochés ({checkedCount})</button>
          <button type="button" class="btn small ghost danger-text" onClick={clearAll}>Vider la liste</button>
        </section>
      )}

      {picking && (
        <RecipePicker
          recipes={recipes.filter((r) => !state.selections.some((s) => s.recipeId === r.id))}
          onPick={(id) => addRecipe(id)}
          onClose={() => setPicking(false)}
        />
      )}
    </main>
  );
}

function qtyText(l: ShoppingLine): string {
  return [formatQuantity(l.quantity), formatUnit(l.unit, l.quantity)].filter(Boolean).join(' ');
}

function ShopLine({ line, onToggle, sources, sourcesOpen, onSources }: {
  line: ShoppingLine; onToggle: () => void; sources: string[]; sourcesOpen: boolean; onSources: () => void;
}) {
  return (
    <li class={`shop-line ${line.checked ? 'checked' : ''}`}>
      <label class="shop-check">
        <input type="checkbox" checked={line.checked} onChange={onToggle} />
        <span class="shop-icon" aria-hidden="true">{ingredientIcon(line.name, line.aisle)}</span>
        <span class="shop-qty">{qtyText(line)}</span>
        <span class="grow">
          {line.name}
          {line.optional && <span class="muted small"> (facultatif)</span>}
          {sourcesOpen && sources.length > 0 && <span class="sources">Pour : {sources.join(', ')}</span>}
        </span>
      </label>
      {line.origin === 'recipe' && sources.length > 0 ? (
        <button type="button" class="src-btn" aria-label={`Recettes pour ${line.name}`} aria-expanded={sourcesOpen} onClick={onSources}>
          {sources.length > 1 ? `×${sources.length}` : 'ⓘ'}
        </button>
      ) : line.origin === 'manual' ? (
        <span class="src-btn muted" title="Ajouté à la main">✎</span>
      ) : null}
    </li>
  );
}

function ManualItemForm({ onAdd }: { onAdd: (item: ShoppingState['manualItems'][number]) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState<Unit>(null);
  const [aisle, setAisle] = useState<Aisle>('autre');
  const [error, setError] = useState('');

  if (!open)
    return (
      <button type="button" class="btn secondary" onClick={() => setOpen(true)}>+ Ajouter un article</button>
    );

  const submit = () => {
    const n = name.trim();
    if (!n) return;
    const q = parseQuantity(qty);
    if (q === undefined) {
      setError('Quantité illisible (exemples : 2, 1,5, 1/2).');
      return;
    }
    onAdd({
      id: crypto.randomUUID ? crypto.randomUUID() : `m${Date.now()}`,
      name: n.toLowerCase(), quantity: q && q > 0 ? q : null, unit: q ? unit : null, aisle,
      checked: false, origin: 'manual', recipeIds: [],
    });
    setName('');
    setQty('');
    setUnit(null);
    setError('');
  };

  return (
    <form
      class="card stack"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <h2 class="card-title">Ajouter un article</h2>
      <input type="text" aria-label="Article" placeholder="Ex. : papier cuisson, yaourts…" value={name} onInput={(e) => setName(e.currentTarget.value)} />
      <div class="ing-line">
        <input class="qty-input" type="text" inputMode="decimal" aria-label="Quantité (facultative)" placeholder="Qté" value={qty} onInput={(e) => setQty(e.currentTarget.value)} />
        <select class="unit-select" aria-label="Unité" value={unit ?? ''} onChange={(e) => setUnit((e.currentTarget.value || null) as Unit)}>
          <option value="">—</option>
          {UNITS.map((u) => <option key={u} value={u}>{UNIT_OPTIONS[u]}</option>)}
        </select>
        <select class="grow" aria-label="Rayon" value={aisle} onChange={(e) => setAisle(e.currentTarget.value as Aisle)}>
          {AISLES.map((a) => <option key={a} value={a}>{AISLE_LABELS[a]}</option>)}
        </select>
      </div>
      {error && <p class="error small">{error}</p>}
      <div class="row nowrap">
        <button type="button" class="btn ghost" onClick={() => setOpen(false)}>Fermer</button>
        <button type="submit" class="btn grow" disabled={!name.trim()}>Ajouter</button>
      </div>
    </form>
  );
}
