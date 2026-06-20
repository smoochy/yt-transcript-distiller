// Apply all data-i18n translations
document.querySelectorAll('[data-i18n]').forEach(el => {
  const msg = chrome.i18n.getMessage(el.getAttribute('data-i18n'));
  if (msg) el.textContent = msg;
});

// Language codes must match _locales folder names
const LANG_CODES = ['ar','zh','en','fr','de','hi','ja','ko','pt','ru','es'];

function detectBrowserLang() {
  const lang = (navigator.language || 'en').slice(0, 2).toLowerCase();
  return LANG_CODES.includes(lang) ? lang : 'en';
}

// Build language select from i18n strings
const langSelect = document.getElementById('distillerLang');
LANG_CODES.sort((a, b) => {
  const la = chrome.i18n.getMessage('lang_' + a);
  const lb = chrome.i18n.getMessage('lang_' + b);
  return la.localeCompare(lb);
}).forEach(code => {
  const opt = document.createElement('option');
  opt.value = code;
  opt.textContent = chrome.i18n.getMessage('lang_' + code);
  langSelect.appendChild(opt);
});

const DEFAULT_PROMPT = chrome.i18n.getMessage('default_prompt');
const apiKeyInput = document.getElementById('apiKey');
const promptInput = document.getElementById('distillerPrompt');
const saveBtn     = document.getElementById('saveBtn');
const statusEl    = document.getElementById('status');
const toggleBtn   = document.getElementById('toggleShow');
const resetBtn    = document.getElementById('resetPrompt');

const telemetryCheckbox = document.getElementById('telemetryEnabled');

// Load existing values
chrome.storage.sync.get(['geminiApiKey', 'distillerPrompt', 'distillerLang', 'telemetryEnabled'], (result) => {
  if (result.geminiApiKey) apiKeyInput.value = result.geminiApiKey;
  promptInput.value = result.distillerPrompt || DEFAULT_PROMPT;
  langSelect.value  = result.distillerLang   || detectBrowserLang();
  telemetryCheckbox.checked = result.telemetryEnabled !== false; // default: true
});

// Toggle show/hide API key
toggleBtn.addEventListener('click', () => {
  if (apiKeyInput.type === 'password') {
    apiKeyInput.type = 'text';
    toggleBtn.textContent = chrome.i18n.getMessage('btn_hide');
  } else {
    apiKeyInput.type = 'password';
    toggleBtn.textContent = chrome.i18n.getMessage('btn_show');
  }
});

// Reset prompt
resetBtn.addEventListener('click', () => {
  promptInput.value = DEFAULT_PROMPT;
});

// Save
saveBtn.addEventListener('click', () => {
  const key    = apiKeyInput.value.trim();
  const prompt = promptInput.value.trim() || DEFAULT_PROMPT;
  const lang   = langSelect.value || detectBrowserLang();

  if (!key) {
    statusEl.textContent = chrome.i18n.getMessage('msg_no_key');
    statusEl.className = 'status error visible';
    setTimeout(() => { statusEl.className = 'status'; }, 3000);
    return;
  }

  chrome.storage.sync.set({ geminiApiKey: key, distillerPrompt: prompt, distillerLang: lang, telemetryEnabled: telemetryCheckbox.checked }, () => {
    if (chrome.runtime.lastError) {
      statusEl.textContent = chrome.i18n.getMessage('msg_save_error');
      statusEl.className = 'status error visible';
    } else {
      statusEl.textContent = chrome.i18n.getMessage('msg_saved');
      statusEl.className = 'status visible';
    }
    setTimeout(() => { statusEl.className = 'status'; }, 3000);
  });
});
