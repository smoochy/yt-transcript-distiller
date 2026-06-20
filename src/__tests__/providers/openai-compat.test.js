import { jest } from '@jest/globals';
global.fetch = jest.fn();

import { OpenAICompatProvider } from '../../providers/openai-compat.js';

describe('OpenAICompatProvider', () => {
  beforeEach(() => fetch.mockClear());

  test('calls OpenAI endpoint with correct headers', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'summary' } }] }),
    });

    const p = new OpenAICompatProvider({ apiKey: 'sk-test', model: 'gpt-4o-mini', providerType: 'openai' });
    const result = await p.summarize('transcript', 'summarize');
    expect(result).toBe('summary');
    expect(fetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer sk-test' }),
      }),
    );
  });

  test('calls OpenRouter endpoint for openrouter providerType', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
    });

    const p = new OpenAICompatProvider({ apiKey: 'sk-or-v1-x', model: 'openrouter/owl-alpha', providerType: 'openrouter' });
    await p.summarize('t', 'p');
    expect(fetch).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/chat/completions',
      expect.anything(),
    );
  });

  test('throws on API error', async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({ error: { message: 'Rate limit' } }),
    });

    const p = new OpenAICompatProvider({ apiKey: 'k', model: 'm', providerType: 'openai' });
    await expect(p.summarize('t', 'p')).rejects.toThrow('Rate limit');
  });
});
