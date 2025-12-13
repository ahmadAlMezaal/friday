import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { LLMProvider, LLMResponse, UNCERTAINTY_PATTERNS } from '../types.js';

export class OpenAIProvider implements LLMProvider {
  name = 'openai';
  private client: ChatOpenAI;
  private modelName: string;

  constructor(apiKey: string, modelName: string = 'gpt-4.1') {
    if (!apiKey) {
      throw new Error(
        'OpenAI API key is required.\n' +
          'Please set OPENAI_API_KEY environment variable.'
      );
    }

    this.modelName = modelName;
    this.client = new ChatOpenAI({
      openAIApiKey: apiKey,
      modelName: this.normalizeModelName(modelName),
      temperature: 0.7,
    });
  }

  private normalizeModelName(name: string): string {
    // Map friendly names to actual model names
    const modelMap: Record<string, string> = {
      'gpt-4.1': 'gpt-4-turbo-preview',
      'gpt-4': 'gpt-4',
      'gpt-4-turbo': 'gpt-4-turbo-preview',
      'gpt-3.5': 'gpt-3.5-turbo',
      'gpt-3.5-turbo': 'gpt-3.5-turbo',
    };
    return modelMap[name] || name;
  }

  async generateResponse(prompt: string, context?: string): Promise<LLMResponse> {
    const systemPrompt = `You are a helpful software engineering assistant providing a second opinion on code and architecture decisions.
Your role is to:
1. Analyze the given task or problem
2. Provide alternative perspectives or solutions
3. Highlight potential issues or edge cases
4. Suggest best practices

Be concise but thorough. If you're uncertain about something, say so explicitly.`;

    const messages = [
      new SystemMessage(systemPrompt),
      new HumanMessage(context ? `Context:\n${context}\n\nTask:\n${prompt}` : prompt),
    ];

    const response = await this.client.invoke(messages);
    const content = typeof response.content === 'string'
      ? response.content
      : JSON.stringify(response.content);

    const uncertaintyIndicators = this.detectUncertainty(content);

    return {
      content,
      model: `openai:${this.modelName}`,
      confidence: uncertaintyIndicators.length > 0 ? 0.7 : 0.9,
      uncertaintyIndicators,
    };
  }

  private detectUncertainty(text: string): string[] {
    const indicators: string[] = [];
    for (const pattern of UNCERTAINTY_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        indicators.push(match[0]);
      }
    }
    return indicators;
  }
}
