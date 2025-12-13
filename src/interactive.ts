/**
 * Interactive REPL Mode
 *
 * A short-lived session for multi-turn Claude interactions.
 *
 * Design constraints:
 * - Session exists only for the lifetime of the process
 * - No persistence across runs
 * - No background file watching
 * - Claude remains the single reasoning brain
 * - All writes respect --workspace sandbox
 * - Writes require --apply OR explicit confirmation (y/N)
 */

import * as readline from 'readline';
import {
  InteractiveSession,
  SessionMessage,
  InteractiveOptions,
  CliOptions,
} from './types.js';
import { runOrchestrator } from './router.js';
import { gitDiff, runCommand } from './mcp/tools/index.js';
import { ALLOWED_COMMANDS } from './types.js';
import {
  colors,
  symbols,
  renderHeader,
  getPrompt,
  getModeDisplay,
  renderThinking,
  renderResponseStart,
  renderResponseEnd,
  renderToolCall,
  renderAdvisorResult,
  renderStatus,
  renderHelp,
  renderGoodbye,
  renderInterrupted,
  renderError,
  renderSystemMessage,
  shortenPath,
} from './ui.js';

// Built-in command handlers
interface BuiltinCommand {
  name: string;
  aliases: string[];
  description: string;
  handler: (session: InteractiveSession, args: string) => Promise<boolean>; // returns true to continue, false to exit
}

const BUILTIN_COMMANDS: BuiltinCommand[] = [
  {
    name: 'exit',
    aliases: ['quit', 'q'],
    description: 'Exit the interactive session',
    handler: async () => {
      console.log(renderGoodbye());
      return false;
    },
  },
  {
    name: 'help',
    aliases: ['h', '?'],
    description: 'Show available commands',
    handler: async () => {
      console.log(renderHelp());
      console.log(colors.primary('Allowed commands for !run:'));
      console.log(colors.textDim('  ' + ALLOWED_COMMANDS.join(', ')));
      console.log('');
      console.log(colors.primary('Usage:'));
      console.log(colors.textDim('  Type any task to send to Claude'));
      console.log(colors.textDim('  Prefix with ! for built-in commands'));
      console.log('');
      return true;
    },
  },
  {
    name: 'diff',
    aliases: ['d'],
    description: 'Show current git diff',
    handler: async (session) => {
      try {
        const result = await gitDiff({ cwd: session.cwd });
        if (result.diff && !result.diff.includes('No changes')) {
          console.log(`\n${colors.primary('Git diff:')}`);
          console.log(result.diff);
        } else {
          console.log(renderSystemMessage('No uncommitted changes.'));
        }
      } catch (error) {
        console.log(colors.warning('\nNot a git repository or git error.\n'));
      }
      return true;
    },
  },
  {
    name: 'status',
    aliases: ['s'],
    description: 'Show session status',
    handler: async (session) => {
      const duration = Math.round((Date.now() - session.startedAt.getTime()) / 1000);
      const mode = session.options.apply ? 'apply' : session.options.approve ? 'approve' : 'dry-run';

      console.log(renderStatus({
        workspace: session.workspace,
        cwd: session.cwd,
        mode,
        advisors: session.options.advisors,
        messageCount: session.messages.length,
        durationSeconds: duration,
      }));
      return true;
    },
  },
  {
    name: 'run',
    aliases: ['r'],
    description: 'Run an allowed command',
    handler: async (session, args) => {
      const cmd = args.trim();
      if (!cmd) {
        console.log(colors.warning('\nUsage: !run <command>'));
        console.log(colors.textDim('Allowed: ' + ALLOWED_COMMANDS.join(', ') + '\n'));
        return true;
      }

      try {
        console.log(`\n${colors.primary(`${symbols.gear} Running:`)} ${cmd}\n`);
        const result = await runCommand(cmd, { cwd: session.cwd });

        if (result.exitCode === 0) {
          console.log(colors.success(`${symbols.check} Command succeeded`));
        } else {
          console.log(colors.error(`${symbols.cross} Command failed (exit code: ${result.exitCode})`));
        }

        if (result.stdout) {
          console.log(result.stdout);
        }
        if (result.stderr) {
          console.log(colors.warning(result.stderr));
        }
        console.log('');
      } catch (error) {
        console.log(renderError(error instanceof Error ? error.message : 'Unknown error'));
      }
      return true;
    },
  },
  {
    name: 'clear',
    aliases: ['c'],
    description: 'Clear conversation history',
    handler: async (session) => {
      session.messages = [];
      console.log(renderSystemMessage('Conversation history cleared.\n'));
      return true;
    },
  },
];

function parseBuiltinCommand(input: string): { command: string; args: string } | null {
  if (!input.startsWith('!')) return null;

  const trimmed = input.slice(1).trim();
  const spaceIdx = trimmed.indexOf(' ');

  if (spaceIdx === -1) {
    return { command: trimmed.toLowerCase(), args: '' };
  }

  return {
    command: trimmed.slice(0, spaceIdx).toLowerCase(),
    args: trimmed.slice(spaceIdx + 1),
  };
}

function findBuiltinCommand(name: string): BuiltinCommand | undefined {
  return BUILTIN_COMMANDS.find(
    (cmd) => cmd.name === name || cmd.aliases.includes(name)
  );
}

function buildContextFromHistory(session: InteractiveSession): string {
  if (session.messages.length === 0) return '';

  const contextParts: string[] = ['## Conversation History (this session only)'];

  // Include last N messages to keep context manageable
  const recentMessages = session.messages.slice(-10);

  for (const msg of recentMessages) {
    const role = msg.role === 'user' ? 'User' : 'Assistant';
    // Truncate long messages in history context
    const content = msg.content.length > 500
      ? msg.content.slice(0, 500) + '... (truncated)'
      : msg.content;
    contextParts.push(`\n### ${role}:\n${content}`);
  }

  return contextParts.join('\n');
}

async function processTask(
  session: InteractiveSession,
  task: string
): Promise<void> {
  // Add user message to history
  session.messages.push({
    role: 'user',
    content: task,
    timestamp: new Date(),
  });

  // Build options with task
  const options: CliOptions = {
    ...session.options,
    task,
  };

  // Build context from conversation history
  const historyContext = buildContextFromHistory(session);

  // Construct task with history context
  const taskWithContext = historyContext
    ? `${historyContext}\n\n## Current Task\n${task}`
    : task;

  console.log(renderThinking());

  try {
    const result = await runOrchestrator(taskWithContext, options);

    // Display tool calls if verbose
    if (session.options.verbose && result.toolCalls.length > 0) {
      for (const call of result.toolCalls) {
        console.log(renderToolCall(call.tool));
      }
      console.log('');
    }

    // Display advisor consultations if any
    if (result.advisorResponses.length > 0) {
      console.log(colors.primary('Advisors:'));
      for (const advisor of result.advisorResponses) {
        console.log('  ' + renderAdvisorResult(advisor.model, advisor.error));
      }
      console.log('');
    }

    // Display Claude's response with styled header
    console.log(renderResponseStart());
    console.log(result.response.content);
    console.log(renderResponseEnd());
    console.log('');

    // Add assistant response to history
    session.messages.push({
      role: 'assistant',
      content: result.response.content,
      timestamp: new Date(),
    });
  } catch (error) {
    console.log(renderError(error instanceof Error ? error.message : 'Unknown error'));
  }
}

export async function runInteractiveSession(options: InteractiveOptions): Promise<void> {
  // Initialize session
  const session: InteractiveSession = {
    messages: [],
    workspace: options.workspace,
    cwd: options.cwd || process.cwd(),
    options: {
      advisors: options.advisors,
      apply: options.apply,
      approve: options.approve,
      dryRun: options.dryRun,
      cwd: options.cwd,
      workspace: options.workspace,
      verbose: options.verbose,
      maxToolCalls: options.maxToolCalls,
      maxTurns: options.maxTurns,
    },
    startedAt: new Date(),
  };

  // Determine mode for header
  const mode = session.options.apply ? 'apply' : session.options.approve ? 'approve' : 'dry-run';

  // Print styled header
  console.log('\n' + renderHeader({
    workspace: session.workspace,
    mode: mode as 'dry-run' | 'approve' | 'apply',
    advisors: session.options.advisors,
  }));
  console.log('');

  // Create readline interface with styled prompt
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: getPrompt(),
  });

  // Handle line input
  rl.on('line', async (line) => {
    const input = line.trim();

    // Skip empty lines
    if (!input) {
      rl.prompt();
      return;
    }

    // Check for built-in command
    const builtin = parseBuiltinCommand(input);
    if (builtin) {
      const cmd = findBuiltinCommand(builtin.command);
      if (cmd) {
        const shouldContinue = await cmd.handler(session, builtin.args);
        if (!shouldContinue) {
          rl.close();
          return;
        }
      } else {
        console.log(colors.warning(`Unknown command: !${builtin.command}`));
        console.log(colors.textDim('Type !help for available commands\n'));
      }
      rl.prompt();
      return;
    }

    // Process as task for Claude
    await processTask(session, input);
    rl.prompt();
  });

  // Handle close
  rl.on('close', () => {
    process.exit(0);
  });

  // Handle SIGINT (Ctrl+C)
  rl.on('SIGINT', () => {
    console.log(renderInterrupted());
    rl.close();
  });

  // Start the prompt
  rl.prompt();
}
