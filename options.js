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
  var OR_MODEL_LIST_CACHE_KEY = "orFullModelListCache";
  var OR_MODEL_LIST_TTL_MS = 60 * 60 * 1e3;
  async function validateModelId(modelsUrl, modelId) {
    const stored = await chrome.storage.local.get([OR_MODEL_LIST_CACHE_KEY]);
    const entry = stored[OR_MODEL_LIST_CACHE_KEY];
    let models;
    if (entry && entry.url === modelsUrl && Date.now() - entry.cachedAt < OR_MODEL_LIST_TTL_MS) {
      models = entry.models;
    } else {
      const res = await fetch(modelsUrl);
      if (!res.ok) throw new Error(`OpenRouter model list fetch failed: HTTP ${res.status}`);
      const data = await res.json();
      models = (data.data ?? []).map((m) => m.id);
      await chrome.storage.local.set({
        [OR_MODEL_LIST_CACHE_KEY]: { url: modelsUrl, models, cachedAt: Date.now() }
      });
    }
    return models.includes(modelId);
  }

  // src/anthropic-model-list.js
  var CACHE_KEY2 = "anthropicModelListCache";
  var CACHE_TTL_MS2 = 48 * 60 * 60 * 1e3;
  var SOURCE_URL = "https://raw.githubusercontent.com/smoochy/openrouter-model-list/main/anthropic-models.json";
  async function fetchAnthropicModels() {
    const stored = await chrome.storage.local.get([CACHE_KEY2]);
    const entry = stored[CACHE_KEY2];
    if (entry && Date.now() - entry.cachedAt < CACHE_TTL_MS2) {
      return entry.result;
    }
    try {
      const res = await fetch(SOURCE_URL);
      if (!res.ok) throw new Error(`anthropic-model-list fetch failed: HTTP ${res.status}`);
      const result = await res.json();
      await chrome.storage.local.set({
        [CACHE_KEY2]: { result, cachedAt: Date.now() }
      });
      return result;
    } catch (err) {
      if (entry) return entry.result;
      throw err;
    }
  }

  // src/options/options.js
  async function migrateFromSync() {
    const local = await chrome.storage.local.get(["provider"]) ?? {};
    if (local.provider) return;
    const sync = await chrome.storage.sync.get(["geminiApiKey", "distillerPrompt", "distillerLang"]) ?? {};
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
  var customModelInput = document.getElementById("openrouterCustomModel");
  var customModelError = document.getElementById("openrouterCustomModelError");
  var orModelLabel = document.getElementById("openrouterModelLabel");
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
  function updateOrModelLabelStyle() {
    const filled = customModelInput.value.trim().length > 0;
    orModelLabel.style.color = filled ? "#555" : "";
  }
  customModelInput.addEventListener("input", updateOrModelLabelStyle);
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
  var anthropicModelSelect = document.getElementById("anthropicModel");
  async function populateAnthropicModels(savedModel) {
    try {
      const models = await fetchAnthropicModels();
      anthropicModelSelect.innerHTML = "";
      models.forEach(({ id, display_name }) => {
        const opt = document.createElement("option");
        opt.value = id;
        opt.textContent = display_name || id;
        anthropicModelSelect.appendChild(opt);
      });
      anthropicModelSelect.value = savedModel || (models[0]?.id ?? "claude-haiku-4-5-20251001");
    } catch {
      const opt = document.createElement("option");
      opt.value = savedModel || "claude-haiku-4-5-20251001";
      opt.textContent = savedModel || "claude-haiku-4-5-20251001";
      anthropicModelSelect.innerHTML = "";
      anthropicModelSelect.appendChild(opt);
    }
  }
  async function loadSettings() {
    await migrateFromSync();
    const s = await chrome.storage.local.get([
      "provider",
      "geminiApiKey",
      "openaiApiKey",
      "openaiModel",
      "openrouterApiKey",
      "openrouterModel",
      "openrouterCustomModel",
      "anthropicApiKey",
      "anthropicModel",
      "distillerPrompt",
      "distillerLang",
      "postComment",
      "showInPopup",
      "githubExportEnabled",
      "githubPat",
      "githubRepo",
      "githubSubfolder",
      "githubFormat"
    ]) ?? {};
    providerSelect.value = s.provider ?? "gemini";
    showProviderSection(providerSelect.value);
    document.getElementById("geminiApiKey").value = s.geminiApiKey ?? "";
    document.getElementById("openaiApiKey").value = s.openaiApiKey ?? "";
    document.getElementById("openaiModel").value = s.openaiModel ?? "gpt-4o-mini";
    document.getElementById("openrouterApiKey").value = s.openrouterApiKey ?? "";
    const orModel = s.openrouterModel ?? "";
    modelInput.value = orModel;
    if (orModel) validateAndShowModel(orModel);
    customModelInput.value = s.openrouterCustomModel ?? "";
    updateOrModelLabelStyle();
    document.getElementById("anthropicApiKey").value = s.anthropicApiKey ?? "";
    await populateAnthropicModels(s.anthropicModel);
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
    const customModel = customModelInput.value.trim();
    if (provider === "openrouter" && customModel) {
      customModelError.style.display = "none";
      try {
        const valid = await validateModelId(
          "https://openrouter.ai/api/v1/models",
          customModel
        );
        if (!valid) {
          customModelError.textContent = `Model '${customModel}' not found on OpenRouter. Check the ID and try again.`;
          customModelError.style.display = "block";
          return;
        }
      } catch (e) {
        customModelError.textContent = `Could not validate model: ${e.message}`;
        customModelError.style.display = "block";
        return;
      }
    } else {
      customModelError.style.display = "none";
    }
    const settings = {
      provider,
      geminiApiKey: document.getElementById("geminiApiKey").value.trim(),
      openaiApiKey: document.getElementById("openaiApiKey").value.trim(),
      openaiModel: document.getElementById("openaiModel").value.trim() || "gpt-4o-mini",
      openrouterApiKey: document.getElementById("openrouterApiKey").value.trim(),
      openrouterModel: modelInput.value.trim(),
      openrouterCustomModel: customModel,
      anthropicApiKey: document.getElementById("anthropicApiKey").value.trim(),
      anthropicModel: anthropicModelSelect.value || "claude-haiku-4-5-20251001",
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
      openrouter: "openrouterApiKey",
      anthropic: "anthropicApiKey"
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
