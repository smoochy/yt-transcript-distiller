import { resolveModel, clearModelCache, validateModelId } from '../model-list.js';
import { fetchAnthropicModels } from '../anthropic-model-list.js';

// ─── Migration from legacy chrome.storage.sync ────────────────────────────────
async function migrateFromSync() {
  const local = (await chrome.storage.local.get(['provider'])) ?? {};
  if (local.provider) return; // already configured with new schema
  const sync = (await chrome.storage.sync.get(['geminiApiKey', 'distillerPrompt', 'distillerLang'])) ?? {};
  if (!sync.geminiApiKey) return;
  await chrome.storage.local.set({
    provider: 'gemini',
    geminiApiKey: sync.geminiApiKey,
    distillerPrompt: sync.distillerPrompt ?? '',
    distillerLang: sync.distillerLang ?? 'en',
  });
  await chrome.storage.sync.remove(['geminiApiKey', 'distillerPrompt', 'distillerLang']);
}

// ─── Constants ────────────────────────────────────────────────────────────────
const DEFAULT_PROMPT = chrome.i18n.getMessage('default_prompt');
const LANG_CODES = ['ar', 'zh', 'en', 'fr', 'de', 'hi', 'ja', 'ko', 'pt', 'ru', 'es'];

function detectBrowserLang() {
  const lang = (navigator.language || 'en').slice(0, 2).toLowerCase();
  return LANG_CODES.includes(lang) ? lang : 'en';
}

// ─── Build language <select> ──────────────────────────────────────────────────
const langSelect = document.getElementById('distillerLang');
[...LANG_CODES]
  .sort((a, b) =>
    chrome.i18n.getMessage(`lang_${a}`).localeCompare(chrome.i18n.getMessage(`lang_${b}`))
  )
  .forEach(code => {
    const opt = document.createElement('option');
    opt.value = code;
    opt.textContent = chrome.i18n.getMessage(`lang_${code}`);
    langSelect.appendChild(opt);
  });

// ─── Tab switching ────────────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
  });
});

// ─── Provider section switching ───────────────────────────────────────────────
const providerSelect = document.getElementById('providerSelect');

function showProviderSection(provider) {
  document.querySelectorAll('.provider-section').forEach(s => s.classList.remove('active'));
  const section = document.getElementById(`section-${provider}`);
  if (section) section.classList.add('active');
}

providerSelect.addEventListener('change', () => showProviderSection(providerSelect.value));

// ─── OpenRouter model field validation ───────────────────────────────────────
const modelInput = document.getElementById('openrouterModel');
const modelStatus = document.getElementById('modelStatus');
const customModelInput = document.getElementById('openrouterCustomModel');
const customModelError = document.getElementById('openrouterCustomModelError');
const orModelLabel = document.getElementById('openrouterModelLabel');

async function validateAndShowModel(modelField) {
  if (!modelField) {
    modelStatus.style.display = 'none';
    return;
  }
  if (!modelField.startsWith('http')) {
    modelStatus.style.display = 'block';
    modelStatus.textContent = `Modell: ${modelField}`;
    return;
  }
  modelStatus.style.display = 'block';
  modelStatus.textContent = 'Lade Modellliste…';
  try {
    const result = await resolveModel(modelField);
    let text = `Aktuelles Modell: ${result.id}`;
    if (result.score != null) text += ` · Score: ${result.score}`;
    if (result.context_length != null) text += ` · Kontext: ${Math.round(result.context_length / 1000)}k`;
    modelStatus.textContent = text;
  } catch (e) {
    modelStatus.textContent = `Fehler: ${e.message}`;
  }
}

modelInput.addEventListener('blur', () => validateAndShowModel(modelInput.value.trim()));

function updateOrModelLabelStyle() {
  const filled = customModelInput.value.trim().length > 0;
  orModelLabel.style.color = filled ? '#555' : '';
}

customModelInput.addEventListener('input', updateOrModelLabelStyle);

document.getElementById('reloadModelBtn').addEventListener('click', async () => {
  await clearModelCache();
  await validateAndShowModel(modelInput.value.trim());
});

// ─── GitHub export toggle ─────────────────────────────────────────────────────
const githubToggle = document.getElementById('githubExportEnabled');
const githubFields = document.getElementById('githubFields');

githubToggle.addEventListener('change', () => {
  githubFields.style.display = githubToggle.checked ? 'block' : 'none';
});

// ─── Reset prompt ─────────────────────────────────────────────────────────────
document.getElementById('resetPrompt').addEventListener('click', () => {
  document.getElementById('distillerPrompt').value = DEFAULT_PROMPT;
});

// ─── Anthropic model dropdown ──────────────────────────────────────────────────
const anthropicModelSelect = document.getElementById('anthropicModel');

async function populateAnthropicModels(savedModel) {
  try {
    const models = await fetchAnthropicModels();
    anthropicModelSelect.innerHTML = '';
    models.forEach(({ id, display_name }) => {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = display_name || id;
      anthropicModelSelect.appendChild(opt);
    });
    anthropicModelSelect.value = savedModel || (models[0]?.id ?? 'claude-haiku-4-5-20251001');
  } catch {
    const opt = document.createElement('option');
    opt.value = savedModel || 'claude-haiku-4-5-20251001';
    opt.textContent = savedModel || 'claude-haiku-4-5-20251001';
    anthropicModelSelect.innerHTML = '';
    anthropicModelSelect.appendChild(opt);
  }
}

// ─── Load settings ────────────────────────────────────────────────────────────
async function loadSettings() {
  await migrateFromSync();

  const s = (await chrome.storage.local.get([
    'provider',
    'geminiApiKey',
    'openaiApiKey',
    'openaiModel',
    'openrouterApiKey',
    'openrouterModel',
    'openrouterCustomModel',
    'anthropicApiKey',
    'anthropicModel',
    'distillerPrompt',
    'distillerLang',
    'postComment',
    'showInPopup',
    'githubExportEnabled',
    'githubPat',
    'githubRepo',
    'githubSubfolder',
    'githubFormat',
  ])) ?? {};

  // Provider
  providerSelect.value = s.provider ?? 'gemini';
  showProviderSection(providerSelect.value);

  // API keys & model fields
  document.getElementById('geminiApiKey').value = s.geminiApiKey ?? '';
  document.getElementById('openaiApiKey').value = s.openaiApiKey ?? '';
  document.getElementById('openaiModel').value = s.openaiModel ?? 'gpt-4o-mini';
  document.getElementById('openrouterApiKey').value = s.openrouterApiKey ?? '';

  const orModel = s.openrouterModel ?? '';
  modelInput.value = orModel;
  if (orModel) validateAndShowModel(orModel);

  customModelInput.value = s.openrouterCustomModel ?? '';
  updateOrModelLabelStyle();

  // Anthropic
  document.getElementById('anthropicApiKey').value = s.anthropicApiKey ?? '';
  await populateAnthropicModels(s.anthropicModel);

  // Prompt & language
  document.getElementById('distillerPrompt').value = s.distillerPrompt || DEFAULT_PROMPT;
  langSelect.value = s.distillerLang ?? detectBrowserLang();

  // Behavior
  document.getElementById('postComment').checked = s.postComment !== false;
  document.getElementById('showInPopup').checked = s.showInPopup !== false;

  // GitHub export
  const githubEnabled = s.githubExportEnabled ?? false;
  githubToggle.checked = githubEnabled;
  githubFields.style.display = githubEnabled ? 'block' : 'none';
  document.getElementById('githubPat').value = s.githubPat ?? '';
  document.getElementById('githubRepo').value = s.githubRepo ?? '';
  document.getElementById('githubSubfolder').value = s.githubSubfolder ?? 'yt-summaries';
  document.getElementById('githubFormat').value = s.githubFormat ?? 'markdown';
}

// ─── Save settings ────────────────────────────────────────────────────────────
const saveBtn = document.getElementById('saveBtn');
const statusEl = document.getElementById('status');

saveBtn.addEventListener('click', async () => {
  const provider = providerSelect.value;

  // Validate openrouterCustomModel against OpenRouter API if non-empty
  const customModel = customModelInput.value.trim();
  if (provider === 'openrouter' && customModel) {
    customModelError.style.display = 'none';
    try {
      const valid = await validateModelId(
        'https://openrouter.ai/api/v1/models',
        customModel
      );
      if (!valid) {
        customModelError.textContent = `Model '${customModel}' not found on OpenRouter. Check the ID and try again.`;
        customModelError.style.display = 'block';
        return; // do not save
      }
    } catch (e) {
      customModelError.textContent = `Could not validate model: ${e.message}`;
      customModelError.style.display = 'block';
      return; // do not save
    }
  } else {
    customModelError.style.display = 'none';
  }

  const settings = {
    provider,
    geminiApiKey: document.getElementById('geminiApiKey').value.trim(),
    openaiApiKey: document.getElementById('openaiApiKey').value.trim(),
    openaiModel: document.getElementById('openaiModel').value.trim() || 'gpt-4o-mini',
    openrouterApiKey: document.getElementById('openrouterApiKey').value.trim(),
    openrouterModel: modelInput.value.trim(),
    openrouterCustomModel: customModel,
    anthropicApiKey: document.getElementById('anthropicApiKey').value.trim(),
    anthropicModel: anthropicModelSelect.value || 'claude-haiku-4-5-20251001',
    distillerPrompt: document.getElementById('distillerPrompt').value.trim() || DEFAULT_PROMPT,
    distillerLang: langSelect.value || detectBrowserLang(),
    postComment: document.getElementById('postComment').checked,
    showInPopup: document.getElementById('showInPopup').checked,
    githubExportEnabled: githubToggle.checked,
    githubPat: document.getElementById('githubPat').value.trim(),
    githubRepo: document.getElementById('githubRepo').value.trim(),
    githubSubfolder: document.getElementById('githubSubfolder').value.trim(),
    githubFormat: document.getElementById('githubFormat').value,
  };

  // Validate that the active provider has an API key
  const keyFieldMap = {
    gemini: 'geminiApiKey',
    openai: 'openaiApiKey',
    openrouter: 'openrouterApiKey',
    anthropic: 'anthropicApiKey',
  };
  if (!settings[keyFieldMap[provider]]) {
    statusEl.textContent = chrome.i18n.getMessage('msg_no_key') || 'API key required.';
    statusEl.className = 'status error visible';
    setTimeout(() => { statusEl.className = 'status'; }, 3000);
    return;
  }

  await chrome.storage.local.set(settings);
  statusEl.textContent = chrome.i18n.getMessage('msg_saved') || 'Saved ✓';
  statusEl.className = 'status visible';
  setTimeout(() => { statusEl.className = 'status'; }, 3000);
});

// ─── Apply i18n to static elements ───────────────────────────────────────────
document.querySelectorAll('[data-i18n]').forEach(el => {
  const msg = chrome.i18n.getMessage(el.getAttribute('data-i18n'));
  if (msg) el.textContent = msg;
});

// ─── Init ─────────────────────────────────────────────────────────────────────
loadSettings();
