(() => {
  // src/model-list.js
  var CACHE_KEY = "modelListCache";
  var CACHE_TTL_MS = 60 * 60 * 1e3;
  async function resolveModel(modelField) {
    if (!modelField || !modelField.startsWith("http")) {
      return { id: modelField };
    }
    const cached = await getCached(modelField);
    if (cached) return cached;
    return fetchAndCache(modelField);
  }
  async function clearModelCache() {
    await chrome.storage.local.remove(CACHE_KEY);
  }
  async function fetchAndCache(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`model-list fetch failed: HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data?.models) || data.models.length === 0) {
      throw new Error("model-list: invalid format \u2014 expected { models: [{id, score, ...}] }");
    }
    const top = data.models[0];
    if (typeof top.id !== "string" || typeof top.score !== "number") {
      throw new Error("model-list: each model must have id (string) and score (number)");
    }
    const result = { id: top.id, score: top.score, context_length: top.context_length ?? null };
    await chrome.storage.local.set({
      [CACHE_KEY]: { url, result, cachedAt: Date.now() }
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

  // src/options/options.js
  async function migrateFromSync() {
    const local = await chrome.storage.local.get(["provider"]);
    if (local.provider) return;
    const sync = await chrome.storage.sync.get(["geminiApiKey", "distillerPrompt", "distillerLang"]);
    if (!sync.geminiApiKey) return;
    await chrome.storage.local.set({
      provider: "gemini",
      geminiApiKey: sync.geminiApiKey,
      distillerPrompt: sync.distillerPrompt ?? "",
      distillerLang: sync.distillerLang ?? "en"
    });
    await chrome.storage.sync.remove(["geminiApiKey", "distillerPrompt", "distillerLang"]);
  }
  var DEFAULT_PROMPT = chrome.i18n.getMessage("default_prompt");
  var LANG_CODES = ["ar", "zh", "en", "fr", "de", "hi", "ja", "ko", "pt", "ru", "es"];
  function detectBrowserLang() {
    const lang = (navigator.language || "en").slice(0, 2).toLowerCase();
    return LANG_CODES.includes(lang) ? lang : "en";
  }
  var langSelect = document.getElementById("distillerLang");
  [...LANG_CODES].sort(
    (a, b) => chrome.i18n.getMessage(`lang_${a}`).localeCompare(chrome.i18n.getMessage(`lang_${b}`))
  ).forEach((code) => {
    const opt = document.createElement("option");
    opt.value = code;
    opt.textContent = chrome.i18n.getMessage(`lang_${code}`);
    langSelect.appendChild(opt);
  });
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
    });
  });
  var providerSelect = document.getElementById("providerSelect");
  function showProviderSection(provider) {
    document.querySelectorAll(".provider-section").forEach((s) => s.classList.remove("active"));
    const section = document.getElementById(`section-${provider}`);
    if (section) section.classList.add("active");
  }
  providerSelect.addEventListener("change", () => showProviderSection(providerSelect.value));
  var modelInput = document.getElementById("openrouterModel");
  var modelStatus = document.getElementById("modelStatus");
  async function validateAndShowModel(modelField) {
    if (!modelField) {
      modelStatus.style.display = "none";
      return;
    }
    if (!modelField.startsWith("http")) {
      modelStatus.style.display = "block";
      modelStatus.textContent = `Modell: ${modelField}`;
      return;
    }
    modelStatus.style.display = "block";
    modelStatus.textContent = "Lade Modellliste\u2026";
    try {
      const result = await resolveModel(modelField);
      let text = `Aktuelles Modell: ${result.id}`;
      if (result.score != null) text += ` \xB7 Score: ${result.score}`;
      if (result.context_length != null) text += ` \xB7 Kontext: ${Math.round(result.context_length / 1e3)}k`;
      modelStatus.textContent = text;
    } catch (e) {
      modelStatus.textContent = `Fehler: ${e.message}`;
    }
  }
  modelInput.addEventListener("blur", () => validateAndShowModel(modelInput.value.trim()));
  document.getElementById("reloadModelBtn").addEventListener("click", async () => {
    await clearModelCache();
    await validateAndShowModel(modelInput.value.trim());
  });
  var githubToggle = document.getElementById("githubExportEnabled");
  var githubFields = document.getElementById("githubFields");
  githubToggle.addEventListener("change", () => {
    githubFields.style.display = githubToggle.checked ? "block" : "none";
  });
  document.getElementById("resetPrompt").addEventListener("click", () => {
    document.getElementById("distillerPrompt").value = DEFAULT_PROMPT;
  });
  async function loadSettings() {
    await migrateFromSync();
    const s = await chrome.storage.local.get([
      "provider",
      "geminiApiKey",
      "openaiApiKey",
      "openaiModel",
      "openrouterApiKey",
      "openrouterModel",
      "distillerPrompt",
      "distillerLang",
      "postComment",
      "showInPopup",
      "githubExportEnabled",
      "githubPat",
      "githubRepo",
      "githubSubfolder",
      "githubFormat"
    ]);
    providerSelect.value = s.provider ?? "gemini";
    showProviderSection(providerSelect.value);
    document.getElementById("geminiApiKey").value = s.geminiApiKey ?? "";
    document.getElementById("openaiApiKey").value = s.openaiApiKey ?? "";
    document.getElementById("openaiModel").value = s.openaiModel ?? "gpt-4o-mini";
    document.getElementById("openrouterApiKey").value = s.openrouterApiKey ?? "";
    const orModel = s.openrouterModel ?? "";
    modelInput.value = orModel;
    if (orModel) validateAndShowModel(orModel);
    document.getElementById("distillerPrompt").value = s.distillerPrompt || DEFAULT_PROMPT;
    langSelect.value = s.distillerLang ?? detectBrowserLang();
    document.getElementById("postComment").checked = s.postComment !== false;
    document.getElementById("showInPopup").checked = s.showInPopup !== false;
    const githubEnabled = s.githubExportEnabled ?? false;
    githubToggle.checked = githubEnabled;
    githubFields.style.display = githubEnabled ? "block" : "none";
    document.getElementById("githubPat").value = s.githubPat ?? "";
    document.getElementById("githubRepo").value = s.githubRepo ?? "";
    document.getElementById("githubSubfolder").value = s.githubSubfolder ?? "yt-summaries";
    document.getElementById("githubFormat").value = s.githubFormat ?? "markdown";
  }
  var saveBtn = document.getElementById("saveBtn");
  var statusEl = document.getElementById("status");
  saveBtn.addEventListener("click", async () => {
    const provider = providerSelect.value;
    const settings = {
      provider,
      geminiApiKey: document.getElementById("geminiApiKey").value.trim(),
      openaiApiKey: document.getElementById("openaiApiKey").value.trim(),
      openaiModel: document.getElementById("openaiModel").value.trim() || "gpt-4o-mini",
      openrouterApiKey: document.getElementById("openrouterApiKey").value.trim(),
      openrouterModel: modelInput.value.trim(),
      distillerPrompt: document.getElementById("distillerPrompt").value.trim() || DEFAULT_PROMPT,
      distillerLang: langSelect.value || detectBrowserLang(),
      postComment: document.getElementById("postComment").checked,
      showInPopup: document.getElementById("showInPopup").checked,
      githubExportEnabled: githubToggle.checked,
      githubPat: document.getElementById("githubPat").value.trim(),
      githubRepo: document.getElementById("githubRepo").value.trim(),
      githubSubfolder: document.getElementById("githubSubfolder").value.trim(),
      githubFormat: document.getElementById("githubFormat").value
    };
    const keyFieldMap = {
      gemini: "geminiApiKey",
      openai: "openaiApiKey",
      openrouter: "openrouterApiKey"
    };
    if (!settings[keyFieldMap[provider]]) {
      statusEl.textContent = chrome.i18n.getMessage("msg_no_key") || "API key required.";
      statusEl.className = "status error visible";
      setTimeout(() => {
        statusEl.className = "status";
      }, 3e3);
      return;
    }
    await chrome.storage.local.set(settings);
    statusEl.textContent = chrome.i18n.getMessage("msg_saved") || "Saved \u2713";
    statusEl.className = "status visible";
    setTimeout(() => {
      statusEl.className = "status";
    }, 3e3);
  });
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const msg = chrome.i18n.getMessage(el.getAttribute("data-i18n"));
    if (msg) el.textContent = msg;
  });
  loadSettings();
})();
