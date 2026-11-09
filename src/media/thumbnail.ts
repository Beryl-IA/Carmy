// Extraction d'une miniature côté client (F1.5) : image vers 1 s (ou milieu), JPEG ~400 px, qualité 0,7.

export async function extractThumbnail(file: Blob, width = 400, quality = 0.7): Promise<Blob | null> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;
  try {
    await once(video, 'loadedmetadata');
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const t = duration > 2 ? 1 : duration / 2;
    // Safari iOS ne décode parfois la première image qu'après un play()/pause().
    try {
      await video.play();
      video.pause();
    } catch { /* lecture automatique refusée : on continue */ }
    video.currentTime = t;
    await once(video, 'seeked');
    if (!video.videoWidth) return null;
    const ratio = video.videoHeight / video.videoWidth;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = Math.round(width * ratio);
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  } catch {
    return null;
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}

function once(el: HTMLElement, event: string, timeoutMs = 8000): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`délai dépassé : ${event}`)), timeoutMs);
    el.addEventListener(event, () => { clearTimeout(t); resolve(); }, { once: true });
    el.addEventListener('error', () => { clearTimeout(t); reject(new Error('vidéo illisible')); }, { once: true });
  });
}

/** Durée de la vidéo en secondes (null si illisible), pour l'avertissement > 3 min. */
export async function videoDuration(file: Blob): Promise<number | null> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.preload = 'metadata';
  video.src = url;
  try {
    await once(video, 'loadedmetadata');
    return Number.isFinite(video.duration) ? video.duration : null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
