import { CliOptions } from './types.js';

export interface Config {
  openaiApiKey?: string;
  geminiApiKey?: string;
  workingDirectory: string;
  options: CliOptions;
}

export function loadConfig(options: CliOptions): Config {
  const openaiApiKey = process.env.OPENAI_API_KEY;
  const geminiApiKey = process.env.GEMINI_API_KEY;

  return {
    openaiApiKey,
    geminiApiKey,
    workingDirectory: options.cwd || process.cwd(),
    options,
  };
}

export function validateConfig(config: Config): void {
  const secondary = config.options.modelSecondary;

  if (secondary.startsWith('openai:') && !config.openaiApiKey) {
    throw new Error(
      'OPENAI_API_KEY environment variable is required when using OpenAI as secondary model.\n' +
        'Please set it: export OPENAI_API_KEY=your-key-here'
    );
  }

  if (secondary.startsWith('gemini:') && !config.geminiApiKey) {
    throw new Error(
      'GEMINI_API_KEY environment variable is required when using Gemini as secondary model.\n' +
        'Please set it: export GEMINI_API_KEY=your-key-here'
    );
  }
}

export function parseModelSpec(modelSpec: string): { provider: string; model: string } {
  const parts = modelSpec.split(':');
  if (parts.length === 2) {
    return { provider: parts[0], model: parts[1] };
  }
  return { provider: modelSpec, model: 'default' };
}
