// Captures d'écran (V2-J1) : recompression avant envoi à Gemini et miniature de la fiche.

/** Nombre maximal de captures pour une recette (mémoire de l'iPhone et quota). */
export const MAX_CAPTURES = 10;

/**
 * Dimensions réduites pour tenir dans `maxSide` (côté le plus long), sans agrandir.
 * Une capture d'iPhone 13 (1170 × 2532) reste lisible à 2048 px de haut.
 */
export function fitWithin(width: number, height: number, maxSide: number): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/**
 * Zone de la capture gardée pour la miniature : toute la largeur, au format 4:5 des cartes,
 * en sautant la barre d'état (6 % du haut) — sur un post, la photo du plat est souvent en haut.
 */
export function thumbnailCrop(width: number, height: number): { sx: number; sy: number; sw: number; sh: number } {
  const wanted = Math.round((width * 5) / 4);
  if (wanted >= height) {
    // Image plus large que 4:5 : on recadre au centre, sur toute la hauteur.
    const sw = Math.min(width, Math.round((height * 4) / 5));
    return { sx: Math.round((width - sw) / 2), sy: 0, sw, sh: height };
  }
  const sy = Math.min(Math.round(height * 0.06), height - wanted);
  return { sx: 0, sy, sw: width, sh: wanted };
}

interface Decoded {
  source: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
}

async function decode(file: Blob): Promise<Decoded> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file);
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch { /* format non pris en charge par createImageBitmap : repli sur <img> */ }
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('image illisible'));
      img.src = url;
    });
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
  return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
}

async function draw(file: Blob, maxSide: number, quality: number, crop = false): Promise<Blob> {
  const d = await decode(file);
  try {
    const c = crop ? thumbnailCrop(d.width, d.height) : { sx: 0, sy: 0, sw: d.width, sh: d.height };
    const { width, height } = fitWithin(c.sw, c.sh, maxSide);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas indisponible');
    // Fond blanc : une capture PNG transparente ne doit pas devenir noire en JPEG.
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(d.source, c.sx, c.sy, c.sw, c.sh, 0, 0, width, height);
    const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!out) throw new Error('compression impossible');
    // Libère tout de suite la mémoire du canvas (iOS limite la mémoire totale des canvas).
    canvas.width = 0;
    canvas.height = 0;
    return out;
  } finally {
    d.close();
  }
}

/**
 * Prépare une capture pour l'IA : JPEG, 2048 px maximum. Une capture PNG de 2 à 4 Mo descend
 * vers 300 à 600 Ko, ce qui permet d'envoyer 10 captures en une seule requête.
 * En cas d'échec de décodage, renvoie le fichier d'origine (Gemini lit PNG, JPEG, WebP, HEIC).
 */
export async function prepareCapture(file: Blob): Promise<Blob> {
  try {
    return await draw(file, 2048, 0.85);
  } catch {
    return file;
  }
}

/** Miniature de la fiche : JPEG 400 × 500 px, recadrée au format des cartes. */
export async function captureThumbnail(file: Blob): Promise<Blob | null> {
  try {
    return await draw(file, 500, 0.7, true);
  } catch {
    return null;
  }
}
