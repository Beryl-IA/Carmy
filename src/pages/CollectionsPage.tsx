// Gestion des collections (F4) : créer, renommer, supprimer.
import { useEffect, useState } from 'preact/hooks';
import { deleteCollection, listCollections, listRecipes, saveCollection } from '../db/db';
import type { Collection } from '../model/types';

export function CollectionsPage({ onChanged }: { onChanged: () => void }) {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [name, setName] = useState('');

  async function refresh() {
    const [cs, rs] = await Promise.all([listCollections(), listRecipes()]);
    setCollections(cs);
    const c: Record<string, number> = {};
    for (const r of rs) for (const id of r.collectionIds) c[id] = (c[id] ?? 0) + 1;
    setCounts(c);
  }
  useEffect(() => void refresh(), []);

  async function create() {
    const n = name.trim();
    if (!n) return;
    await saveCollection({ id: crypto.randomUUID ? crypto.randomUUID() : `c${Date.now()}`, name: n });
    setName('');
    await refresh();
    onChanged();
  }

  async function rename(c: Collection) {
    const n = prompt('Nouveau nom', c.name)?.trim();
    if (!n || n === c.name) return;
    await saveCollection({ ...c, name: n });
    await refresh();
    onChanged();
  }

  async function remove(c: Collection) {
    if (!confirm(`Supprimer la collection « ${c.name} » ? Les recettes qu'elle contient sont conservées.`)) return;
    await deleteCollection(c.id);
    await refresh();
    onChanged();
  }

  return (
    <main class="page stack">
      <a class="back" href="#/recettes">‹ Recettes</a>
      <header class="page-header">
        <h1>Collections</h1>
      </header>
      <form
        class="row nowrap"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <input class="grow" type="text" placeholder="Ex. : Repas de la semaine" aria-label="Nom de la collection" value={name} onInput={(e) => setName(e.currentTarget.value)} />
        <button type="submit" class="btn small" disabled={!name.trim()}>Créer</button>
      </form>
      {collections.length === 0 ? (
        <section class="card empty">
          <span class="empty-icon" aria-hidden="true">📁</span>
          <p class="muted">Aucune collection. Crée des dossiers pour ranger tes recettes ; une recette peut être dans plusieurs collections.</p>
        </section>
      ) : (
        <ul class="list card">
          {collections.map((c) => (
            <li key={c.id}>
              <span class="grow">
                <strong>{c.name}</strong>
                <span class="muted small"> · {counts[c.id] ?? 0} recette{(counts[c.id] ?? 0) > 1 ? 's' : ''}</span>
              </span>
              <button type="button" class="btn small ghost" onClick={() => void rename(c)}>Renommer</button>
              <button type="button" class="icon-btn danger" aria-label={`Supprimer ${c.name}`} onClick={() => void remove(c)}>✕</button>
            </li>
          ))}
        </ul>
      )}
      <p class="muted small">Pour ranger une recette, ouvre sa fiche et touche une collection.</p>
    </main>
  );
}
