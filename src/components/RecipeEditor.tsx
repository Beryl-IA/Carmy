// Écran de relecture / édition (F3). Rien n'est enregistré avant « Enregistrer ».
import { useEffect, useMemo, useState } from 'preact/hooks';
import { AISLE_LABELS } from '../format';
import {
  emptyIngredient, emptyStep, moveItem, normalizeTag, NUTRIENT_LABELS,
  type IngredientDraft, type RecipeDraft, type StepDraft,
} from '../model/draft';
import { AISLES, NUTRIENTS, TAG_SUGGESTIONS, UNITS, type Unit } from '../model/types';

const UNIT_OPTIONS: Record<Exclude<Unit, null>, string> = {
  g: 'g', kg: 'kg', ml: 'ml', cl: 'cl', l: 'l', c_cafe: 'c. à café', c_soupe: 'c. à soupe', piece: 'pièce(s)',
  pincee: 'pincée', gousse: 'gousse', tranche: 'tranche', sachet: 'sachet', boite: 'boîte', bouquet: 'bouquet',
};

interface Props {
  draft: RecipeDraft;
  onChange: (d: RecipeDraft) => void;
  onSave: () => void;
  onCancel: () => void;
  errors: string[];
  saving: boolean;
  /** Tags déjà utilisés dans la bibliothèque, proposés en suggestion. */
  knownTags: string[];
}

export function RecipeEditor({ draft, onChange, onSave, onCancel, errors, saving, knownTags }: Props) {
  const set = <K extends keyof RecipeDraft>(k: K, v: RecipeDraft[K]) => onChange({ ...draft, [k]: v });

  const thumbUrl = useMemo(() => (draft.thumbnail ? URL.createObjectURL(draft.thumbnail) : null), [draft.thumbnail]);
  useEffect(() => () => { if (thumbUrl) URL.revokeObjectURL(thumbUrl); }, [thumbUrl]);

  const setIngredient = (i: number, patch: Partial<IngredientDraft>) =>
    set('ingredients', draft.ingredients.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const setStep = (i: number, patch: Partial<StepDraft>) =>
    set('steps', draft.steps.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <form
      id="recipe-editor"
      class="editor stack"
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      {errors.length > 0 && <ErrorList errors={errors} />}
      {thumbUrl && (
        <div class="editor-thumb">
          <img src={thumbUrl} alt="Miniature" />
          <button type="button" class="btn small ghost" onClick={() => set('thumbnail', undefined)}>Retirer la miniature</button>
        </div>
      )}

      <section class="card stack">
        <label class="field">
          <span>Titre</span>
          <input type="text" value={draft.title} placeholder="Ex. : Curry de pois chiches" onInput={(e) => set('title', e.currentTarget.value)} />
        </label>
        <div class="grid3">
          <label class="field">
            <span>Portions</span>
            <input type="text" inputMode="numeric" value={draft.servings} onInput={(e) => set('servings', e.currentTarget.value)} />
          </label>
          <label class="field">
            <span>Prépa (min)</span>
            <input type="text" inputMode="numeric" value={draft.prepMinutes} placeholder="—" onInput={(e) => set('prepMinutes', e.currentTarget.value)} />
          </label>
          <label class="field">
            <span>Cuisson (min)</span>
            <input type="text" inputMode="numeric" value={draft.cookMinutes} placeholder="—" onInput={(e) => set('cookMinutes', e.currentTarget.value)} />
          </label>
        </div>
        <TagsEditor tags={draft.tags} onChange={(t) => set('tags', t)} knownTags={knownTags} />
        <label class="field">
          <span>Lien du post d'origine</span>
          <input type="url" inputMode="url" autocapitalize="off" placeholder="https://…" value={draft.sourceUrl} onInput={(e) => set('sourceUrl', e.currentTarget.value)} />
        </label>
      </section>

      <section class="card stack">
        <h2 class="card-title">Ingrédients</h2>
        {draft.ingredients.map((ing, i) => (
          <div key={ing.key} class="row-card">
            <input type="text" aria-label="Ingrédient" placeholder="ingrédient (ex. : oignon)" autocapitalize="off" value={ing.name} onInput={(e) => setIngredient(i, { name: e.currentTarget.value })} />
            <div class="ing-line">
              <input class="qty-input" type="text" inputMode="decimal" aria-label="Quantité" placeholder="Qté" value={ing.quantity} onInput={(e) => setIngredient(i, { quantity: e.currentTarget.value })} />
              <select class="unit-select" aria-label="Unité" value={ing.unit ?? ''} onChange={(e) => setIngredient(i, { unit: (e.currentTarget.value || null) as Unit })}>
                <option value="">—</option>
                {UNITS.map((u) => <option key={u} value={u}>{UNIT_OPTIONS[u]}</option>)}
              </select>
              <select class="grow" aria-label="Rayon" value={ing.aisle} onChange={(e) => setIngredient(i, { aisle: e.currentTarget.value as IngredientDraft['aisle'] })}>
                {AISLES.map((a) => <option key={a} value={a}>{AISLE_LABELS[a]}</option>)}
              </select>
            </div>
            <input type="text" aria-label="Note" placeholder="note (émincé, à température ambiante…)" value={ing.note} onInput={(e) => setIngredient(i, { note: e.currentTarget.value })} />
            <div class="row-actions">
              <label class="check compact">
                <input type="checkbox" checked={ing.optional} onChange={(e) => setIngredient(i, { optional: e.currentTarget.checked })} />
                <span>Facultatif</span>
              </label>
              <RowButtons
                index={i}
                count={draft.ingredients.length}
                label="l'ingrédient"
                onMove={(dir) => set('ingredients', moveItem(draft.ingredients, i, dir))}
                onDelete={() => set('ingredients', draft.ingredients.filter((_, j) => j !== i))}
              />
            </div>
          </div>
        ))}
        <button type="button" class="btn secondary" onClick={() => set('ingredients', [...draft.ingredients, emptyIngredient()])}>+ Ajouter un ingrédient</button>
      </section>

      <section class="card stack">
        <h2 class="card-title">Étapes</h2>
        {draft.steps.map((s, i) => (
          <div key={s.key} class="row-card">
            <label class="field">
              <span>Étape {i + 1}</span>
              <textarea rows={3} value={s.text} onInput={(e) => setStep(i, { text: e.currentTarget.value })} />
            </label>
            <div class="row-actions">
              <label class="timer-field">
                <span aria-hidden="true">⏱</span>
                <input type="text" inputMode="decimal" aria-label={`Minuteur de l'étape ${i + 1}, en minutes`} placeholder="—" value={s.timerMinutes} onInput={(e) => setStep(i, { timerMinutes: e.currentTarget.value })} />
                <span>min</span>
              </label>
              <RowButtons
                index={i}
                count={draft.steps.length}
                label="l'étape"
                onMove={(dir) => set('steps', moveItem(draft.steps, i, dir))}
                onDelete={() => set('steps', draft.steps.filter((_, j) => j !== i))}
              />
            </div>
          </div>
        ))}
        <button type="button" class="btn secondary" onClick={() => set('steps', [...draft.steps, emptyStep()])}>+ Ajouter une étape</button>
      </section>

      <section class="card stack">
        <h2 class="card-title">Conservation et nutrition</h2>
        <p class="muted small">Estimations de l'IA, à corriger si besoin. Laisse vide si tu ne sais pas.</p>
        <div class="grid2">
          <label class="field">
            <span>🧊 Frigo (jours)</span>
            <input type="text" inputMode="numeric" placeholder="—" value={draft.fridgeDays} onInput={(e) => set('fridgeDays', e.currentTarget.value)} />
          </label>
          <label class="field">
            <span>❄️ Congélateur (mois)</span>
            <input type="text" inputMode="numeric" placeholder="—" value={draft.freezerMonths} onInput={(e) => set('freezerMonths', e.currentTarget.value)} />
          </label>
        </div>
        <p class="muted small">Congélateur : 0 = congélation déconseillée.</p>
        <fieldset class="nutrition-fields">
          <legend>Pour 1 portion</legend>
          {NUTRIENTS.map((k) => (
            <label key={k} class="field">
              <span>{NUTRIENT_LABELS[k]} ({k === 'kcal' ? 'kcal' : 'g'})</span>
              <input type="text" inputMode="numeric" placeholder="—" value={draft.nutrition[k]} onInput={(e) => set('nutrition', { ...draft.nutrition, [k]: e.currentTarget.value })} />
            </label>
          ))}
        </fieldset>
      </section>

      <div class="savebar">
        {errors.length > 0 && <ErrorList errors={errors} />}
        <div class="row">
          <button type="button" class="btn ghost" onClick={onCancel} disabled={saving}>Annuler</button>
          <button type="submit" class="btn grow" disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
        </div>
      </div>
    </form>
  );
}

function ErrorList({ errors }: { errors: string[] }) {
  return (
    <ul class="errors" role="alert">
      {errors.map((e) => <li key={e}>{e}</li>)}
    </ul>
  );
}

function RowButtons({ index, count, label, onMove, onDelete }: {
  index: number; count: number; label: string; onMove: (dir: -1 | 1) => void; onDelete: () => void;
}) {
  return (
    <div class="row-buttons">
      <button type="button" class="icon-btn" aria-label={`Monter ${label}`} disabled={index === 0} onClick={() => onMove(-1)}>↑</button>
      <button type="button" class="icon-btn" aria-label={`Descendre ${label}`} disabled={index === count - 1} onClick={() => onMove(1)}>↓</button>
      <button type="button" class="icon-btn danger" aria-label={`Supprimer ${label}`} onClick={onDelete}>✕</button>
    </div>
  );
}

function TagsEditor({ tags, onChange, knownTags }: { tags: string[]; onChange: (t: string[]) => void; knownTags: string[] }) {
  const [input, setInput] = useState('');
  const add = (raw: string) => {
    const t = normalizeTag(raw);
    if (t && !tags.includes(t)) onChange([...tags, t]);
    setInput('');
  };
  const suggestions = [...new Set([...TAG_SUGGESTIONS, ...knownTags])].filter((t) => !tags.includes(t));

  return (
    <div class="field">
      <span>Tags</span>
      {tags.length > 0 && (
        <ul class="tags editable">
          {tags.map((t) => (
            <li key={t}>
              {t}
              <button type="button" aria-label={`Retirer le tag ${t}`} onClick={() => onChange(tags.filter((x) => x !== t))}>✕</button>
            </li>
          ))}
        </ul>
      )}
      <div class="row nowrap">
        <input
          class="grow"
          type="text"
          placeholder="Nouveau tag"
          value={input}
          enterKeyHint="done"
          onInput={(e) => setInput(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              add(input);
            }
          }}
        />
        <button type="button" class="btn small secondary" disabled={!input.trim()} onClick={() => add(input)}>Ajouter</button>
      </div>
      {suggestions.length > 0 && (
        <ul class="tags suggestions">
          {suggestions.map((t) => (
            <li key={t}><button type="button" onClick={() => add(t)}>+ {t}</button></li>
          ))}
        </ul>
      )}
    </div>
  );
}
