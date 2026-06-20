export class BaseProvider {
  async summarize(transcript, prompt, options = {}) {
    throw new Error('Not implemented');
  }
}
