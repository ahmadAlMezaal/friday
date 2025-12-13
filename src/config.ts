import { CliOptions } from "./types.js";
import "dotenv/config";

export interface Config {
  anthropicApiKey?: string;
  openaiApiKey?: string;
  geminiApiKey?: string;
  workingDirectory: string;
  options: CliOptions;
}

export function loadConfig(options: CliOptions): Config {
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  const openaiApiKey = process.env.OPENAI_API_KEY;
  const geminiApiKey = process.env.GEMINI_API_KEY;

  return {
    anthropicApiKey,
    openaiApiKey,
    geminiApiKey,
    workingDirectory: options.cwd || process.cwd(),
    options,
  };
}

export function validateConfig(config: Config): void {
  // Claude (primary) is always required
  if (!config.anthropicApiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY environment variable is required.\n" +
        "Claude is the primary agent and must be configured.\n" +
        "Please set it: export ANTHROPIC_API_KEY=your-key-here"
    );
  }

  // Validate advisor API keys if they're requested
  const advisors = config.options.advisors;

  if (advisors.includes("openai") && !config.openaiApiKey) {
    console.warn(
      "Warning: OpenAI advisor requested but OPENAI_API_KEY is not set.\n" +
        "Claude will receive an error if it tries to use the ask_openai tool.\n" +
        "Set it: export OPENAI_API_KEY=your-key-here\n"
    );
  }

  if (advisors.includes("gemini") && !config.geminiApiKey) {
    console.warn(
      "Warning: Gemini advisor requested but GEMINI_API_KEY is not set.\n" +
        "Claude will receive an error if it tries to use the ask_gemini tool.\n" +
        "Set it: export GEMINI_API_KEY=your-key-here\n"
    );
  }
}

export function parseModelSpec(modelSpec: string): {
  provider: string;
  model: string;
} {
  const parts = modelSpec.split(":");
  if (parts.length === 2) {
    return { provider: parts[0], model: parts[1] };
  }
  return { provider: modelSpec, model: "default" };
}
