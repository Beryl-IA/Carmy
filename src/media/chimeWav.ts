// Génère la sonnerie sous forme de fichier WAV (PCM 16 bits mono), sans rien télécharger.
// Un fichier lu par un élément <audio> n'est pas coupé par le bouton silencieux de l'iPhone,
// contrairement au son synthétisé par Web Audio.

/** Trois bips (880, 880, 1175 Hz) puis un silence : 1,5 s, prévu pour être joué en boucle. */
export function chimeWav(sampleRate = 22050): Uint8Array {
  const total = Math.round(sampleRate * 1.5);
  const samples = new Int16Array(total);
  const tones: [number, number][] = [[0, 880], [0.22, 880], [0.44, 1175]];
  for (const [start, freq] of tones) {
    const from = Math.round(start * sampleRate);
    const len = Math.round(0.18 * sampleRate);
    for (let i = 0; i < len && from + i < total; i++) {
      const t = i / sampleRate;
      // Enveloppe : attaque 10 ms, décroissance exponentielle.
      const env = Math.min(1, t / 0.01) * Math.exp(-t * 14);
      samples[from + i] = Math.round(Math.sin(2 * Math.PI * freq * t) * env * 0.8 * 32767);
    }
  }
  const dataBytes = samples.length * 2;
  const buf = new ArrayBuffer(44 + dataBytes);
  const v = new DataView(buf);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF');
  v.setUint32(4, 36 + dataBytes, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true); // taille du bloc fmt
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true); // octets par seconde
  v.setUint16(32, 2, true); // alignement
  v.setUint16(34, 16, true); // bits par échantillon
  str(36, 'data');
  v.setUint32(40, dataBytes, true);
  new Int16Array(buf, 44).set(samples);
  return new Uint8Array(buf);
}
