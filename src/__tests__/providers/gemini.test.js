import { jest } from '@jest/globals';

// jest-fetch-mock
global.fetch = jest.fn();

import { GeminiProvider } from '../../providers/gemini.js';

describe('GeminiProvider', () => {
  beforeEach(() => {
    fetch.mockClear();
    chrome.storage.local.set.mockClear();
  });

  test('returns summary text on success', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'summary' }] } }],
      }),
    });

    const provider = new GeminiProvider({ apiKey: 'test-key' });
    const result = await provider.summarize('transcript text', 'summarize this');
    expect(result).toBe('summary');
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('gemini-2.5-flash'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  test('throws on 401 and flags invalidKey', async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: 'Invalid API key' } }),
    });

    const provider = new GeminiProvider({ apiKey: 'bad-key' });
    await expect(provider.summarize('t', 'p')).rejects.toThrow('Gemini API error');
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ invalidKey: true });
  });

  test('throws when response has no text', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ candidates: [] }),
    });

    const provider = new GeminiProvider({ apiKey: 'key' });
    await expect(provider.summarize('t', 'p')).rejects.toThrow('no usable response');
  });
});
