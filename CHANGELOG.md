# Changelog

## [Unreleased]

### Added
- Anthropic/Claude provider: API key + model selector (fetched from smoochy/openrouter-model-list, 48h cache); default model `claude-haiku-4-5-20251001`
- OpenRouter custom model ID field: free-text input validated against OpenRouter `/api/v1/models` on save; takes priority over dropdown
- Auto-versioning in `build.yml`: release tag computed from `package.json` version + smoochy commit count; no manual `v*` tagging needed
- Manual `workflow_dispatch` for build.yml: re-releases same version by deleting and recreating the release
- `CLAUDE.md` repo working guide
- Factory test for `createProvider('anthropic')` path in `anthropic-provider.test.js`

### Fixed
- `loadProviderSettings` in `src/content.js` now reads `anthropicApiKey`, `anthropicModel`, and `openrouterCustomModel` from storage (were missing, causing Anthropic/custom OpenRouter settings to be silently ignored)
- `build.yml` heredoc delimiter randomized with `openssl rand -hex 8` to prevent injection if a commit message line equals `EOF`
- Bundle artifacts (`content.js`, `options.js`) rebuilt to include all provider storage keys

### Changed
- `package.json` version reset to `1.3.1` to mirror upstream (release tag is the canonical version identifier)
- `build.yml` no longer triggers on `v*` tags; replaced by auto-versioning
- `populateAnthropicModels()` reads `display_name` instead of `name` to match new `anthropic-models.json` format (full model objects from Anthropic API)

### Removed
- `scripts/extract-release-notes.sh` and `RELEASE_NOTES.md` (replaced by git log)

## [1.4.0] – 2026-06-20

### Added
- Multi-provider AI support: OpenAI and OpenRouter alongside Gemini
- OpenRouter model field accepts model name or models.json URL; auto-picks top-scored model
- Comment posting can be disabled via Verhalten settings tab
- GitHub repo export: saves transcript + summary as Markdown and/or JSON
- Tabbed settings page (AI Provider / Verhalten / GitHub Export)
- esbuild bundler for ES module source in src/
- Anthropic provider (`AnthropicProvider`) using Messages API with `claude-haiku-4-5-20251001` default model
- `fetchAnthropicModels()` with 48h cache in `chrome.storage.local` fetching from openrouter-model-list repo
- OpenRouter `openrouterCustomModel` override support in provider factory
- OpenRouter custom model free-text field in options UI with live validation against OpenRouter `/api/v1/models`; invalid IDs blocked from saving with inline error message
- `validateModelId(modelsUrl, modelId)` in `model-list.js` with 1h `chrome.storage.local` cache
- `https://api.anthropic.com/*` added to manifest permissions
- Anthropic section in options UI: API key field + model dropdown populated from `fetchAnthropicModels()` with error fallback; `anthropicApiKey` and `anthropicModel` saved to `chrome.storage.local`

### Changed
- All settings now stored in chrome.storage.local (migrated from sync on first run)

## [1.3.1] – upstream

See https://github.com/michaelruck/yt-transcript-distiller/releases
