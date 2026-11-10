// Feuille de choix de recettes (courses, session de batch cooking).
import { useMemo, useState } from 'preact/hooks';
import { normalizeText } from '../model/search';
import type { Recipe } from '../model/types';

export function RecipePicker({ recipes, onPick, onClose, emptyText = 'Toutes tes recettes sont déjà dans la liste.' }: {
  recipes: Recipe[]; onPick: (id: string) => void; onClose: () => void; emptyText?: string;
}) {
  const [q, setQ] = useState('');
  const shown = useMemo(() => {
    const n = normalizeText(q);
    return n ? recipes.filter((r) => normalizeText(r.title).includes(n)) : recipes;
  }, [recipes, q]);
  return (
    <div class="sheet-backdrop" onClick={onClose}>
      <section class="sheet" role="dialog" aria-modal="true" aria-label="Choisir des recettes" onClick={(e) => e.stopPropagation()}>
        <div class="row between nowrap">
          <h2 class="card-title">Choisir des recettes</h2>
          <button type="button" class="cook-icon" aria-label="Fermer" onClick={onClose}>✕</button>
        </div>
        {recipes.length > 6 && (
          <input type="search" class="sheet-search" placeholder="Rechercher" aria-label="Rechercher une recette" value={q} onInput={(e) => setQ(e.currentTarget.value)} />
        )}
        {shown.length === 0 ? (
          <p class="muted">{recipes.length ? 'Aucune recette ne correspond.' : emptyText}</p>
        ) : (
          <ul class="list flush">
            {shown.map((r) => (
              <li key={r.id}>
                <span class="grow ellipsis">{r.title}</span>
                <button type="button" class="btn small" onClick={() => onPick(r.id)}>Ajouter</button>
              </li>
            ))}
          </ul>
        )}
        <button type="button" class="btn secondary" onClick={onClose}>Terminé</button>
      </section>
    </div>
  );
}
