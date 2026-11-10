// Implémentation Gemini de ExtractionProvider (F2), appelée directement depuis le navigateur.
import { RESPONSE_SCHEMA, SYSTEM_INSTRUCTION, USER_PROMPT_TEXT, USER_PROMPT_VIDEO, userPromptImages } from './prompt';
import {
  ExtractionError,
  type ExtractionInput,
  type ExtractionOptions,
  type ExtractionPhase,
  type ExtractionProvider,
  type ExtractionReport,
} from './types';
import { InvalidRecipeJson, parseExtractedRecipe } from './validate';

const API = 'https://generativelanguage.googleapis.com';

/** En dessous de ce poids, la vidéo est envoyée en ligne (base64, limite de requête ~20 Mo). */
export const INLINE_MAX_BYTES = 14 * 1024 * 1024;

export interface GeminiConfig {
  apiKey: string;
  model: string;
  /** Pour tester R1 : forcer la Files API même pour une petite vidéo. */
  forceFilesApi?: boolean;
  /** Analyse rapide : vidéo lue en basse résolution par Gemini (moins de jetons, plus rapide). */
  fastMode?: boolean;
}

interface Part {
  text?: string;
  inlineData?: { mimeType: string; data: string };
  fileData?: { mimeType: string; fileUri: string };
}

interface GeminiFile {
  name: string;
  uri: string;
  mimeType: string;
  state?: 'PROCESSING' | 'ACTIVE' | 'FAILED' | 'STATE_UNSPECIFIED';
  error?: { message?: string };
}

/** Types MIME acceptés par Gemini ; iOS fournit souvent video/quicktime (.mov). */
export function geminiVideoMime(file: Blob, fileName?: string): string {
  const type = file.type.toLowerCase();
  if (type === 'video/quicktime') return 'video/mov';
  if (type.startsWith('video/')) return type;
  const ext = fileName?.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'mov': return 'video/mov';
    case 'webm': return 'video/webm';
    case '3gp': return 'video/3gpp';
    case 'mpeg': case 'mpg': return 'video/mpeg';
    default: return 'video/mp4';
  }
}

/** Types d'image acceptés par Gemini ; les captures sont normalement déjà recompressées en JPEG. */
export function geminiImageMime(file: Blob): string {
  const type = file.type.toLowerCase();
  return ['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif'].includes(type) ? type : 'image/jpeg';
}

function headers(apiKey: string, extra: Record<string, string> = {}): Record<string, string> {
  return { 'x-goog-api-key': apiKey, ...extra };
}

/** Durées maximales par étape : sans elles, une requête coupée par iOS peut attendre indéfiniment. */
export const TIMEOUTS_MS = { court: 30_000, envoi: 5 * 60_000, analyse: 8 * 60_000 } as const;

function withTimeout(signal: AbortSignal | null | undefined, ms: number): AbortSignal {
  const t = AbortSignal.timeout(ms);
  return signal && typeof AbortSignal.any === 'function' ? AbortSignal.any([signal, t]) : (signal ?? t);
}

async function call(input: string, init: RequestInit, step: string, timeoutMs: number = TIMEOUTS_MS.court): Promise<Response> {
  let res: Response;
  const signal = withTimeout(init.signal, timeoutMs);
  try {
    res = await fetch(input, { ...init, signal });
  } catch (e) {
    if (init.signal?.aborted) throw new ExtractionError('annule', 'Extraction annulée.');
    if (signal.aborted)
      throw new ExtractionError(
        'reseau',
        `Pas de réponse de Google après ${Math.round(timeoutMs / 60_000) || 1} min (${step}). Garde l'appli ouverte pendant l'analyse, puis réessaie.`,
        `${step} — délai dépassé (${timeoutMs} ms)`,
      );
    // Sur Safari, une erreur CORS ressemble à une erreur réseau : on précise l'étape (risque R1).
    throw new ExtractionError('reseau', `Erreur réseau pendant : ${step}. Vérifie ta connexion.`, `${step} — ${String(e)}`);
  }
  if (!res.ok) throw await httpError(res, step);
  return res;
}

async function httpError(res: Response, step: string): Promise<ExtractionError> {
  let detail = '';
  try {
    detail = await res.text();
  } catch { /* ignore */ }
  let apiMessage = '';
  try {
    apiMessage = (JSON.parse(detail) as { error?: { message?: string } }).error?.message ?? '';
  } catch { /* ignore */ }
  const info = `${step} — HTTP ${res.status} ${apiMessage || detail.slice(0, 300)}`;
  if (res.status === 429) return new ExtractionError('quota', 'Quota gratuit atteint. Réessaie plus tard (le quota journalier se réinitialise chaque jour).', info);
  if (res.status === 401 || res.status === 403 || (res.status === 400 && /api key/i.test(apiMessage)))
    return new ExtractionError('cle', 'Clé API refusée. Vérifie-la dans les réglages.', info);
  if (res.status === 413) return new ExtractionError('trop_gros', 'Vidéo trop lourde pour l\'API.', info);
  if (res.status === 404) return new ExtractionError('api', `Modèle ou ressource introuvable (${apiMessage || 'HTTP 404'}). Vérifie le modèle choisi.`, info);
  return new ExtractionError('api', `Erreur de l'API (${res.status}) : ${apiMessage || 'réponse inattendue'}`, info);
}

/** Lit un Blob en base64 sans construire de chaîne intermédiaire en JS (meilleur pour la mémoire iOS). */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = reader.result as string;
      resolve(url.slice(url.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Lecture du fichier impossible'));
    reader.readAsDataURL(blob);
  });
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new ExtractionError('annule', 'Extraction annulée.'));
    }, { once: true });
  });

export class GeminiProvider implements ExtractionProvider {
  readonly id = 'gemini';

  /** Modèle effectivement utilisé (peut changer si Google en suggère un autre). */
  private model: string;

  constructor(private readonly config: GeminiConfig) {
    this.model = config.model;
    this.lowResolution = config.fastMode ?? true;
    if (!config.apiKey) throw new ExtractionError('cle', 'Aucune clé API. Ajoute-la dans les réglages.');
    if (!config.model) throw new ExtractionError('api', 'Aucun modèle choisi dans les réglages.');
  }

  async extract(input: ExtractionInput, options: ExtractionOptions = {}): Promise<ExtractionReport> {
    const { onPhase, signal } = options;
    this.onReceive = options.onReceive;
    const durations: Partial<Record<ExtractionPhase, number>> = {};
    let phaseStart = performance.now();
    let current: ExtractionPhase | null = null;
    const phase = (p: ExtractionPhase) => {
      const now = performance.now();
      if (current) durations[current] = Math.round(now - phaseStart);
      current = p;
      phaseStart = now;
      onPhase?.(p);
    };

    const uploaded: GeminiFile[] = [];
    // L'analyse basse résolution ne concerne que la vidéo : sur une capture, elle rendrait le texte illisible.
    this.mediaIsVideo = input.kind === 'video';
    let transport: ExtractionReport['meta']['transport'] = 'text';
    let bytes: number | undefined;
    const parts: Part[] = [];

    try {
      if (input.kind === 'video') {
        bytes = input.file.size;
        const mimeType = geminiVideoMime(input.file, input.fileName);
        phase('envoi');
        if (!this.config.forceFilesApi && input.file.size <= INLINE_MAX_BYTES) {
          transport = 'inline';
          parts.push({ inlineData: { mimeType, data: await blobToBase64(input.file) } });
        } else {
          transport = 'files_api';
          const sent = await this.uploadResumable(input.file, mimeType, input.fileName, signal);
          uploaded.push(sent);
          phase('traitement');
          const active = await this.waitActive(sent, signal);
          parts.push({ fileData: { mimeType: active.mimeType || mimeType, fileUri: active.uri } });
        }
        parts.push({ text: USER_PROMPT_VIDEO });
      } else if (input.kind === 'images') {
        if (input.files.length === 0) throw new ExtractionError('api', 'Aucune capture à analyser.');
        bytes = input.files.reduce((n, f) => n + f.size, 0);
        phase('envoi');
        const many = input.files.length > 1;
        if (!this.config.forceFilesApi && bytes <= INLINE_MAX_BYTES) {
          transport = 'inline';
          for (const [i, f] of input.files.entries()) {
            if (many) parts.push({ text: `Capture ${i + 1} :` });
            parts.push({ inlineData: { mimeType: geminiImageMime(f), data: await blobToBase64(f) } });
          }
        } else {
          transport = 'files_api';
          for (const [i, f] of input.files.entries())
            uploaded.push(await this.uploadResumable(f, geminiImageMime(f), `capture-${i + 1}`, signal));
          phase('traitement');
          for (const [i, f] of uploaded.entries()) {
            const active = await this.waitActive(f, signal);
            if (many) parts.push({ text: `Capture ${i + 1} :` });
            parts.push({ fileData: { mimeType: active.mimeType || 'image/jpeg', fileUri: active.uri } });
          }
        }
        parts.push({ text: userPromptImages(input.files.length) });
      } else {
        parts.push({ text: USER_PROMPT_TEXT + input.text });
      }

      // Une nouvelle tentative si le JSON est invalide (§8), puis erreur.
      let attempts = 0;
      let lastError: InvalidRecipeJson | null = null;
      while (attempts < 2) {
        attempts++;
        phase('analyse');
        const { text, totalTokens } = await this.generate(parts, signal);
        phase('mise_en_forme');
        try {
          const { recipe, warnings } = parseExtractedRecipe(text);
          const now = performance.now();
          durations.mise_en_forme = Math.round(now - phaseStart);
          return {
            recipe,
            warnings,
            meta: { provider: this.id, model: this.model, transport, bytes, durationsMs: durations, fastMode: this.lowResolution && this.mediaIsVideo, totalTokens, attempts, rawJson: text },
          };
        } catch (e) {
          if (!(e instanceof InvalidRecipeJson)) throw e;
          lastError = e;
        }
      }
      throw new ExtractionError('reponse_invalide', `Réponse de l'IA inexploitable après 2 essais : ${lastError?.message ?? ''}`);
    } catch (e) {
      // Joint au diagnostic les durées des étapes atteintes, y compris celle en cours.
      if (e instanceof ExtractionError) {
        const cur = current as ExtractionPhase | null; // assigné dans la closure `phase`
        if (cur) durations[cur] = Math.round(performance.now() - phaseStart);
        e.durationsMs = durations;
      }
      throw e;
    } finally {
      for (const f of uploaded) void this.deleteFile(f.name);
    }
  }

  /** Si Google refuse le modèle en suggérant un remplaçant, bascule une fois dessus. */
  private async generate(parts: Part[], signal?: AbortSignal): Promise<{ text: string; totalTokens?: number }> {
    try {
      return await this.generateOnce(parts, signal);
    } catch (e) {
      const suggested = e instanceof ExtractionError ? suggestedModel(e.detail) : null;
      if (!suggested || suggested === this.model) throw e;
      this.model = suggested;
      return this.generateOnce(parts, signal);
    }
  }

  /** Réglages d'accélération ; chacun est retiré si le modèle le refuse (HTTP 400). */
  private lowThinking = true;
  private lowResolution: boolean;
  private mediaIsVideo = false;
  private onReceive?: (chars: number) => void;

  private async generateOnce(parts: Part[], signal?: AbortSignal): Promise<{ text: string; totalTokens?: number }> {
    for (;;) {
      try {
        return await this.generateRequest(parts, signal);
      } catch (e) {
        const d = e instanceof ExtractionError && /HTTP 400/.test(e.detail ?? '') ? e.detail ?? '' : '';
        if (this.lowThinking && /thinking/i.test(d)) { this.lowThinking = false; continue; }
        if (this.lowResolution && this.mediaIsVideo && /resolution/i.test(d)) { this.lowResolution = false; continue; }
        throw e;
      }
    }
  }

  /** Réponse en flux (SSE) : on voit arriver le texte, ce qui distingue « Google réfléchit » de « bloqué ». */
  private async generateRequest(parts: Part[], signal?: AbortSignal): Promise<{ text: string; totalTokens?: number }> {
    const body = {
      systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
      contents: [{ role: 'user', parts }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
        temperature: 0.2,
        ...(this.lowThinking ? { thinkingConfig: { thinkingLevel: 'low' } } : {}),
        ...(this.lowResolution && this.mediaIsVideo ? { mediaResolution: 'MEDIA_RESOLUTION_LOW' } : {}),
      },
    };
    const res = await call(
      `${API}/v1beta/models/${encodeURIComponent(this.model)}:streamGenerateContent?alt=sse`,
      { method: 'POST', headers: headers(this.config.apiKey, { 'Content-Type': 'application/json' }), body: JSON.stringify(body), signal },
      'analyse par l\'IA (generateContent)',
      TIMEOUTS_MS.analyse,
    );
    const acc = new SseAccumulator();
    try {
      if (res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          acc.push(decoder.decode(value, { stream: true }));
          this.onReceive?.(acc.text.length);
        }
        acc.push(decoder.decode());
      } else {
        acc.push(await res.text());
      }
      acc.flush();
    } catch (e) {
      if (signal?.aborted) throw new ExtractionError('annule', 'Extraction annulée.');
      throw new ExtractionError(
        'reseau',
        `La réponse de Google a été interrompue${acc.text ? ' en cours de route' : ''}. Garde l'appli ouverte, puis réessaie.`,
        `réception du flux — ${String(e)} — ${acc.text.length} caractères reçus`,
      );
    }
    if (acc.blockReason) throw new ExtractionError('api', `Contenu bloqué par l'IA (${acc.blockReason}).`);
    if (acc.error) throw new ExtractionError('api', `Erreur de l'API : ${acc.error}`, acc.error);
    if (!acc.text) throw new ExtractionError('api', `Réponse vide de l'IA (${acc.finishReason ?? 'raison inconnue'}).`);
    return { text: acc.text, totalTokens: acc.totalTokens };
  }

  /** Files API, protocole « resumable » : start → upload+finalize. */
  private async uploadResumable(file: Blob, mimeType: string, fileName: string | undefined, signal?: AbortSignal): Promise<GeminiFile> {
    const start = await call(
      `${API}/upload/v1beta/files`,
      {
        method: 'POST',
        headers: headers(this.config.apiKey, {
          'X-Goog-Upload-Protocol': 'resumable',
          'X-Goog-Upload-Command': 'start',
          'X-Goog-Upload-Header-Content-Length': String(file.size),
          'X-Goog-Upload-Header-Content-Type': mimeType,
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({ file: { display_name: fileName ?? 'video' } }),
        signal,
      },
      'Files API : ouverture de l\'envoi',
    );
    const uploadUrl = start.headers.get('x-goog-upload-url');
    if (!uploadUrl)
      throw new ExtractionError('api', 'Files API : adresse d\'envoi non lisible depuis le navigateur (en-tête bloqué par CORS ?).', 'x-goog-upload-url absent — risque R1');

    const res = await call(
      uploadUrl,
      {
        method: 'POST',
        headers: { 'X-Goog-Upload-Command': 'upload, finalize', 'X-Goog-Upload-Offset': '0' },
        body: file,
        signal,
      },
      'Files API : envoi de la vidéo',
      TIMEOUTS_MS.envoi,
    );
    const json = (await res.json()) as { file?: GeminiFile };
    if (!json.file?.name || !json.file.uri) throw new ExtractionError('api', 'Files API : réponse d\'envoi inattendue.');
    return json.file;
  }

  private async waitActive(file: GeminiFile, signal?: AbortSignal): Promise<GeminiFile> {
    let f = file;
    const deadline = Date.now() + 5 * 60_000;
    while (f.state !== 'ACTIVE') {
      if (f.state === 'FAILED') throw new ExtractionError('api', `Google n'a pas pu traiter la vidéo${f.error?.message ? ` : ${f.error.message}` : ''}.`);
      if (Date.now() > deadline) throw new ExtractionError('api', 'Le traitement de la vidéo par Google dépasse 5 minutes.');
      await sleep(2000, signal);
      const res = await call(`${API}/v1beta/${f.name}`, { headers: headers(this.config.apiKey), signal }, 'Files API : attente du traitement');
      f = (await res.json()) as GeminiFile;
    }
    return f;
  }

  private async deleteFile(name: string): Promise<void> {
    try {
      await fetch(`${API}/v1beta/${name}`, { method: 'DELETE', headers: headers(this.config.apiKey) });
    } catch { /* le fichier expire de toute façon sous 48 h */ }
  }
}

/**
 * Extrait le modèle de remplacement d'un refus HTTP 404 de Google,
 * ex. « …no longer available… use models/gemini-3.8-flash for… ».
 */
export function suggestedModel(detail: string | undefined): string | null {
  if (!detail || !/HTTP 404/.test(detail)) return null;
  const m = /use\s+models\/([a-z0-9][\w.-]*[a-z0-9])/i.exec(detail);
  return m?.[1] ?? null;
}

interface StreamChunk {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { totalTokenCount?: number };
  error?: { message?: string };
}

/** Assemble les événements SSE de streamGenerateContent (« data: {...} » séparés par une ligne vide). */
export class SseAccumulator {
  text = '';
  totalTokens?: number;
  finishReason?: string;
  blockReason?: string;
  error?: string;
  private buffer = '';

  push(chunk: string): void {
    this.buffer += chunk.replace(/\r\n/g, '\n');
    let i: number;
    while ((i = this.buffer.indexOf('\n\n')) >= 0) {
      this.handle(this.buffer.slice(0, i));
      this.buffer = this.buffer.slice(i + 2);
    }
  }

  flush(): void {
    if (this.buffer.trim()) this.handle(this.buffer);
    this.buffer = '';
  }

  private handle(event: string): void {
    const data = event.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trimStart()).join('\n');
    const raw = data || event.trim();
    if (!raw) return;
    let json: StreamChunk | StreamChunk[];
    try {
      json = JSON.parse(raw) as StreamChunk | StreamChunk[];
    } catch {
      return;
    }
    for (const c of Array.isArray(json) ? json : [json]) {
      if (c.error?.message) this.error = c.error.message;
      if (c.promptFeedback?.blockReason) this.blockReason = c.promptFeedback.blockReason;
      if (c.usageMetadata?.totalTokenCount) this.totalTokens = c.usageMetadata.totalTokenCount;
      const cand = c.candidates?.[0];
      if (cand?.finishReason) this.finishReason = cand.finishReason;
      for (const part of cand?.content?.parts ?? []) if (part.text && !part.thought) this.text += part.text;
    }
  }
}

export interface GeminiModelInfo {
  id: string;
  label: string;
}

/** Liste les modèles disponibles pour la clé (sert aussi de test de clé). Le modèle reste un réglage. */
export async function listGeminiModels(apiKey: string): Promise<GeminiModelInfo[]> {
  const out: GeminiModelInfo[] = [];
  let pageToken = '';
  do {
    const url = `${API}/v1beta/models?pageSize=1000${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
    const res = await call(url, { headers: headers(apiKey) }, 'test de la clé (liste des modèles)');
    const json = (await res.json()) as {
      models?: { name: string; displayName?: string; supportedGenerationMethods?: string[] }[];
      nextPageToken?: string;
    };
    for (const m of json.models ?? []) {
      if (!m.supportedGenerationMethods?.includes('generateContent')) continue;
      const id = m.name.replace(/^models\//, '');
      if (!/gemini/i.test(id) || UNSUITED_MODEL.test(id)) continue;
      out.push({ id, label: m.displayName ? `${m.displayName} (${id})` : id });
    }
    pageToken = json.nextPageToken ?? '';
  } while (pageToken);
  return sortModels(out);
}

/** Modèles qui ne savent pas analyser une vidéo en texte (synthèse vocale, images, temps réel…). */
const UNSUITED_MODEL = /tts|image|live|audio|embedding|robotics|computer-use|aqa/i;

function modelVersion(id: string): number {
  const m = /gemini-(\d+(?:\.\d+)?)/i.exec(id);
  return m?.[1] ? Number(m[1]) : 0;
}

/**
 * Ordre de préférence : « flash » stable d'abord, du plus récent au plus ancien
 * (les anciennes versions peuvent être refusées aux nouveaux comptes), puis lite, preview, le reste.
 */
export function sortModels<T extends { id: string }>(models: T[]): T[] {
  const rank = (id: string) => {
    if (!/flash/i.test(id)) return 3;
    if (/preview|exp/i.test(id)) return 2;
    if (/lite/i.test(id)) return 1;
    return 0;
  };
  return [...models].sort(
    (a, b) => rank(a.id) - rank(b.id) || modelVersion(b.id) - modelVersion(a.id) || a.id.localeCompare(b.id),
  );
}
