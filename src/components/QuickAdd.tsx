// 1.12.0 : liste de courses hors recette — saisie rapide en haut de l'onglet Courses, suggestions et habituels.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { AISLE_LABELS, formatQuantity, formatUnit } from '../format';
import { guessAisle, parseQuickItem, sortRecent, suggestItems } from '../model/groceries';
import { ingredientIcon } from '../model/icons';
import { normalizeText } from '../model/search';
import type { StockItem } from '../model/stock';
import { AISLES, type Aisle, type PantryItem, type Recipe, type RecentItem, type Unit } from '../model/types';

export interface NewItem {
  name: string;
  quantity: number | null;
  unit: Unit;
  aisle: Aisle;
}

/** Nombre d'habituels affichés quand le champ est vide. */
const RECENT_SHOWN = 14;

export function QuickAdd({ recent, stock, recipes, pantry, inList, onAdd, onForget }: {
  recent: RecentItem[];
  stock: StockItem[];
  recipes: Recipe[];
  pantry: PantryItem[];
  /** Noms des articles déjà dans la liste (non cochés) : ni suggérés ni proposés en habituels. */
  inList: string[];
  /** Renvoie true si l'article a été cumulé avec une ligne existante. */
  onAdd: (item: NewItem) => boolean;
  onForget: (name: string) => void;
}) {
  const [text, setText] = useState('');
  const [aisleChoice, setAisleChoice] = useState<Aisle | null>(null);
  const [status, setStatus] = useState('');
  const [managing, setManaging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  // La confirmation s'efface d'elle-même.
  useEffect(() => {
    if (!status) return;
    const t = setTimeout(() => setStatus(''), 4000);
    return () => clearTimeout(t);
  }, [status]);

  const parsed = useMemo(() => parseQuickItem(text), [text]);
  const guessed = useMemo(() => (parsed ? guessAisle(parsed.name, { recent, stock, recipes }) : 'autre'), [parsed, recent, stock, recipes]);
  const aisle = aisleChoice ?? guessed;
  const suggestions = useMemo(
    () => (parsed ? suggestItems(parsed.name, { recent, stock, recipes, pantry, inList }) : []),
    [parsed, recent, stock, recipes, pantry, inList],
  );
  const taken = useMemo(() => new Set(inList.map(normalizeText)), [inList]);
  const habituals = useMemo(() => sortRecent(recent).filter((r) => !taken.has(normalizeText(r.name))).slice(0, RECENT_SHOWN), [recent, taken]);

  const add = (item: NewItem) => {
    const merged = onAdd(item);
    const what = [qtyText(item.quantity, item.unit), item.name].filter(Boolean).join(' ');
    setStatus(merged ? `✓ ${what} : quantité ajoutée à la ligne existante` : `✓ ${what} ajouté (${AISLE_LABELS[item.aisle]})`);
    setText('');
    setAisleChoice(null);
    input.current?.focus();
  };

  const submit = () => {
    if (!parsed) return;
    add({ ...parsed, aisle });
  };

  /** Suggestion touchée : on garde la quantité tapée, on prend le nom et le rayon connus. */
  const pick = (name: string, a: Aisle) => {
    add({ name, quantity: parsed?.quantity ?? null, unit: parsed?.quantity ? parsed.unit : null, aisle: aisleChoice ?? a });
  };

  return (
    <section class="card stack quick-add">
      <form
        class="quick-add-form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input
          ref={input}
          type="text"
          enterKeyHint="done"
          autocapitalize="off"
          autocomplete="off"
          aria-label="Aliment ou produit à acheter (quantité facultative)"
          placeholder="Ajouter : lait, 2 kg pommes, 6 œufs…"
          value={text}
          onInput={(e) => {
            setText(e.currentTarget.value);
            setStatus('');
          }}
        />
        <button type="submit" class="btn" disabled={!parsed} aria-label="Ajouter à la liste">Ajouter</button>
      </form>

      {parsed && (
        <div class="quick-preview">
          <span class="shop-icon" aria-hidden="true">{ingredientIcon(parsed.name, aisle)}</span>
          <span class="grow ellipsis">
            {parsed.quantity !== null && <strong>{qtyText(parsed.quantity, parsed.unit)} </strong>}
            {parsed.name}
          </span>
          <select class="aisle-select" aria-label="Rayon" value={aisle} onChange={(e) => setAisleChoice(e.currentTarget.value as Aisle)}>
            {AISLES.map((a) => <option key={a} value={a}>{AISLE_LABELS[a]}</option>)}
          </select>
        </div>
      )}

      {suggestions.length > 0 && (
        <ul class="tags suggestions" aria-label="Suggestions">
          {suggestions.map((s) => (
            <li key={s.name}>
              <button type="button" onClick={() => pick(s.name, s.aisle)}>
                {ingredientIcon(s.name, s.aisle)} {s.name}
              </button>
            </li>
          ))}
        </ul>
      )}

      {!parsed && habituals.length > 0 && (
        <div class="stack tight">
          <div class="row nowrap">
            <h3 class="sheet-group grow">Habituels</h3>
            <button type="button" class="link-btn small" onClick={() => setManaging(!managing)}>{managing ? 'Terminé' : 'Gérer'}</button>
          </div>
          <ul class="tags suggestions habituals" aria-label="Articles habituels">
            {habituals.map((r) => (
              <li key={r.name}>
                {managing ? (
                  <button type="button" class="forget" aria-label={`Oublier ${r.name}`} onClick={() => onForget(r.name)}>
                    {r.name} ✕
                  </button>
                ) : (
                  <button type="button" aria-label={`Ajouter ${[qtyText(r.quantity, r.unit), r.name].filter(Boolean).join(' ')}`}
                    onClick={() => add({ name: r.name, quantity: r.quantity, unit: r.quantity === null ? null : r.unit, aisle: r.aisle })}>
                    + {ingredientIcon(r.name, r.aisle)} {r.name}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {status && <p class="muted small" role="status">{status}</p>}
    </section>
  );
}

export function qtyText(quantity: number | null, unit: Unit): string {
  return [formatQuantity(quantity), formatUnit(unit, quantity)].filter(Boolean).join(' ');
}
