// Réglages (V2-J2) : compléter d'un coup les recettes enregistrées avant la V2 (conservation, nutrition).
import { useEffect, useRef, useState } from 'preact/hooks';
import { listRecipes, saveRecipe } from '../db/db';
import { GeminiProvider } from '../extraction/gemini';
import { ExtractionError } from '../extraction/types';
import { applyDetails, needsDetails } from '../model/details';
import type { Recipe, Settings } from '../model/types';

/** Pause entre deux recettes : l'offre gratuite limite le nombre de requêtes par minute. */
const PAUSE_MS = 4000;

type State =
  | { kind: 'idle'; done?: number; error?: string }
  | { kind: 'running'; index: number; total: number; title: string };

export function EnrichCard({ settings }: { settings: Settings }) {
  const [todo, setTodo] = useState<Recipe[] | null>(null);
  const [state, setState] = useState<State>({ kind: 'idle' });
  const stopRef = useRef<AbortController | null>(null);

  const refresh = () => listRecipes().then((rs) => setTodo(rs.filter(needsDetails)));
  useEffect(() => void refresh(), []);
  useEffect(() => () => stopRef.current?.abort(), []);

  async function run() {
    if (!todo?.length) return;
    const controller = new AbortController();
    stopRef.current = controller;
    const provider = new GeminiProvider({ apiKey: (settings.apiKey ?? '').trim(), model: settings.model });
    let done = 0;
    let error: string | undefined;
    for (const [i, r] of todo.entries()) {
      if (controller.signal.aborted) break;
      setState({ kind: 'running', index: i + 1, total: todo.length, title: r.title });
      try {
        await saveRecipe(applyDetails(r, await provider.estimateDetails(r, { signal: controller.signal }), Date.now()));
        done++;
      } catch (e) {
        if (e instanceof ExtractionError && e.kind === 'annule') break;
        error = `${r.title} : ${e instanceof ExtractionError ? e.message : String(e)}`;
        // Clé refusée ou quota atteint : inutile d'essayer les suivantes.
        if (e instanceof ExtractionError && (e.kind === 'quota' || e.kind === 'cle')) break;
      }
      if (i < todo.length - 1) await new Promise((res) => setTimeout(res, PAUSE_MS));
    }
    stopRef.current = null;
    setState({ kind: 'idle', done, ...(error ? { error } : {}) });
    await refresh();
  }

  if (todo === null) return null;
  const aiReady = Boolean(settings.apiKey && settings.model);
  return (
    <section class="card stack">
      <h2 class="card-title">Conservation et nutrition</h2>
      {state.kind === 'running' ? (
        <>
          <p class="progress" role="status">
            <span class="spinner" aria-hidden="true" />
            <span>{state.index}/{state.total} · {state.title}</span>
          </p>
          <p class="muted small">Reste sur l'appli pendant le traitement.</p>
          <button type="button" class="btn ghost" onClick={() => stopRef.current?.abort()}>Arrêter</button>
        </>
      ) : (
        <>
          {state.done !== undefined && <p class="ok small">{state.done} recette{state.done > 1 ? 's' : ''} complétée{state.done > 1 ? 's' : ''}.</p>}
          {state.error && <p class="error small" role="alert">{state.error}</p>}
          {todo.length === 0 ? (
            <p class="muted small">Toutes tes recettes ont leur conservation et leurs valeurs nutritionnelles.</p>
          ) : (
            <>
              <p class="small">
                {todo.length} recette{todo.length > 1 ? 's' : ''} sans conservation ou valeurs nutritionnelles. L'IA peut les estimer (une requête par recette, environ 5 s chacune).
              </p>
              <button type="button" class="btn secondary" disabled={!aiReady || !navigator.onLine} onClick={() => void run()}>
                ✨ Compléter {todo.length} recette{todo.length > 1 ? 's' : ''}
              </button>
              {!aiReady && <p class="muted small">Ajoute d'abord ta clé API ci-dessus.</p>}
            </>
          )}
        </>
      )}
    </section>
  );
}
