(() => {
  // src/options/options.js
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const msg = chrome.i18n.getMessage(el.getAttribute("data-i18n"));
    if (msg) el.textContent = msg;
  });
  var LANG_CODES = ["ar", "zh", "en", "fr", "de", "hi", "ja", "ko", "pt", "ru", "es"];
  function detectBrowserLang() {
    const lang = (navigator.language || "en").slice(0, 2).toLowerCase();
    return LANG_CODES.includes(lang) ? lang : "en";
  }
  var langSelect = document.getElementById("distillerLang");
  LANG_CODES.sort((a, b) => {
    const la = chrome.i18n.getMessage("lang_" + a);
    const lb = chrome.i18n.getMessage("lang_" + b);
    return la.localeCompare(lb);
  }).forEach((code) => {
    const opt = document.createElement("option");
    opt.value = code;
    opt.textContent = chrome.i18n.getMessage("lang_" + code);
    langSelect.appendChild(opt);
  });
  var DEFAULT_PROMPT = chrome.i18n.getMessage("default_prompt");
  var apiKeyInput = document.getElementById("apiKey");
  var promptInput = document.getElementById("distillerPrompt");
  var saveBtn = document.getElementById("saveBtn");
  var statusEl = document.getElementById("status");
  var toggleBtn = document.getElementById("toggleShow");
  var resetBtn = document.getElementById("resetPrompt");
  var telemetryCheckbox = document.getElementById("telemetryEnabled");
  chrome.storage.sync.get(["geminiApiKey", "distillerPrompt", "distillerLang", "telemetryEnabled"], (result) => {
    if (result.geminiApiKey) apiKeyInput.value = result.geminiApiKey;
    promptInput.value = result.distillerPrompt || DEFAULT_PROMPT;
    langSelect.value = result.distillerLang || detectBrowserLang();
    telemetryCheckbox.checked = result.telemetryEnabled !== false;
  });
  toggleBtn.addEventListener("click", () => {
    if (apiKeyInput.type === "password") {
      apiKeyInput.type = "text";
      toggleBtn.textContent = chrome.i18n.getMessage("btn_hide");
    } else {
      apiKeyInput.type = "password";
      toggleBtn.textContent = chrome.i18n.getMessage("btn_show");
    }
  });
  resetBtn.addEventListener("click", () => {
    promptInput.value = DEFAULT_PROMPT;
  });
  saveBtn.addEventListener("click", () => {
    const key = apiKeyInput.value.trim();
    const prompt = promptInput.value.trim() || DEFAULT_PROMPT;
    const lang = langSelect.value || detectBrowserLang();
    if (!key) {
      statusEl.textContent = chrome.i18n.getMessage("msg_no_key");
      statusEl.className = "status error visible";
      setTimeout(() => {
        statusEl.className = "status";
      }, 3e3);
      return;
    }
    chrome.storage.sync.set({ geminiApiKey: key, distillerPrompt: prompt, distillerLang: lang, telemetryEnabled: telemetryCheckbox.checked }, () => {
      if (chrome.runtime.lastError) {
        statusEl.textContent = chrome.i18n.getMessage("msg_save_error");
        statusEl.className = "status error visible";
      } else {
        statusEl.textContent = chrome.i18n.getMessage("msg_saved");
        statusEl.className = "status visible";
      }
      setTimeout(() => {
        statusEl.className = "status";
      }, 3e3);
    });
  });
})();
