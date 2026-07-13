# Changelog

## [Unreleased]

### Fixed
- `sync.yml`: replace `git merge --ff-only upstream/main` with `git reset --hard upstream/main` + `git push --force-with-lease`; `upstream-sync` is a pure upstream mirror, so mirror-reset always succeeds — ff-merge failed permanently after the branch rename left `upstream-sync` pointing at full fork history (diverged from upstream)

## [1.3.1-smoochy-v1] – 2026-06-20

### Fixed
- `chrome.storage.local.get` returns `undefined` instead of `{}` in Firefox options page context; add `?? {}` fallback in `migrateFromSync` and `loadSettings` to prevent crash before `populateAnthropicModels` runs (caused empty model dropdown)

### Added
- AMO unlisted signing in `build.yml`: `.xpi` is now Mozilla-signed via `web-ext sign --channel=unlisted` before release, enabling direct Firefox installation without browser workarounds (`AMO_JWT_ISSUER` + `AMO_JWT_SECRET` GitHub secrets required)
- Multi-provider AI support: Anthropic/Claude, OpenAI, and OpenRouter alongside Gemini
- Anthropic provider (`AnthropicProvider`) using Messages API; API key + model selector; model list fetched from [smoochy/openrouter-model-list](https://github.com/smoochy/openrouter-model-list) with 48h `chrome.storage.local` cache; default model `claude-haiku-4-5-20251001`
- OpenRouter custom model ID field: free-text input validated against OpenRouter `/api/v1/models` on save; takes priority over dropdown; `openrouterCustomModel` override in provider factory
- `validateModelId(modelsUrl, modelId)` in `model-list.js` with 1h `chrome.storage.local` cache
- OpenRouter model field accepts model name or models.json URL; auto-picks top-scored model
- Comment posting can be disabled via Verhalten settings tab
- GitHub repo export: saves transcript + summary as Markdown and/or JSON
- Tabbed settings page (AI Provider / Verhalten / GitHub Export)
- esbuild bundler for ES module source in `src/`
- `https://api.anthropic.com/*` added to manifest permissions
- Auto-versioning in `build.yml`: release tag computed from `package.json` version + smoochy commit count; no manual `v*` tagging needed
- Manual `workflow_dispatch` for `build.yml`: re-releases same version by deleting and recreating the release
- `CLAUDE.md` repo working guide
- Factory test for `createProvider('anthropic')` path in `anthropic-provider.test.js`

### Fixed
- `loadProviderSettings` in `src/content.js` now reads `anthropicApiKey`, `anthropicModel`, and `openrouterCustomModel` from storage (were missing, causing Anthropic/custom OpenRouter settings to be silently ignored)
- `build.yml` heredoc delimiter randomized with `openssl rand -hex 8` to prevent injection if a commit message line equals `EOF`
- Bundle artifacts (`content.js`, `options.js`) rebuilt to include all provider storage keys
- `npm ci --legacy-peer-deps` to resolve optional peer dep conflict (`node-fetch@2.6.11` vs `2.7.0` from `addons-scanner-utils`)
- `populateAnthropicModels()` reads `display_name` instead of `name` to match new `anthropic-models.json` format

### Changed
- All settings now stored in `chrome.storage.local` (migrated from sync on first run)
- `package.json` version reset to `1.3.1` to mirror upstream (release tag is the canonical version identifier)
- `build.yml` no longer triggers on `v*` tags; replaced by auto-versioning

### Removed
- `scripts/extract-release-notes.sh` and `RELEASE_NOTES.md` (replaced by auto-versioning)

## [1.3.1] – upstream

See https://github.com/michaelruck/yt-transcript-distiller/releases
