import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { AdvisorResponse } from '../types.js';

export interface OpenAIAdvisorOptions {
  apiKey: string;
  model?: string;
}

const ADVISOR_SYSTEM_PROMPT = `You are a software engineering advisor providing a second opinion.

Your role is to:
1. Analyze the given question or problem
2. Provide your perspective and recommendations
3. Highlight any concerns or alternative approaches
4. Be concise but thorough

You are NOT the primary decision maker. You are providing input to another AI that will make the final decision.
Focus on being helpful and offering unique insights.`;

export async function askOpenAI(
  prompt: string,
  options: OpenAIAdvisorOptions
): Promise<AdvisorResponse> {
  if (!options.apiKey) {
    return {
      response: '',
      model: 'openai',
      error: 'OpenAI API key not configured. Set OPENAI_API_KEY environment variable.',
    };
  }

  try {
    const modelName = normalizeModelName(options.model || 'gpt-4-turbo');

    const client = new ChatOpenAI({
      openAIApiKey: options.apiKey,
      modelName,
      temperature: 0.7,
    });

    const messages = [
      new SystemMessage(ADVISOR_SYSTEM_PROMPT),
      new HumanMessage(prompt),
    ];

    const response = await client.invoke(messages);
    const content =
      typeof response.content === 'string'
        ? response.content
        : JSON.stringify(response.content);

    return {
      response: content,
      model: `openai:${modelName}`,
    };
  } catch (error) {
    return {
      response: '',
      model: 'openai',
      error: error instanceof Error ? error.message : 'Unknown error calling OpenAI',
    };
  }
}

function normalizeModelName(name: string): string {
  const modelMap: Record<string, string> = {
    'gpt-4.1': 'gpt-4-turbo',
    'gpt-4': 'gpt-4',
    'gpt-4-turbo': 'gpt-4-turbo',
    'gpt-3.5': 'gpt-3.5-turbo',
    'gpt-3.5-turbo': 'gpt-3.5-turbo',
  };
  return modelMap[name] || name;
}
