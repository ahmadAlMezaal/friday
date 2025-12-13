import { LLMProvider } from '../types.js';
import { OpenAIProvider } from './openai.js';
import { GeminiProvider } from './gemini.js';
import { parseModelSpec } from '../config.js';

export { OpenAIProvider } from './openai.js';
export { GeminiProvider } from './gemini.js';

export function createProvider(modelSpec: string): LLMProvider {
  const { provider, model } = parseModelSpec(modelSpec);

  switch (provider) {
    case 'openai': {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error(
          'OPENAI_API_KEY environment variable is required.\n' +
            'Please set it: export OPENAI_API_KEY=your-key-here'
        );
      }
      return new OpenAIProvider(apiKey, model);
    }

    case 'gemini': {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error(
          'GEMINI_API_KEY environment variable is required.\n' +
            'Please set it: export GEMINI_API_KEY=your-key-here'
        );
      }
      return new GeminiProvider(apiKey, model);
    }

    default:
      throw new Error(
        `Unknown provider: ${provider}\n` +
          'Supported providers: openai, gemini\n' +
          'Example: --modelSecondary=openai:gpt-4.1'
      );
  }
}
