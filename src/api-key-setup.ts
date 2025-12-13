/**
 * Interactive API Key Setup
 *
 * Guides users through missing API key configuration without crashing.
 * Keys are stored in-memory only - never persisted to disk automatically.
 */

import * as readline from 'readline';
import { colors, symbols, renderError, renderSuccess, renderWarning } from './ui.js';

// In-memory key storage for this session
const sessionKeys: {
  anthropicApiKey?: string;
  openaiApiKey?: string;
  geminiApiKey?: string;
} = {};

export interface KeyRequirements {
  anthropic: boolean; // Always required (primary agent)
  openai: boolean;    // Required only if advisor enabled
  gemini: boolean;    // Required only if advisor enabled
}

export interface MissingKeys {
  anthropic: boolean;
  openai: boolean;
  gemini: boolean;
}

/**
 * Check if running in interactive mode (TTY attached)
 */
export function isInteractiveMode(): boolean {
  return process.stdin.isTTY === true;
}

/**
 * Get the current key value (from env or session)
 */
export function getKey(keyName: 'anthropic' | 'openai' | 'gemini'): string | undefined {
  const envMap = {
    anthropic: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
    gemini: 'GEMINI_API_KEY',
  };

  const sessionMap = {
    anthropic: sessionKeys.anthropicApiKey,
    openai: sessionKeys.openaiApiKey,
    gemini: sessionKeys.geminiApiKey,
  };

  // Session keys take precedence
  return sessionMap[keyName] || process.env[envMap[keyName]];
}

/**
 * Store a key in session memory
 */
export function setSessionKey(keyName: 'anthropic' | 'openai' | 'gemini', value: string): void {
  switch (keyName) {
    case 'anthropic':
      sessionKeys.anthropicApiKey = value;
      break;
    case 'openai':
      sessionKeys.openaiApiKey = value;
      break;
    case 'gemini':
      sessionKeys.geminiApiKey = value;
      break;
  }
}

/**
 * Detect which required keys are missing
 */
export function detectMissingKeys(requirements: KeyRequirements): MissingKeys {
  return {
    anthropic: requirements.anthropic && !getKey('anthropic'),
    openai: requirements.openai && !getKey('openai'),
    gemini: requirements.gemini && !getKey('gemini'),
  };
}

/**
 * Check if any required keys are missing
 */
export function hasMissingKeys(missing: MissingKeys): boolean {
  return missing.anthropic || missing.openai || missing.gemini;
}

/**
 * Check if the primary (Anthropic) key is missing
 */
export function isMissingPrimaryKey(missing: MissingKeys): boolean {
  return missing.anthropic;
}

/**
 * Get key descriptions for user prompts
 */
function getKeyInfo(keyName: 'anthropic' | 'openai' | 'gemini'): {
  displayName: string;
  envVar: string;
  description: string;
  required: boolean;
} {
  const info = {
    anthropic: {
      displayName: 'Anthropic (Claude)',
      envVar: 'ANTHROPIC_API_KEY',
      description: 'Required for the primary Claude agent that handles all tasks.',
      required: true,
    },
    openai: {
      displayName: 'OpenAI',
      envVar: 'OPENAI_API_KEY',
      description: 'Used by the OpenAI advisor when Claude needs a second opinion.',
      required: false,
    },
    gemini: {
      displayName: 'Google Gemini',
      envVar: 'GEMINI_API_KEY',
      description: 'Used by the Gemini advisor when Claude needs a second opinion.',
      required: false,
    },
  };

  return info[keyName];
}

/**
 * Prompt user for a single API key (with hidden input)
 */
async function promptForKey(
  keyName: 'anthropic' | 'openai' | 'gemini',
  rl: readline.Interface
): Promise<string | null> {
  const info = getKeyInfo(keyName);

  console.log('');
  console.log(colors.primary(`${symbols.star} ${info.displayName} API Key`));
  console.log(colors.textDim(`   ${info.description}`));
  console.log(colors.textDim(`   Environment variable: ${info.envVar}`));
  console.log('');

  return new Promise((resolve) => {
    // Note: We can't truly hide input in Node.js readline without additional packages
    // But we inform users the key will be stored in-memory only
    console.log(colors.textDim('   (Key will be stored in-memory for this session only)'));

    rl.question(colors.text(`   Enter ${info.envVar}: `), (answer) => {
      const trimmed = answer.trim();
      if (trimmed) {
        resolve(trimmed);
      } else {
        resolve(null);
      }
    });
  });
}

/**
 * Ask user if they want to skip an optional key
 */
async function promptSkipOptional(
  keyName: 'openai' | 'gemini',
  rl: readline.Interface
): Promise<boolean> {
  const info = getKeyInfo(keyName);

  return new Promise((resolve) => {
    rl.question(
      colors.textDim(`   Skip ${info.displayName} advisor? (y/N): `),
      (answer) => {
        const lower = answer.trim().toLowerCase();
        resolve(lower === 'y' || lower === 'yes');
      }
    );
  });
}

/**
 * Print instructions for permanently adding a key to .env
 */
function printPermanentSetupInstructions(keyName: 'anthropic' | 'openai' | 'gemini'): void {
  const info = getKeyInfo(keyName);

  console.log('');
  console.log(colors.primary(`${symbols.bullet} To add ${info.envVar} permanently:`));
  console.log('');
  console.log(colors.textDim('   Option 1: Add to your shell profile (~/.bashrc, ~/.zshrc):'));
  console.log(colors.text(`     export ${info.envVar}="your-key-here"`));
  console.log('');
  console.log(colors.textDim('   Option 2: Add to .env file in your project:'));
  console.log(colors.text(`     echo '${info.envVar}=your-key-here' >> .env`));
  console.log('');
}

/**
 * Ask user if they want permanent setup instructions
 */
async function askForInstructions(rl: readline.Interface): Promise<boolean> {
  return new Promise((resolve) => {
    rl.question(
      colors.textDim('\n   Show instructions for adding keys permanently? (y/N): '),
      (answer) => {
        const lower = answer.trim().toLowerCase();
        resolve(lower === 'y' || lower === 'yes');
      }
    );
  });
}

/**
 * Interactive flow to collect missing API keys
 * Returns true if all required keys are now available, false otherwise
 */
export async function promptForMissingKeys(
  requirements: KeyRequirements,
  missing: MissingKeys
): Promise<boolean> {
  // Check if we're in interactive mode
  if (!isInteractiveMode()) {
    // Non-interactive mode - fail fast with helpful message
    console.error(renderError('Missing required API keys in non-interactive mode.'));

    if (missing.anthropic) {
      console.error(colors.error('  ANTHROPIC_API_KEY is required (primary agent)'));
    }
    if (missing.openai) {
      console.error(colors.warning('  OPENAI_API_KEY is missing (OpenAI advisor)'));
    }
    if (missing.gemini) {
      console.error(colors.warning('  GEMINI_API_KEY is missing (Gemini advisor)'));
    }

    console.error('');
    console.error(colors.textDim('Set environment variables or add them to your .env file.'));
    console.error(colors.textDim('Run in an interactive terminal to configure keys interactively.'));
    console.error('');

    return false;
  }

  // Create readline interface for interactive prompts
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log('');
  console.log(colors.primary('─'.repeat(50)));
  console.log(colors.primary.bold(`  ${symbols.star} API Key Configuration`));
  console.log(colors.primary('─'.repeat(50)));
  console.log('');
  console.log(colors.textDim('  Some API keys are missing. Friday will guide you through setup.'));
  console.log(colors.textDim('  Keys entered here are stored in-memory only for this session.'));

  let success = true;
  const keysConfigured: ('anthropic' | 'openai' | 'gemini')[] = [];

  try {
    // Handle Anthropic key (required)
    if (missing.anthropic) {
      const key = await promptForKey('anthropic', rl);

      if (key) {
        setSessionKey('anthropic', key);
        keysConfigured.push('anthropic');
        console.log(renderSuccess('Anthropic API key configured for this session.'));
      } else {
        console.log(renderError('Anthropic API key is required. Cannot continue.'));
        success = false;
      }
    }

    // Handle OpenAI key (optional advisor)
    if (success && missing.openai) {
      const skip = await promptSkipOptional('openai', rl);

      if (!skip) {
        const key = await promptForKey('openai', rl);

        if (key) {
          setSessionKey('openai', key);
          keysConfigured.push('openai');
          console.log(renderSuccess('OpenAI API key configured for this session.'));
        } else {
          console.log(renderWarning('OpenAI advisor will not be available this session.'));
        }
      } else {
        console.log(renderWarning('Skipped OpenAI advisor configuration.'));
      }
    }

    // Handle Gemini key (optional advisor)
    if (success && missing.gemini) {
      const skip = await promptSkipOptional('gemini', rl);

      if (!skip) {
        const key = await promptForKey('gemini', rl);

        if (key) {
          setSessionKey('gemini', key);
          keysConfigured.push('gemini');
          console.log(renderSuccess('Gemini API key configured for this session.'));
        } else {
          console.log(renderWarning('Gemini advisor will not be available this session.'));
        }
      } else {
        console.log(renderWarning('Skipped Gemini advisor configuration.'));
      }
    }

    // Offer permanent setup instructions
    if (success && keysConfigured.length > 0) {
      const showInstructions = await askForInstructions(rl);

      if (showInstructions) {
        for (const keyName of keysConfigured) {
          printPermanentSetupInstructions(keyName);
        }
      }
    }

  } finally {
    rl.close();
  }

  if (success) {
    console.log('');
    console.log(colors.primary('─'.repeat(50)));
    console.log(renderSuccess('API key setup complete. Continuing...'));
    console.log(colors.primary('─'.repeat(50)));
    console.log('');
  }

  return success;
}

/**
 * Render missing keys summary (for startup display)
 */
export function renderMissingKeysSummary(missing: MissingKeys): string {
  const lines: string[] = [];

  if (missing.anthropic) {
    lines.push(colors.error(`  ${symbols.cross} ANTHROPIC_API_KEY (required)`));
  }
  if (missing.openai) {
    lines.push(colors.warning(`  ${symbols.bullet} OPENAI_API_KEY (optional advisor)`));
  }
  if (missing.gemini) {
    lines.push(colors.warning(`  ${symbols.bullet} GEMINI_API_KEY (optional advisor)`));
  }

  return lines.join('\n');
}
