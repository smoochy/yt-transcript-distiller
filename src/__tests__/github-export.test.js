import { jest } from '@jest/globals';
global.fetch = jest.fn();

import { exportToGitHub } from '../github-export.js';

const BASE_OPTS = {
  pat: 'ghp_test',
  repo: 'smoochy/yt-notes',
  subfolder: 'transcripts/',
  format: 'markdown',
  videoId: 'dQw4w9WgXcQ',
  title: 'Test Video',
  url: 'https://youtube.com/watch?v=dQw4w9WgXcQ',
  date: '2026-06-20',
  provider: 'openrouter',
  model: 'openrouter/owl-alpha',
  summary: 'This is a summary.',
  transcript: 'This is the transcript.',
};

beforeEach(() => fetch.mockClear());

test('creates markdown file when none exists', async () => {
  fetch
    .mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) })  // GET — not found
    .mockResolvedValueOnce({ ok: true, json: async () => ({ content: {} }) });  // PUT — create

  await exportToGitHub({ ...BASE_OPTS, format: 'markdown' });

  const putCall = fetch.mock.calls[1];
  expect(putCall[0]).toContain('dQw4w9WgXcQ_2026-06-20.md');
  const body = JSON.parse(putCall[1].body);
  expect(body.sha).toBeUndefined();
  expect(body.content).toBeTruthy();
});

test('updates existing file with SHA', async () => {
  fetch
    .mockResolvedValueOnce({ ok: true, json: async () => ({ sha: 'abc123' }) })  // GET — exists
    .mockResolvedValueOnce({ ok: true, json: async () => ({ content: {} }) });   // PUT — update

  await exportToGitHub({ ...BASE_OPTS, format: 'markdown' });

  const body = JSON.parse(fetch.mock.calls[1][1].body);
  expect(body.sha).toBe('abc123');
});

test('creates both files when format is "both"', async () => {
  // 2 × (GET + PUT) = 4 calls
  fetch
    .mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });
  fetch
    .mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
    .mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({}) });

  await exportToGitHub({ ...BASE_OPTS, format: 'both' });
  expect(fetch).toHaveBeenCalledTimes(4);
});

test('throws on PUT error', async () => {
  fetch
    .mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) })
    .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ message: 'Bad credentials' }) });

  await expect(exportToGitHub({ ...BASE_OPTS })).rejects.toThrow('Bad credentials');
});
