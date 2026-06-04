# YouTube Transcript Distiller

> A Firefox add-on that reads YouTube videos so you don't have to.

You open a video. Twelve minutes. You watch. You wait. The one insight you came for arrives at minute nine — buried under filler, recaps, and sponsor breaks.

**YouTube Transcript Distiller** fetches the full transcript, sends it to Google Gemini AI, and posts a clean summary directly into the YouTube comment field. One click. The important points, right where other viewers can see them.

---

## Features

- **AI-powered summarization** via Google Gemini (free API key required)
- **Posts directly into the YouTube comment field** — formatted and ready to publish
- **Fully customizable prompt** — change the instruction to anything you want
- **11 languages supported:** Arabic, Chinese, English, French, German, Hindi, Japanese, Korean, Portuguese, Russian, Spanish
- **UI adapts to your browser language** automatically
- **Quota countdown** — if you hit the Gemini rate limit, the button shows a live countdown
- **Privacy first** — your API key stays in your browser, anonymous usage stats can be disabled in settings

---

## Installation

### Firefox Add-On Store *(pending approval)*
The add-on has been submitted to [addons.mozilla.org](https://addons.mozilla.org). Link will be updated here once approved.

### Manual installation (Firefox Developer Edition / Nightly)
1. Download the latest `yt-transcript-distiller.xpi` from [Releases](https://github.com/michaelruck/yt-transcript-distiller/releases)
2. In Firefox: `about:config` → set `xpinstall.signatures.required` to `false`
3. `about:addons` → gear icon → *Install Add-on from File* → select the `.xpi`

---

## Setup

1. Get a free Gemini API key at [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
2. Open any YouTube video
3. Click the gear icon next to the **Transcript Distiller** button
4. Enter your API key and save
5. Click **Transcript Distiller** — the AI summary appears in the comment field

---

## How it works

```
YouTube Video
     │
     ▼
Transcript fetch (YouTube Internal API → DOM fallback)
     │
     ▼
Google Gemini API (your API key, your quota)
     │
     ▼
Formatted summary → YouTube comment field
```

The add-on never stores or transmits your transcript data anywhere other than directly to the Gemini API. The API key is stored locally in your browser via `chrome.storage.sync`.

---

## Privacy

- **API key:** stored locally, sent only to `generativelanguage.googleapis.com`
- **Usage statistics:** an anonymous counter at `marsgasse.com` logs add-on name, action, language settings, and an hourly SHA256 IP hash — no personal data, no raw IPs. Can be disabled in the add-on settings.

---

## Permissions

| Permission | Reason |
|---|---|
| `storage` | Saves API key, prompt and language preference locally |
| `clipboardWrite` / `clipboardRead` | Required for text injection into YouTube's comment field |
| `youtube.com/*` | Content script runs on YouTube pages only |
| `generativelanguage.googleapis.com/*` | Gemini API calls |
| `marsgasse.com/*` | Anonymous usage counter |

---

## Customization

The prompt sent to Gemini is fully editable. Click the gear icon → edit the **Prompt** field. The default prompt instructs Gemini to produce a structured YouTube comment with bullet points, bold keywords, and blank lines between items — no raw Markdown, no HTML.

Click **↺ Reset** to restore the default prompt at any time.

---

## Requirements

- Firefox 140+ (Desktop) / Firefox for Android 142+
- A free [Google Gemini API key](https://aistudio.google.com/app/apikey)
- A YouTube video with subtitles/transcript available
- A Google account (required to post comments)

---

## Built at

[marsgasse.com](https://marsgasse.com) — Just another Basement Lab  
Michael Ruck · michael.ruck@marsgasse.com

---

## License

MIT
