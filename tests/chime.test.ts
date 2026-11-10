import { describe, expect, it } from 'vitest';
import { chimeWav } from '../src/media/chimeWav';

describe('chimeWav', () => {
  it('produit un WAV PCM 16 bits mono valide de 1,5 s', () => {
    const b = chimeWav(22050);
    const v = new DataView(b.buffer);
    const txt = (o: number) => String.fromCharCode(...b.slice(o, o + 4));
    expect(txt(0)).toBe('RIFF');
    expect(txt(8)).toBe('WAVE');
    expect(txt(36)).toBe('data');
    expect(v.getUint16(20, true)).toBe(1);
    expect(v.getUint16(22, true)).toBe(1);
    expect(v.getUint32(24, true)).toBe(22050);
    expect(v.getUint32(40, true)).toBe(Math.round(22050 * 1.5) * 2);
    expect(v.getUint32(4, true)).toBe(b.length - 8);
    // Le son n'est pas muet, et la fin (boucle) est silencieuse.
    const pcm = new Int16Array(b.buffer, 44);
    expect(Math.max(...pcm.slice(0, 4000))).toBeGreaterThan(10000);
    expect(pcm.slice(-2000).every((x) => x === 0)).toBe(true);
  });
});
