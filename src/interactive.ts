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
import { existsSync, statSync } from 'fs';
import { resolve, isAbsolute } from 'path';
import {
  InteractiveSession,
  SessionMessage,
  InteractiveOptions,
  CliOptions,
  WriteMode,
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
  renderActivity,
  renderToolStart,
  renderToolEnd,
  renderAdvisorStart,
  renderAdvisorEnd,
  renderContextGathering,
  renderWorkspaceChanged,
  renderModeChanged,
  renderPlanModeEnabled,
  renderPlanModeDisabled,
  renderPlanConfirmation,
} from './ui.js';
import { ActivityEvent, ActivityCallback } from './types.js';

// Built-in command handlers
interface BuiltinCommand {
  name: string;
  aliases: string[];
  description: string;
  handler: (session: InteractiveSession, args: string, rl?: readline.Interface) => Promise<boolean>; // returns true to continue, false to exit
}

/**
 * Get the current write mode from session options
 */
function getWriteMode(session: InteractiveSession): WriteMode {
  if (session.options.apply) return 'apply';
  if (session.options.approve) return 'approve';
  return 'dry-run';
}

/**
 * Set the write mode on session options
 */
function setWriteMode(session: InteractiveSession, mode: WriteMode): void {
  session.options.apply = mode === 'apply';
  session.options.approve = mode === 'approve';
  session.options.dryRun = mode === 'dry-run';
}

/**
 * Resolve a workspace path relative to invocation directory
 */
function resolveWorkspacePath(inputPath: string, invocationCwd: string): string {
  if (isAbsolute(inputPath)) {
    return resolve(inputPath);
  }
  return resolve(invocationCwd, inputPath);
}

/**
 * Validate that a path exists and is a directory
 */
function validateWorkspacePath(path: string): { valid: boolean; error?: string } {
  if (!existsSync(path)) {
    return { valid: false, error: `Directory does not exist: ${path}` };
  }
  try {
    const stat = statSync(path);
    if (!stat.isDirectory()) {
      return { valid: false, error: `Path is not a directory: ${path}` };
    }
  } catch {
    return { valid: false, error: `Cannot access path: ${path}` };
  }
  return { valid: true };
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
  // Session control commands
  {
    name: 'workspace',
    aliases: [],
    description: 'Set/change workspace directory',
    handler: async (session, args) => {
      const inputPath = args.trim();
      if (!inputPath) {
        console.log(colors.warning('\nUsage: !workspace <path>'));
        console.log(colors.textDim('  Sets the directory where file writes are allowed.'));
        console.log(colors.textDim('  Path resolves relative to where friday was launched.\n'));
        return true;
      }

      // Resolve the path relative to invocation directory
      const resolvedPath = resolveWorkspacePath(inputPath, session.invocationCwd);

      // Validate the path
      const validation = validateWorkspacePath(resolvedPath);
      if (!validation.valid) {
        console.log(renderError(validation.error || 'Invalid path'));
        return true;
      }

      // Update session
      session.workspace = resolvedPath;
      session.options.workspace = resolvedPath;
      console.log(renderWorkspaceChanged(resolvedPath));
      return true;
    },
  },
  {
    name: 'mode',
    aliases: [],
    description: 'Set write mode: dry-run, approve, or apply',
    handler: async (session, args) => {
      const mode = args.trim().toLowerCase();

      if (!mode) {
        console.log(colors.warning('\nUsage: !mode <dry-run|approve|apply>'));
        console.log(colors.textDim('  dry-run  - Read-only, no file writes'));
        console.log(colors.textDim('  approve  - Confirm each file write'));
        console.log(colors.textDim('  apply    - Write files immediately\n'));
        return true;
      }

      if (!['dry-run', 'approve', 'apply'].includes(mode)) {
        console.log(renderError(`Invalid mode: ${mode}. Use dry-run, approve, or apply.`));
        return true;
      }

      // Check workspace requirement for write modes
      if ((mode === 'approve' || mode === 'apply') && !session.workspace) {
        console.log(renderError('Workspace is required. Run !workspace <path> first.'));
        return true;
      }

      setWriteMode(session, mode as WriteMode);
      console.log(renderModeChanged(mode as WriteMode));
      return true;
    },
  },
  {
    name: 'dry',
    aliases: [],
    description: 'Shortcut for !mode dry-run',
    handler: async (session) => {
      setWriteMode(session, 'dry-run');
      console.log(renderModeChanged('dry-run'));
      return true;
    },
  },
  {
    name: 'approve',
    aliases: [],
    description: 'Shortcut for !mode approve',
    handler: async (session) => {
      if (!session.workspace) {
        console.log(renderError('Workspace is required. Run !workspace <path> first.'));
        return true;
      }
      setWriteMode(session, 'approve');
      console.log(renderModeChanged('approve'));
      return true;
    },
  },
  {
    name: 'apply',
    aliases: [],
    description: 'Shortcut for !mode apply',
    handler: async (session) => {
      if (!session.workspace) {
        console.log(renderError('Workspace is required. Run !workspace <path> first.'));
        return true;
      }
      setWriteMode(session, 'apply');
      console.log(renderModeChanged('apply'));
      return true;
    },
  },
  {
    name: 'plan',
    aliases: [],
    description: 'Toggle plan-only mode for next task',
    handler: async (session) => {
      session.planOnly = !session.planOnly;
      if (session.planOnly) {
        console.log(renderPlanModeEnabled());
      } else {
        console.log(renderPlanModeDisabled());
      }
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

/**
 * Create an activity callback for real-time display
 */
function createActivityCallback(): ActivityCallback {
  return (event: ActivityEvent) => {
    switch (event.type) {
      case 'context_gathering':
        console.log(renderContextGathering());
        break;

      case 'thinking':
        console.log(renderActivity(event.message));
        break;

      case 'tool_start':
        if (event.details?.tool) {
          console.log(renderToolStart(event.details.tool));
        }
        break;

      case 'tool_end':
        // Only show end for non-advisor tools in verbose mode
        // (advisors have their own end rendering)
        break;

      case 'advisor_start':
        if (event.details?.advisor) {
          console.log(renderAdvisorStart(event.details.advisor, event.details.question));
        }
        break;

      case 'advisor_end':
        if (event.details?.advisor) {
          console.log(renderAdvisorEnd(event.details.advisor, event.details.success ?? true));
        }
        break;
    }
  };
}

/**
 * Prompt for plan confirmation using readline
 */
async function promptPlanConfirmation(rl: readline.Interface): Promise<boolean> {
  return new Promise((resolve) => {
    process.stdout.write(renderPlanConfirmation());
    rl.once('line', (answer) => {
      const normalized = answer.trim().toLowerCase();
      resolve(normalized === 'y' || normalized === 'yes');
    });
  });
}

async function processTask(
  session: InteractiveSession,
  task: string,
  rl: readline.Interface
): Promise<void> {
  // Check if plan-only mode is active
  const isPlanOnly = session.planOnly;

  // Add user message to history
  session.messages.push({
    role: 'user',
    content: task,
    timestamp: new Date(),
  });

  // Build options with task
  // In plan-only mode, force dry-run regardless of current mode
  const options: CliOptions = {
    ...session.options,
    task,
    ...(isPlanOnly ? { apply: false, approve: false, dryRun: true } : {}),
  };

  // Build context from conversation history
  const historyContext = buildContextFromHistory(session);

  // Construct task with history context
  // If plan-only, add instruction to Claude
  let taskWithContext = historyContext
    ? `${historyContext}\n\n## Current Task\n${task}`
    : task;

  if (isPlanOnly) {
    taskWithContext = `${taskWithContext}\n\n**IMPORTANT**: Provide a plan only. Do not write files. Do not output large code blocks. Focus on describing what changes need to be made and why.`;
  }

  // Create activity callback for real-time display
  const onActivity = createActivityCallback();
  console.log(''); // Add spacing before activity output

  try {
    const result = await runOrchestrator(taskWithContext, options, onActivity);

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

    // If we were in plan-only mode, prompt for confirmation
    if (isPlanOnly) {
      // Clear the plan-only flag
      session.planOnly = false;

      const proceed = await promptPlanConfirmation(rl);
      if (proceed) {
        // Switch to approve mode if not already in apply mode
        if (!session.workspace) {
          console.log(renderError('Cannot proceed: workspace is required. Run !workspace <path> first.'));
          return;
        }

        const currentMode = getWriteMode(session);
        if (currentMode === 'dry-run') {
          setWriteMode(session, 'approve');
          console.log(renderModeChanged('approve'));
        }
        console.log(colors.textDim(`\n${symbols.bullet} You can now ask Claude to implement the plan.\n`));
      } else {
        console.log(colors.textDim(`\n${symbols.bullet} Staying in dry-run mode. Use !plan to request another plan.\n`));
      }
    }
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
    invocationCwd: options.invocationCwd || process.cwd(), // Where friday was launched from
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
    planOnly: false,
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
    await processTask(session, input, rl);
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
