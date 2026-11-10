import { afterEach, describe, expect, it, vi } from 'vitest';
import { GeminiProvider, RETRY_DELAYS_MS } from '../src/extraction/gemini';
import { ExtractionError } from '../src/extraction/types';

const recipe = { isRecipe: true, title: 'Riz', servings: 1, tags: [], ingredients: [], steps: [] };
const ok = () => new Response(`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(recipe) }] }, finishReason: 'STOP' }] })}\n\n`, { status: 200 });
const busy = () => new Response(JSON.stringify({ error: { message: 'This model is currently experiencing high demand.' } }), { status: 503 });
const provider = () => new GeminiProvider({ apiKey: 'k', model: 'm' });

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('surcharge de Google (503)', () => {
  it('réessaie automatiquement puis réussit', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValueOnce(busy()).mockResolvedValueOnce(busy()).mockResolvedValueOnce(ok());
    vi.stubGlobal('fetch', fetchMock);
    const retries: number[][] = [];
    const p = provider().extract({ kind: 'text', text: 'riz' }, { onRetry: (a, t, d) => retries.push([a, t, d]) });
    await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0] + RETRY_DELAYS_MS[1]);
    expect((await p).recipe.title).toBe('Riz');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(retries).toEqual([[2, 4, 3000], [3, 4, 8000]]);
  });
  it('abandonne avec un message en français après les nouvelles tentatives', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockImplementation(async () => busy());
    vi.stubGlobal('fetch', fetchMock);
    const p = provider().extract({ kind: 'text', text: 'riz' }).catch((e) => e);
    await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS.reduce((a, b) => a + b, 0));
    const err = (await p) as ExtractionError;
    expect(err).toBeInstanceOf(ExtractionError);
    expect(err.kind).toBe('surcharge');
    expect(err.message).toMatch(/très sollicités/);
    expect(fetchMock).toHaveBeenCalledTimes(RETRY_DELAYS_MS.length + 1);
  });
  it('ne réessaie pas une clé refusée', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response('{"error":{"message":"API key not valid"}}', { status: 400 }));
    vi.stubGlobal('fetch', fetchMock);
    const err = (await provider().extract({ kind: 'text', text: 'riz' }).catch((e) => e)) as ExtractionError;
    expect(err.kind).toBe('cle');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
