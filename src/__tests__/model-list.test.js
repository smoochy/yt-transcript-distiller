import { jest } from '@jest/globals';
global.fetch = jest.fn();

import { resolveModel, clearModelCache } from '../model-list.js';

const VALID_MODELS_JSON = {
  generated_at: '2026-06-20T00:00:00Z',
  schema_version: 2,
  models: [
    { id: 'openrouter/owl-alpha', score: 0.88, context_length: 1048756 },
    { id: 'other/model:free', score: 0.5, context_length: 32000 },
  ],
};

beforeEach(async () => {
  fetch.mockClear();
  chrome.storage.local.clear();
  await clearModelCache();
});

test('returns model id directly when not a URL', async () => {
  const result = await resolveModel('openrouter/owl-alpha');
  expect(result).toEqual({ id: 'openrouter/owl-alpha' });
  expect(fetch).not.toHaveBeenCalled();
});

test('fetches URL and returns top model', async () => {
  fetch.mockResolvedValueOnce({ ok: true, json: async () => VALID_MODELS_JSON });

  const result = await resolveModel('https://example.com/models.json');
  expect(result).toEqual({ id: 'openrouter/owl-alpha', score: 0.88, context_length: 1048756 });
  expect(fetch).toHaveBeenCalledTimes(1);
});

test('caches result — second call does not fetch', async () => {
  fetch.mockResolvedValueOnce({ ok: true, json: async () => VALID_MODELS_JSON });

  await resolveModel('https://example.com/models.json');
  await resolveModel('https://example.com/models.json');
  expect(fetch).toHaveBeenCalledTimes(1);
});

test('throws on invalid JSON format — missing models array', async () => {
  fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ not: 'models' }) });

  await expect(resolveModel('https://example.com/bad.json')).rejects.toThrow('invalid format');
});

test('throws on HTTP error', async () => {
  fetch.mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) });

  await expect(resolveModel('https://example.com/missing.json')).rejects.toThrow('HTTP 404');
});
