# Changelog

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
- `https://api.anthropic.com/*` added to manifest permissions
- Anthropic section in options UI: API key field + model dropdown populated from `fetchAnthropicModels()` with error fallback; `anthropicApiKey` and `anthropicModel` saved to `chrome.storage.local`

### Changed
- All settings now stored in chrome.storage.local (migrated from sync on first run)

## [1.3.1] – upstream

See https://github.com/michaelruck/yt-transcript-distiller/releases
