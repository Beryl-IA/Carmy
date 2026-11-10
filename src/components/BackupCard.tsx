// Sauvegarde / restauration (F8) : export vers la feuille de partage iOS (ou téléchargement), import avec aperçu.
import { useRef, useState } from 'preact/hooks';
import { exportAll, markBackupDone, writeAll } from '../db/db';
import { backupFileName, InvalidBackup, mergeData, parseBackup, toBackupFile, type AppData, type ImportMode } from '../model/backup';
import type { Settings } from '../model/types';

/** Prépare le fichier de sauvegarde (JSON). */
export async function prepareBackup(): Promise<File> {
  const now = new Date();
  const file = await toBackupFile(await exportAll(), now, __APP_VERSION__);
  return new File([JSON.stringify(file)], backupFileName(now), { type: 'application/json' });
}

export type ShareResult = 'partage' | 'telecharge' | 'annule' | 'geste_requis';

/** Ouvre la feuille de partage (Enregistrer dans Fichiers, iCloud…) ou télécharge le fichier. */
export async function shareBackup(file: File): Promise<ShareResult> {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: file.name });
      return 'partage';
    } catch (e) {
      const name = (e as DOMException)?.name;
      if (name === 'AbortError') return 'annule';
      // iOS exige un toucher récent : on proposera un second bouton.
      if (name === 'NotAllowedError') return 'geste_requis';
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'telecharge';
}

/** Bouton d'export réutilisable (Réglages et bannière de rappel). */
export function useExport(onDone: (s: Settings) => void) {
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<File | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const finish = async (r: ShareResult, file: File) => {
    if (r === 'geste_requis') {
      setPending(file);
      setMessage({ ok: true, text: 'Fichier prêt : touche « Partager la sauvegarde » pour l\'enregistrer.' });
      return;
    }
    setPending(null);
    if (r === 'annule') {
      setMessage({ ok: false, text: 'Sauvegarde annulée.' });
      return;
    }
    onDone(await markBackupDone(Date.now()));
    setMessage({ ok: true, text: r === 'partage' ? 'Sauvegarde partagée. Range-la dans Fichiers ou iCloud Drive.' : `Fichier ${file.name} téléchargé.` });
  };

  const run = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const file = pending ?? (await prepareBackup());
      await finish(await shareBackup(file), file);
    } catch (e) {
      setMessage({ ok: false, text: `Export impossible : ${String(e)}` });
    } finally {
      setBusy(false);
    }
  };
  return { run, busy, pending, message };
}

interface Props {
  settings: Settings;
  onSettings: (s: Settings) => void;
  onImported: () => void;
}

export function BackupCard({ settings, onSettings, onImported }: Props) {
  const exp = useExport(onSettings);
  const inputRef = useRef<HTMLInputElement>(null);
  const [incoming, setIncoming] = useState<(AppData & { exportedAt: string }) | null>(null);
  const [current, setCurrent] = useState<AppData | null>(null);
  const [mode, setMode] = useState<ImportMode>('fusionner');
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [importing, setImporting] = useState(false);

  async function onFile(f: File | null) {
    setImportMsg(null);
    setIncoming(null);
    if (!f) return;
    try {
      const data = parseBackup(await f.text());
      setCurrent(await exportAll());
      setIncoming(data);
      setMode('fusionner');
    } catch (e) {
      setImportMsg({ ok: false, text: e instanceof InvalidBackup ? e.message : `Lecture impossible : ${String(e)}` });
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function apply() {
    if (!incoming || !current) return;
    if (mode === 'remplacer' && !confirm(`Remplacer toutes tes données (${current.recipes.length} recettes) par celles de la sauvegarde ? C'est définitif.`)) return;
    setImporting(true);
    try {
      const merged = mergeData(current, incoming, mode);
      await writeAll(merged);
      setImportMsg({ ok: true, text: `Import terminé : ${merged.recipes.length} recette${merged.recipes.length > 1 ? 's' : ''} dans la bibliothèque.` });
      setIncoming(null);
      onImported();
    } catch (e) {
      setImportMsg({ ok: false, text: `Import impossible : ${String(e)}` });
    } finally {
      setImporting(false);
    }
  }

  const known = new Set(current?.recipes.map((r) => r.id));
  const newCount = incoming?.recipes.filter((r) => !known.has(r.id)).length ?? 0;
  const last = settings.lastBackupAt ? new Date(settings.lastBackupAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : null;

  return (
    <section class="card stack" id="sauvegarde">
      <h2 class="card-title">Sauvegarde</h2>
      <p class="muted small">
        Un fichier unique avec tes recettes (miniatures comprises), collections, garde-manger, réglages et liste de courses.
        La clé API n'y figure jamais. {last ? `Dernière sauvegarde : ${last}.` : 'Aucune sauvegarde pour l\'instant.'}
      </p>
      <button type="button" class="btn" disabled={exp.busy} onClick={() => void exp.run()}>
        {exp.busy ? 'Préparation…' : exp.pending ? 'Partager la sauvegarde' : 'Exporter une sauvegarde'}
      </button>
      {exp.message && <p class={exp.message.ok ? 'ok small' : 'error small'} role="status">{exp.message.text}</p>}

      <label class="btn secondary file-btn">
        Importer une sauvegarde…
        <input ref={inputRef} type="file" accept="application/json,.json" onChange={(e) => void onFile(e.currentTarget.files?.[0] ?? null)} />
      </label>
      {importMsg && <p class={importMsg.ok ? 'ok small' : 'error small'} role="status">{importMsg.text}</p>}

      {incoming && current && (
        <div class="preview">
          <strong>
            Sauvegarde du {incoming.exportedAt ? new Date(incoming.exportedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '?'}
          </strong>
          <span class="small">
            {incoming.recipes.length} recette{incoming.recipes.length > 1 ? 's' : ''} (dont {newCount} absente{newCount > 1 ? 's' : ''} de cet appareil) ·{' '}
            {incoming.collections.length} collection{incoming.collections.length > 1 ? 's' : ''} · {incoming.pantry.length} au garde-manger
          </span>
          <label class="radio">
            <input type="radio" name="mode" checked={mode === 'fusionner'} onChange={() => setMode('fusionner')} />
            <span><strong>Fusionner</strong><br /><span class="muted small">Ajoute ce qui manque ; pour une même recette, garde la version modifiée le plus récemment. Tes réglages et ta liste de courses ne changent pas.</span></span>
          </label>
          <label class="radio">
            <input type="radio" name="mode" checked={mode === 'remplacer'} onChange={() => setMode('remplacer')} />
            <span><strong>Remplacer</strong><br /><span class="muted small">Efface les {current.recipes.length} recettes actuelles et restaure exactement la sauvegarde (sauf la clé API).</span></span>
          </label>
          <div class="row nowrap">
            <button type="button" class="btn ghost" onClick={() => setIncoming(null)}>Annuler</button>
            <button type="button" class={`btn grow ${mode === 'remplacer' ? 'danger-bg' : ''}`} disabled={importing} onClick={() => void apply()}>
              {importing ? 'Import…' : mode === 'remplacer' ? 'Remplacer mes données' : 'Fusionner'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
