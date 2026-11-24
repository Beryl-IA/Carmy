// 1.9.0 — Scanner un ticket de caisse ou une commande drive : photos ou captures → lecture par Gemini → relecture → stock.
import { useEffect, useRef, useState } from 'preact/hooks';
import { GeminiProvider } from '../extraction/gemini';
import { ExtractionError, type ExtractionPhase } from '../extraction/types';
import { AISLE_LABELS, formatDuration } from '../format';
import { MAX_CAPTURES, RECEIPT_MAX_SIDE, prepareCapture } from '../media/image';
import { numberToInput, parseQuantity } from '../model/draft';
import { knownProductNames, receiptEntries, receiptLines, stockMatch, type ReceiptLine } from '../model/receipt';
import type { StockEntry, StockItem } from '../model/stock';
import { AISLES, UNITS, type Aisle, type PantryItem, type Recipe, type Settings, type Unit } from '../model/types';

const UNIT_OPTIONS: Record<Exclude<Unit, null>, string> = {
  g: 'g', kg: 'kg', ml: 'ml', cl: 'cl', l: 'l', c_cafe: 'c. à café', c_soupe: 'c. à soupe', piece: 'pièce(s)',
  pincee: 'pincée', gousse: 'gousse', tranche: 'tranche', sachet: 'sachet', boite: 'boîte', bouquet: 'bouquet',
};
const PHASE_LABELS: Record<ExtractionPhase, string> = {
  envoi: 'Envoi…', traitement: 'Traitement par Google…', analyse: 'Lecture du ticket…', mise_en_forme: 'Mise en forme…',
};
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `r${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`);

interface Shot {
  key: string;
  blob: Blob;
  url: string;
}
/** Ligne de relecture avec la quantité telle que saisie. */
type Row = ReceiptLine & { qtyText: string };

type Stage =
  | { kind: 'pick' }
  | { kind: 'running'; phase: ExtractionPhase; chars?: number; retry?: { attempt: number; total: number } }
  | { kind: 'error'; error: ExtractionError }
  | { kind: 'none' }
  | { kind: 'review'; rows: Row[]; ignored: number };

interface Props {
  settings: Settings;
  stock: StockItem[];
  recipes: Recipe[];
  pantry: PantryItem[];
  /** Ajoute les produits validés au stock. */
  onAdd: (entries: StockEntry[]) => void;
  onClose: () => void;
}

export function ReceiptScanner({ settings, stock, recipes, pantry, onAdd, onClose }: Props) {
  const [shots, setShots] = useState<Shot[]>([]);
  const [preparing, setPreparing] = useState(0);
  const [stage, setStage] = useState<Stage>({ kind: 'pick' });
  const [error, setError] = useState('');
  const [online, setOnline] = useState(navigator.onLine);
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const abortRef = useRef<AbortController | null>(null);
  const shotsRef = useRef<Shot[]>([]);
  shotsRef.current = shots;

  const aiReady = Boolean(settings.apiKey && settings.model);
  const toulouse = Boolean(settings.toulouse);
  const running = stage.kind === 'running';

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
      abortRef.current?.abort();
      shotsRef.current.forEach((s) => URL.revokeObjectURL(s.url));
    };
  }, []);

  useEffect(() => {
    if (!running) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [running]);

  async function onPick(list: FileList | null) {
    const files = [...(list ?? [])].slice(0, Math.max(0, MAX_CAPTURES - shots.length));
    if (!files.length) return;
    setStage({ kind: 'pick' });
    setPreparing(files.length);
    const added: Shot[] = [];
    for (const f of files) {
      const blob = await prepareCapture(f, RECEIPT_MAX_SIDE);
      added.push({ key: newId(), blob, url: URL.createObjectURL(blob) });
      setPreparing((n) => n - 1);
    }
    setPreparing(0);
    setShots((prev) => [...prev, ...added]);
  }

  function removeShot(key: string) {
    const s = shots.find((x) => x.key === key);
    if (s) URL.revokeObjectURL(s.url);
    setShots(shots.filter((x) => x.key !== key));
  }

  async function read() {
    if (!shots.length) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setError('');
    setStartedAt(Date.now());
    setNow(Date.now());
    setStage({ kind: 'running', phase: 'envoi' });
    try {
      const provider = new GeminiProvider({ apiKey: (settings.apiKey ?? '').trim(), model: settings.model, forceFilesApi: settings.forceFilesApi });
      const result = await provider.extractReceipt(shots.map((s) => s.blob), knownProductNames(stock, recipes, pantry), {
        signal: controller.signal,
        onPhase: (phase) => setStage({ kind: 'running', phase }),
        onReceive: (chars) => setStage({ kind: 'running', phase: 'analyse', chars }),
        onRetry: (attempt, total) => setStage({ kind: 'running', phase: 'analyse', retry: { attempt, total } }),
      });
      if (!result.isReceipt) return setStage({ kind: 'none' });
      const rows = receiptLines(result.items, newId).map((l) => ({ ...l, qtyText: numberToInput(l.quantity) }));
      setStage({ kind: 'review', rows, ignored: result.warnings.filter((w) => w.includes('ignoré')).length });
    } catch (e) {
      const err = e instanceof ExtractionError ? e : new ExtractionError('api', 'Erreur inattendue.', String(e));
      setStage(err.kind === 'annule' ? { kind: 'pick' } : { kind: 'error', error: err });
    } finally {
      abortRef.current = null;
    }
  }

  // ---------- Relecture ----------
  if (stage.kind === 'review') {
    const rows = stage.rows;
    const update = (id: string, patch: Partial<Row>) =>
      setStage({ ...stage, rows: rows.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
    const count = rows.filter((r) => r.checked && r.name.trim()).length;
    const allOn = rows.every((r) => r.checked);
    const submit = () => {
      const bad = rows.find((r) => r.checked && parseQuantity(r.qtyText) === undefined);
      if (bad) return setError(`Quantité illisible pour « ${bad.name || bad.label} » (exemples : 2, 1,5, 1/2).`);
      const entries = receiptEntries(rows.map((r) => {
        const quantity = parseQuantity(r.qtyText) ?? null;
        return { ...r, quantity, unit: quantity === null ? null : r.unit ?? 'piece' };
      }));
      if (!entries.length) return;
      onAdd(entries);
    };
    return (
      <section class="card stack receipt" aria-label="Produits lus sur le ticket">
        <h2 class="card-title">📷 Produits du ticket</h2>
        <p class="hint">
          Vérifie la liste : décoche ce que tu ne ranges pas, corrige un nom ou une quantité. Rien n'est ajouté tant que tu n'as pas touché « Ajouter ».
        </p>
        <p class="muted small">
          Déjà coché ces articles dans Courses ? Ils sont déjà dans le stock : décoche-les ici pour ne pas les compter deux fois.
        </p>
        <div class="row between">
          <span class="small muted">{rows.length} produit{rows.length > 1 ? 's' : ''} lu{rows.length > 1 ? 's' : ''}{stage.ignored > 0 && ` · ${stage.ignored} ligne${stage.ignored > 1 ? 's' : ''} illisible${stage.ignored > 1 ? 's' : ''}`}</span>
          <button type="button" class="link-btn small" onClick={() => setStage({ ...stage, rows: rows.map((r) => ({ ...r, checked: !allOn })) })}>
            {allOn ? 'Tout décocher' : 'Tout cocher'}
          </button>
        </div>
        <ul class="receipt-lines">
          {rows.map((r) => {
            const q = parseQuantity(r.qtyText);
            const match = q === undefined ? null : stockMatch(stock, r.name, q, q === null ? null : r.unit ?? 'piece');
            return (
              <li key={r.id} class={`row-card receipt-line ${r.checked ? '' : 'off'}`}>
                <div class="receipt-head">
                  <input type="checkbox" class="receipt-check" checked={r.checked} aria-label={`Ranger ${r.name || r.label} dans le stock`}
                    onChange={(e) => update(r.id, { checked: e.currentTarget.checked })} />
                  <input type="text" class="grow" aria-label="Produit" autocapitalize="off" value={r.name}
                    onInput={(e) => update(r.id, { name: e.currentTarget.value })} />
                </div>
                <div class="ing-line">
                  <input class="qty-input" type="text" inputMode="decimal" aria-label={`Quantité de ${r.name}`} placeholder="Qté" value={r.qtyText}
                    onInput={(e) => update(r.id, { qtyText: e.currentTarget.value })} />
                  <select class="unit-select" aria-label={`Unité de ${r.name}`} value={r.unit ?? ''}
                    onChange={(e) => update(r.id, { unit: (e.currentTarget.value || null) as Unit })}>
                    <option value="">—</option>
                    {UNITS.map((u) => <option key={u} value={u}>{UNIT_OPTIONS[u]}</option>)}
                  </select>
                  <select class="grow" aria-label={`Rayon de ${r.name}`} value={r.aisle} onChange={(e) => update(r.id, { aisle: e.currentTarget.value as Aisle })}>
                    {AISLES.map((a) => <option key={a} value={a}>{AISLE_LABELS[a]}</option>)}
                  </select>
                </div>
                <span class="muted small receipt-label">
                  🧾 {r.label}
                  {!r.food && ' · non alimentaire'}
                  {r.checked && match === 'cumul' && ' · s\'ajoute au stock existant'}
                  {r.checked && match === 'autre_unite' && ' · déjà en stock dans une autre unité : ajouté à part'}
                  {q === null && r.checked && ' · sans quantité (« en stock »)'}
                </span>
              </li>
            );
          })}
        </ul>
        {error && <p class="error small" role="alert">{error}</p>}
        <div class="row">
          <button type="button" class="btn ghost" onClick={() => { if (confirm('Abandonner ce ticket ? Rien ne sera ajouté au stock.')) onClose(); }}>Annuler</button>
          <button type="button" class="btn grow" disabled={count === 0} onClick={submit}>
            Ajouter {count} produit{count > 1 ? 's' : ''} au stock
          </button>
        </div>
      </section>
    );
  }

  // ---------- Photos ----------
  const elapsed = formatDuration(Math.max(0, Math.round((now - startedAt) / 1000)));
  const full = shots.length >= MAX_CAPTURES;
  return (
    <section class="card stack receipt" aria-label="Scanner un ticket">
      <div class="receipt-top">
        <h2 class="card-title grow">📷 Ticket ou commande drive</h2>
        {!running && <button type="button" class="icon-btn" aria-label="Fermer le scanner" onClick={onClose}>✕</button>}
      </div>
      {toulouse ? (
        <p class="warn-text small">📍 Mode Toulouse actif : le stock n'est pas modifié. Désactive-le pour ranger un ticket.</p>
      ) : (
        <>
          <p class="muted small">
            Photographie ton ticket de caisse bien à plat (en plusieurs photos s'il est long), ou fais des captures de ta commande drive. L'IA lit les produits, tu vérifies, puis ils rejoignent le stock.
          </p>

          {shots.length > 0 && (
            <ol class="receipt-shots" aria-label="Images du ticket">
              {shots.map((s, i) => (
                <li key={s.key}>
                  <img src={s.url} alt={`Image ${i + 1} du ticket`} />
                  <span class="capture-num" aria-hidden="true">{i + 1}</span>
                  <button type="button" class="icon-btn danger" aria-label={`Retirer l'image ${i + 1}`} disabled={running} onClick={() => removeShot(s.key)}>✕</button>
                </li>
              ))}
            </ol>
          )}

          {preparing > 0 ? (
            <p class="progress" role="status"><span class="spinner" aria-hidden="true" /> Préparation des images ({preparing})…</p>
          ) : !full && !running ? (
            <div class="receipt-pickers">
              <label class="btn secondary picker-btn">
                <input type="file" accept="image/*" capture="environment" onChange={(e) => { void onPick(e.currentTarget.files); e.currentTarget.value = ''; }} />
                📷 {shots.length ? 'Autre photo' : 'Photo'}
              </label>
              <label class="btn secondary picker-btn">
                <input type="file" accept="image/*" multiple onChange={(e) => { void onPick(e.currentTarget.files); e.currentTarget.value = ''; }} />
                🖼️ {shots.length ? 'Autres captures' : 'Captures'}
              </label>
            </div>
          ) : full && !running ? (
            <p class="muted small">Maximum {MAX_CAPTURES} images par ticket.</p>
          ) : null}

          {running ? (
            <div class="stack">
              <div class="progress" role="status">
                <span class="spinner" aria-hidden="true" />
                <span>
                  {stage.retry
                    ? `Google est très sollicité : nouvelle tentative (${stage.retry.attempt}/${stage.retry.total})…`
                    : stage.chars ? `Réception de la réponse (${stage.chars} caractères)…` : PHASE_LABELS[stage.phase]} <span class="muted">{elapsed}</span>
                </span>
                <button type="button" class="btn small ghost" onClick={() => abortRef.current?.abort()}>Annuler</button>
              </div>
              <p class="muted small">Reste sur cet écran pendant la lecture : si tu changes d'appli ou d'onglet, elle s'arrête.</p>
            </div>
          ) : (
            <>
              {!aiReady && <p class="muted small">Pour lire un ticket, ajoute d'abord ta clé dans <a href="#/reglages">Réglages</a>.</p>}
              {!online && <p class="warn-text small">Hors-ligne : la lecture du ticket nécessite Internet.</p>}
              <button type="button" class="btn" disabled={!aiReady || !online || preparing > 0 || !shots.length} onClick={() => void read()}>
                Lire le ticket
              </button>
            </>
          )}

          {stage.kind === 'error' && (
            <div class="error-card stack" role="alert">
              <p class="error"><strong>Échec de la lecture.</strong> {stage.error.message}</p>
              {stage.error.detail && (
                <details>
                  <summary>Détail technique</summary>
                  <pre>{stage.error.detail}</pre>
                </details>
              )}
            </div>
          )}
          {stage.kind === 'none' && (
            <p class="warn-text small" role="status">
              🤔 Aucun ticket ni commande reconnu sur {shots.length > 1 ? 'ces images' : 'cette image'}. Essaie une photo plus nette, bien éclairée et à plat.
            </p>
          )}
        </>
      )}
    </section>
  );
}

