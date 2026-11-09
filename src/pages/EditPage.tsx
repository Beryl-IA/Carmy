// Modification d'une recette existante, avec le même écran que la relecture.
import { useEffect, useState } from 'preact/hooks';
import { RecipeEditor } from '../components/RecipeEditor';
import { getRecipe, listRecipes, saveRecipe } from '../db/db';
import { draftFromRecipe, draftToRecipe, type RecipeDraft } from '../model/draft';
import { navigate } from '../router';

export function EditPage({ id, onSaved }: { id: string; onSaved: () => void }) {
  const [draft, setDraft] = useState<RecipeDraft | null | undefined>(undefined);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [knownTags, setKnownTags] = useState<string[]>([]);

  useEffect(() => {
    void getRecipe(id).then((r) => setDraft(r ? draftFromRecipe(r) : null));
    void listRecipes().then((rs) => setKnownTags([...new Set(rs.flatMap((r) => r.tags))].sort()));
  }, [id]);

  const back = () => navigate({ name: 'recette', id });

  async function save() {
    if (!draft) return;
    const result = draftToRecipe(draft, Date.now(), () => id);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setSaving(true);
    try {
      // Les collections ont pu changer pendant l'édition : on garde l'état stocké.
      const current = await getRecipe(id);
      await saveRecipe({ ...result.recipe, collectionIds: current?.collectionIds ?? result.recipe.collectionIds });
      onSaved();
      back();
    } catch (e) {
      setErrors([`Enregistrement impossible : ${String(e)}`]);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main class="page stack">
      <header class="page-header">
        <h1>Modifier</h1>
        {draft && <button type="submit" form="recipe-editor" class="btn small header-action" disabled={saving}>Enregistrer</button>}
      </header>
      {draft === null && <p class="muted">Cette recette n'existe plus. <a href="#/recettes">Retour</a></p>}
      {draft && (
        <RecipeEditor
          draft={draft}
          onChange={(d) => {
            setDraft(d);
            setDirty(true);
          }}
          onSave={() => void save()}
          onCancel={() => {
            if (!dirty || confirm('Abandonner les modifications ?')) back();
          }}
          errors={errors}
          saving={saving}
          knownTags={knownTags}
        />
      )}
    </main>
  );
}
