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
import chalk from 'chalk';
import {
  InteractiveSession,
  SessionMessage,
  InteractiveOptions,
  CliOptions,
} from './types.js';
import { runOrchestrator } from './router.js';
import { gitDiff, runCommand } from './mcp/tools/index.js';
import { ALLOWED_COMMANDS } from './types.js';

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
      console.log(chalk.gray('\nGoodbye!\n'));
      return false;
    },
  },
  {
    name: 'help',
    aliases: ['h', '?'],
    description: 'Show available commands',
    handler: async () => {
      console.log(chalk.cyan('\nBuilt-in commands:'));
      console.log(chalk.white('  !exit, !quit, !q') + chalk.gray(' - Exit the session'));
      console.log(chalk.white('  !help, !h, !?') + chalk.gray('    - Show this help'));
      console.log(chalk.white('  !diff') + chalk.gray('            - Show current git diff'));
      console.log(chalk.white('  !status') + chalk.gray('          - Show session status'));
      console.log(chalk.white('  !run <cmd>') + chalk.gray('       - Run an allowed command'));
      console.log(chalk.white('  !clear') + chalk.gray('           - Clear conversation history'));
      console.log('');
      console.log(chalk.cyan('Allowed commands for !run:'));
      console.log(chalk.gray('  ' + ALLOWED_COMMANDS.join(', ')));
      console.log('');
      console.log(chalk.cyan('Usage:'));
      console.log(chalk.gray('  Type any task to send to Claude'));
      console.log(chalk.gray('  Prefix with ! for built-in commands'));
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
          console.log(chalk.cyan('\nGit diff:'));
          console.log(result.diff);
        } else {
          console.log(chalk.gray('\nNo uncommitted changes.\n'));
        }
      } catch (error) {
        console.log(chalk.yellow('\nNot a git repository or git error.\n'));
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
      const mins = Math.floor(duration / 60);
      const secs = duration % 60;

      console.log(chalk.cyan('\nSession status:'));
      console.log(chalk.white('  Workspace: ') + (session.workspace || chalk.gray('(none - read-only)')));
      console.log(chalk.white('  CWD: ') + session.cwd);
      console.log(chalk.white('  Mode: ') + getModeLabel(session.options));
      console.log(chalk.white('  Advisors: ') + (session.options.advisors.length > 0 ? session.options.advisors.join(', ') : chalk.gray('none')));
      console.log(chalk.white('  Messages: ') + session.messages.length);
      console.log(chalk.white('  Duration: ') + `${mins}m ${secs}s`);
      console.log('');
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
        console.log(chalk.yellow('\nUsage: !run <command>'));
        console.log(chalk.gray('Allowed: ' + ALLOWED_COMMANDS.join(', ') + '\n'));
        return true;
      }

      try {
        console.log(chalk.cyan(`\nRunning: ${cmd}\n`));
        const result = await runCommand(cmd, { cwd: session.cwd });

        if (result.exitCode === 0) {
          console.log(chalk.green('Command succeeded'));
        } else {
          console.log(chalk.red(`Command failed (exit code: ${result.exitCode})`));
        }

        if (result.stdout) {
          console.log(result.stdout);
        }
        if (result.stderr) {
          console.log(chalk.yellow(result.stderr));
        }
        console.log('');
      } catch (error) {
        console.log(chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}\n`));
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
      console.log(chalk.gray('\nConversation history cleared.\n'));
      return true;
    },
  },
];

function getModeLabel(options: Omit<CliOptions, 'task'>): string {
  if (options.apply) return chalk.green('apply');
  if (options.approve) return chalk.cyan('approve');
  return chalk.yellow('dry-run');
}

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

  console.log(chalk.blue('\nClaude is thinking...\n'));

  try {
    const result = await runOrchestrator(taskWithContext, options);

    // Display tool calls if verbose
    if (session.options.verbose && result.toolCalls.length > 0) {
      console.log(chalk.gray('Tool calls:'));
      for (const call of result.toolCalls) {
        console.log(chalk.gray(`  ${call.tool}`));
      }
      console.log('');
    }

    // Display advisor consultations if any
    if (result.advisorResponses.length > 0) {
      console.log(chalk.magenta('Advisors consulted:'));
      for (const advisor of result.advisorResponses) {
        if (advisor.error) {
          console.log(chalk.yellow(`  [${advisor.model}] Error: ${advisor.error}`));
        } else {
          console.log(chalk.gray(`  [${advisor.model}] Response received`));
        }
      }
      console.log('');
    }

    // Display Claude's response
    console.log(chalk.green('Claude:'));
    console.log(result.response.content);
    console.log('');

    // Add assistant response to history
    session.messages.push({
      role: 'assistant',
      content: result.response.content,
      timestamp: new Date(),
    });
  } catch (error) {
    console.log(chalk.red(`Error: ${error instanceof Error ? error.message : 'Unknown error'}\n`));
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

  // Print header
  console.log(chalk.cyan('\n' + '='.repeat(56)));
  console.log(chalk.cyan.bold('  Friday - Claude-primary Agent'));
  console.log(chalk.cyan('='.repeat(56)));
  console.log('');
  console.log(chalk.white('Workspace: ') + (session.workspace || chalk.gray('(none - read-only)')));
  console.log(chalk.white('Mode: ') + getModeLabel(session.options));
  console.log(chalk.gray('Type !help for commands, !exit to quit'));
  console.log('');

  // Create readline interface
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.cyan('friday> '),
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
        console.log(chalk.yellow(`Unknown command: !${builtin.command}`));
        console.log(chalk.gray('Type !help for available commands\n'));
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
    console.log(chalk.gray('\n\nInterrupted. Goodbye!\n'));
    rl.close();
  });

  // Start the prompt
  rl.prompt();
}
