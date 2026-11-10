// Alarme sonore des minuteurs (Web Audio). Pas de fichier à télécharger : le son est synthétisé.
// iOS n'autorise le son qu'après un geste de l'utilisateur : appeler unlockAudio() au tap qui lance un minuteur.

type AudioCtor = typeof AudioContext;
let ctx: AudioContext | null = null;
let loop: ReturnType<typeof setInterval> | null = null;
let stopAt = 0;

/** Durée maximale de sonnerie si personne n'arrête l'alarme. */
const MAX_RING_MS = 3 * 60_000;

export function unlockAudio(): void {
  try {
    // Safari 17+ : jouer même si le bouton silencieux est activé.
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session) session.type = 'playback';
  } catch { /* non supporté */ }
  try {
    const Ctor = (window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext) as AudioCtor | undefined;
    if (!Ctor) return;
    ctx ??= new Ctor();
    if (ctx.state !== 'running') void ctx.resume();
    // Un son muet très court finit de « déverrouiller » l'audio sur iOS.
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

/** Fait sonner l'alarme en boucle jusqu'à stopAlarm() (ou 3 min). */
export function startAlarm(): void {
  stopAt = Date.now() + MAX_RING_MS;
  if (loop) return;
  chime();
  try {
    navigator.vibrate?.([300, 150, 300]); // sans effet sur iPhone, utile ailleurs
  } catch { /* ignore */ }
  loop = setInterval(() => {
    if (Date.now() > stopAt) {
      stopAlarm();
      return;
    }
    chime();
  }, 1500);
}

export function stopAlarm(): void {
  if (loop) clearInterval(loop);
  loop = null;
}
