import { LLMProvider, LLMResponse } from '../types.js';

/**
 * Gemini provider stub for future implementation.
 * This is a placeholder that throws an informative error.
 */
export class GeminiProvider implements LLMProvider {
  name = 'gemini';

  constructor(_apiKey: string, _modelName: string = 'gemini-pro') {
    // Stub - will be implemented when Gemini support is added
  }

  async generateResponse(_prompt: string, _context?: string): Promise<LLMResponse> {
    throw new Error(
      'Gemini provider is not yet implemented.\n' +
        'Please use OpenAI as the secondary model for now:\n' +
        '  --modelSecondary=openai:gpt-4.1'
    );
  }
}
