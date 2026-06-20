import { BaseProvider } from './base.js';

const BASE_URLS = {
  openai: 'https://api.openai.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
};

export class OpenAICompatProvider extends BaseProvider {
  constructor({ apiKey, model, providerType }) {
    super();
    this.apiKey = apiKey;
    this.model = model;
    this.providerType = providerType;
    this.baseUrl = BASE_URLS[providerType] ?? BASE_URLS.openai;
  }

  async summarize(transcript, prompt, options = {}) {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: transcript },
        ],
        temperature: 0.4,
        max_tokens: 8192,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = err?.error?.message || `HTTP ${res.status}`;
      throw new Error(`${this.providerType} API error: ${msg}`);
    }

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    if (!text) throw new Error(`${this.providerType} returned no usable response.`);
    return text.trim();
  }
}
