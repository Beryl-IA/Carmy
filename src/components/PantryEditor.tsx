// Garde-manger (F6) : ingrédients « déjà à la maison », rangés à part dans la liste de courses.
import { useEffect, useState } from 'preact/hooks';
import { loadPantry, savePantry } from '../db/db';
import { normalizeText } from '../model/search';
import type { PantryItem } from '../model/types';

export function PantryEditor() {
  const [items, setItems] = useState<PantryItem[] | null>(null);
  const [name, setName] = useState('');

  useEffect(() => void loadPantry().then(setItems), []);

  const save = (next: PantryItem[]) => {
    setItems(next);
    void savePantry(next);
  };
  const add = () => {
    const n = name.trim().toLowerCase();
    if (!n || !items) return;
    if (!items.some((i) => normalizeText(i.name) === normalizeText(n))) save([...items, { name: n }].sort((a, b) => a.name.localeCompare(b.name, 'fr')));
    setName('');
  };

  return (
    <section class="card stack">
      <h2 class="card-title">Garde-manger</h2>
      <p class="muted small">
        Ces ingrédients ne sont pas ajoutés à la liste de courses : ils apparaissent dans « Déjà à la maison », d'où tu peux les ajouter d'un tap.
        Le nom doit correspondre exactement à celui des recettes (« huile d'olive » est différent de « huile »).
      </p>
      {items && items.length > 0 && (
        <ul class="tags editable">
          {items.map((i) => (
            <li key={i.name}>
              {i.name}
              <button type="button" aria-label={`Retirer ${i.name} du garde-manger`} onClick={() => save(items.filter((x) => x !== i))}>✕</button>
            </li>
          ))}
        </ul>
      )}
      <form
        class="row nowrap"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input class="grow" type="text" autocapitalize="off" placeholder="Ex. : vinaigre" aria-label="Ingrédient du garde-manger" value={name} onInput={(e) => setName(e.currentTarget.value)} />
        <button type="submit" class="btn small secondary" disabled={!name.trim()}>Ajouter</button>
      </form>
    </section>
  );
}
