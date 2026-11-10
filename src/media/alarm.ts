// Alarme sonore des minuteurs.
// 1) Voie principale : un élément <audio> qui lit une sonnerie WAV générée localement. Sur iPhone,
//    ce type de lecture n'est PAS coupé par le bouton silencieux (contrairement à Web Audio).
// 2) Secours : bips Web Audio si la lecture de l'élément <audio> est refusée.
// iOS n'autorise le son qu'après un geste : appeler unlockAudio() au tap qui lance un minuteur.
import { chimeWav } from './chimeWav';

type AudioCtor = typeof AudioContext;
let ctx: AudioContext | null = null;
let el: HTMLAudioElement | null = null;
let fallbackLoop: ReturnType<typeof setInterval> | null = null;
let stopTimer: ReturnType<typeof setTimeout> | null = null;
let ringing = false;

/** Durée maximale de sonnerie si personne n'arrête l'alarme. */
const MAX_RING_MS = 3 * 60_000;

function audioElement(): HTMLAudioElement | null {
  if (el) return el;
  try {
    const bytes = chimeWav();
    const url = URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer], { type: 'audio/wav' }));
    el = new Audio(url);
    el.loop = true;
    el.preload = 'auto';
    el.setAttribute('playsinline', '');
  } catch {
    el = null;
  }
  return el;
}

export function unlockAudio(): void {
  try {
    // Safari 17+ : catégorie « lecture » (ignore le bouton silencieux).
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session) session.type = 'playback';
  } catch { /* non supporté */ }

  // Élément <audio> : une lecture muette pendant le geste l'autorise à sonner plus tard.
  const a = audioElement();
  if (a && !ringing) {
    a.muted = true;
    const p = a.play();
    void p?.then(() => {
      if (!ringing) {
        a.pause();
        a.currentTime = 0;
      }
      a.muted = false;
    }).catch(() => { a.muted = false; });
  }

  // Web Audio, pour le secours.
  try {
    const Ctor = (window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext) as AudioCtor | undefined;
    if (!Ctor) return;
    ctx ??= new Ctor();
    if (ctx.state !== 'running') void ctx.resume();
    const buf = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
  } catch { /* audio indisponible : il reste le signal visuel */ }
}

function chime(): void {
  if (!ctx) return;
  if (ctx.state !== 'running') void ctx.resume();
  const t0 = ctx.currentTime + 0.02;
  [0, 0.22, 0.44].forEach((offset, i) => {
    const osc = ctx!.createOscillator();
    const gain = ctx!.createGain();
    osc.type = 'sine';
    osc.frequency.value = i === 2 ? 1175 : 880;
    const start = t0 + offset;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.6, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
    osc.connect(gain).connect(ctx!.destination);
    osc.start(start);
    osc.stop(start + 0.2);
  });
}

function startFallback(): void {
  if (fallbackLoop || !ringing) return;
  chime();
  fallbackLoop = setInterval(chime, 1500);
}

/** Fait sonner l'alarme en boucle jusqu'à stopAlarm() (ou 3 min). */
export function startAlarm(): void {
  if (ringing) return;
  ringing = true;
  stopTimer = setTimeout(stopAlarm, MAX_RING_MS);
  try {
    navigator.vibrate?.([300, 150, 300]); // sans effet sur iPhone, utile ailleurs
  } catch { /* ignore */ }

  const a = audioElement();
  if (!a) {
    startFallback();
    return;
  }
  a.muted = false;
  a.volume = 1;
  a.currentTime = 0;
  const p = a.play();
  if (!p) return;
  p.catch(startFallback);
}

export function stopAlarm(): void {
  ringing = false;
  if (stopTimer) clearTimeout(stopTimer);
  stopTimer = null;
  if (fallbackLoop) clearInterval(fallbackLoop);
  fallbackLoop = null;
  if (el) {
    el.pause();
    el.currentTime = 0;
  }
}
