const CACHE_KEY = 'modelListCache';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function resolveModel(modelField) {
  if (!modelField || !modelField.startsWith('http')) {
    return { id: modelField };
  }
  const cached = await getCached(modelField);
  if (cached) return cached;
  return fetchAndCache(modelField);
}

export async function clearModelCache() {
  await chrome.storage.local.remove(CACHE_KEY);
}

async function fetchAndCache(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`model-list fetch failed: HTTP ${res.status}`);
  const data = await res.json();

  if (!Array.isArray(data?.models) || data.models.length === 0) {
    throw new Error('model-list: invalid format — expected { models: [{id, score, ...}] }');
  }
  const top = data.models[0];
  if (typeof top.id !== 'string' || typeof top.score !== 'number') {
    throw new Error('model-list: each model must have id (string) and score (number)');
  }

  const result = { id: top.id, score: top.score, context_length: top.context_length ?? null };
  await chrome.storage.local.set({
    [CACHE_KEY]: { url, result, cachedAt: Date.now() },
  });
  return result;
}

async function getCached(url) {
  const stored = await chrome.storage.local.get([CACHE_KEY]);
  const entry = stored[CACHE_KEY];
  if (!entry || entry.url !== url) return null;
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) return null;
  return entry.result;
}

const OR_MODEL_LIST_CACHE_KEY = 'orFullModelListCache';
const OR_MODEL_LIST_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function validateModelId(modelsUrl, modelId) {
  const stored = await chrome.storage.local.get([OR_MODEL_LIST_CACHE_KEY]);
  const entry = stored[OR_MODEL_LIST_CACHE_KEY];

  let models;
  if (entry && entry.url === modelsUrl && Date.now() - entry.cachedAt < OR_MODEL_LIST_TTL_MS) {
    models = entry.models;
  } else {
    const res = await fetch(modelsUrl);
    if (!res.ok) throw new Error(`OpenRouter model list fetch failed: HTTP ${res.status}`);
    const data = await res.json();
    models = (data.data ?? []).map(m => m.id);
    await chrome.storage.local.set({
      [OR_MODEL_LIST_CACHE_KEY]: { url: modelsUrl, models, cachedAt: Date.now() },
    });
  }

  return models.includes(modelId);
}
