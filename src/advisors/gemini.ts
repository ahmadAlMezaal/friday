import { AdvisorResponse } from '../types.js';

export interface GeminiAdvisorOptions {
  apiKey: string;
  model?: string;
}

/**
 * Gemini advisor - stub implementation for future support.
 * Returns an informative error message.
 */
export async function askGemini(
  _prompt: string,
  options: GeminiAdvisorOptions
): Promise<AdvisorResponse> {
  if (!options.apiKey) {
    return {
      response: '',
      model: 'gemini',
      error: 'Gemini API key not configured. Set GEMINI_API_KEY environment variable.',
    };
  }

  // TODO: Implement Gemini API integration
  // For now, return an informative message
  return {
    response: '',
    model: 'gemini',
    error:
      'Gemini advisor is not yet fully implemented. ' +
      'The API key is configured but the integration is pending. ' +
      'Use OpenAI as an advisor in the meantime.',
  };
}
