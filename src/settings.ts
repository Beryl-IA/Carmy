// Réglages du prototype (J1). Stockage local uniquement ; migrera vers IndexedDB au jalon 2.
// La clé API ne quitte jamais l'appareil (sauf vers l'API Gemini) et n'est jamais dans le dépôt.

export interface ProtoSettings {
  apiKey: string;
  model: string;
  forceFilesApi: boolean;
  fastMode: boolean;
}

const KEY = 'carmy.settings.v0';
const DEFAULTS: ProtoSettings = { apiKey: '', model: '', forceFilesApi: false, fastMode: true };

export function loadSettings(): ProtoSettings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<ProtoSettings>) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s: ProtoSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch { /* stockage indisponible (navigation privée) */ }
}
