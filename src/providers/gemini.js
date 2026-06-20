import { BaseProvider } from './base.js';

export class GeminiProvider extends BaseProvider {
  constructor({ apiKey }) {
    super();
    this.apiKey = apiKey;
  }

  async summarize(transcript, prompt, options = {}) {
    const model = 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`;

    const body = {
      contents: [{ parts: [{ text: `${prompt}\n\n${transcript}` }] }],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 8192,
        thinkingConfig: { thinkingBudget: 0 },
      },
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = err?.error?.message || `HTTP ${res.status}`;
      if (res.status === 401 || res.status === 403) {
        chrome.storage.local.set({ invalidKey: true });
      }
      throw new Error(`Gemini API error: ${msg}`);
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Gemini returned no usable response.');
    return text.trim();
  }
}
