#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { CliOptionsSchema, CliOptions, InteractiveOptionsSchema, AVAILABLE_ADVISORS } from './types.js';
import { loadConfig, validateConfig } from './config.js';
import { runOrchestrator } from './router.js';
import { runMCPServer } from './mcp/server.js';
import { resolveWorkspace } from './workspace.js';
import { runInteractiveSession } from './interactive.js';
import {
  colors,
  symbols,
  renderHeader,
  getModeDisplay,
  renderThinking,
  renderResponseStart,
  renderResponseEnd,
  renderToolCall,
  renderAdvisorResult,
  renderError,
  shortenPath,
} from './ui.js';
import {
  detectMissingKeys,
  hasMissingKeys,
  isMissingPrimaryKey,
  promptForMissingKeys,
  isInteractiveMode,
  KeyRequirements,
} from './api-key-setup.js';

// Capture the original process.cwd() BEFORE any Yarn --cwd override takes effect
// This is the directory from which the user invoked the command
const INVOCATION_CWD = process.cwd();

const program = new Command();

program
  .name('friday')
  .description('Friday - Claude-primary agent for software engineering tasks')
  .version('2.0.0');

// One-shot ask command (for --task mode)
program
  .command('ask')
  .description('Ask Claude for help with a task (one-shot mode)')
  .requiredOption('--task <prompt>', 'The task or question to analyze')
  .option(
    '--advisors <models>',
    'Comma-separated list of advisor models Claude can consult (openai,gemini)',
    ''
  )
  .option('--apply', 'Allow file changes (default: dry-run)', false)
  .option('--approve', 'Show patches and require y/N confirmation before applying', false)
  .option('--verbose', 'Show detailed tool call information', false)
  .option('--cwd <path>', 'Working directory for read/search operations')
  .option('--workspace <path>', 'Directory where file writes are allowed (required with --apply or --approve)')
  .option('--maxToolCalls <n>', 'Maximum tool calls allowed (default: 20)', '20')
  .option('--maxTurns <n>', 'Maximum agent loop turns (default: 10)', '10')
  .action(async (opts) => {
    try {
      // Parse advisors from comma-separated string
      const advisorList = opts.advisors
        ? opts.advisors.split(',').map((s: string) => s.trim().toLowerCase())
        : [];

      // Validate advisor names
      for (const advisor of advisorList) {
        if (!AVAILABLE_ADVISORS.includes(advisor as 'openai' | 'gemini')) {
          throw new Error(
            `Unknown advisor: ${advisor}\n` +
              `Available advisors: ${AVAILABLE_ADVISORS.join(', ')}`
          );
        }
      }

      // Fail-fast: require --workspace when --apply or --approve is set
      const writesEnabled = opts.apply || opts.approve;
      if (writesEnabled && !opts.workspace) {
        throw new Error(
          'The --workspace flag is required when using --apply or --approve.\n' +
            'This ensures file writes are sandboxed to an explicit directory.\n\n' +
            'Example:\n' +
            '  friday ask --task "create a website" --workspace ./my-project --apply'
        );
      }

      // Resolve workspace to absolute path (relative to invocation directory, not tool directory)
      const resolvedWorkspace = opts.workspace
        ? resolveWorkspace(opts.workspace, INVOCATION_CWD)
        : undefined;

      // Parse and validate options
      const options: CliOptions = CliOptionsSchema.parse({
        task: opts.task,
        advisors: advisorList,
        apply: opts.apply,
        approve: opts.approve,
        dryRun: !opts.apply && !opts.approve,
        cwd: opts.cwd || INVOCATION_CWD,
        workspace: resolvedWorkspace,
        verbose: opts.verbose,
        maxToolCalls: parseInt(opts.maxToolCalls, 10),
        maxTurns: parseInt(opts.maxTurns, 10),
      });

      // Determine key requirements based on advisors
      const keyRequirements: KeyRequirements = {
        anthropic: true, // Always required
        openai: advisorList.includes('openai'),
        gemini: advisorList.includes('gemini'),
      };

      // Check for missing keys before loading config
      const missing = detectMissingKeys(keyRequirements);

      if (hasMissingKeys(missing)) {
        // Try interactive setup (will fail fast in non-interactive mode)
        const setupSuccess = await promptForMissingKeys(keyRequirements, missing);

        if (!setupSuccess) {
          process.exit(1);
        }
      }

      // Load and validate config (now with session keys if set)
      const config = loadConfig(options);
      validateConfig(config);

      // Determine mode for display
      const mode = options.apply ? 'apply' : options.approve ? 'approve' : 'dry-run';

      // Print styled header
      console.log('\n' + renderHeader({
        workspace: options.workspace,
        mode: mode as 'dry-run' | 'approve' | 'apply',
        advisors: options.advisors,
      }));
      console.log('');

      // Task info
      console.log(`   ${colors.label('Task')}        ${options.task}`);
      console.log(`   ${colors.label('Limits')}      ${options.maxToolCalls} tool calls, ${options.maxTurns} turns`);
      console.log('');

      // Run orchestrator
      console.log(renderThinking());
      const result = await runOrchestrator(options.task, options);

      // Display tool calls if verbose
      if (options.verbose && result.toolCalls.length > 0) {
        console.log(colors.textDim('─'.repeat(50)));
        console.log(colors.label('Tool Calls:'));
        for (const call of result.toolCalls) {
          console.log('  ' + renderToolCall(call.tool));
        }
        console.log('');
      }

      // Display advisor consultations
      if (result.advisorResponses.length > 0) {
        console.log(colors.primary('─'.repeat(50)));
        console.log(colors.primary.bold(' Advisor Consultations'));
        console.log(colors.primary('─'.repeat(50)));
        console.log('');

        for (const advisor of result.advisorResponses) {
          if (advisor.error) {
            console.log(renderAdvisorResult(advisor.model, advisor.error));
          } else {
            console.log(colors.textDim(`[${advisor.model}]`));
            console.log(advisor.response.substring(0, 500));
            if (advisor.response.length > 500) {
              console.log(colors.textDim('... (truncated)'));
            }
          }
          console.log('');
        }
      }

      // Display Claude's response
      console.log(renderResponseStart());
      console.log(result.response.content);
      console.log(renderResponseEnd());
      console.log('');

      // Summary
      console.log(colors.textDim('─'.repeat(50)));
      console.log(colors.textDim('Summary:'));
      console.log(colors.textDim(`  ${symbols.bullet} Model: ${result.response.model}`));
      console.log(colors.textDim(`  ${symbols.bullet} Tool calls: ${result.toolCalls.length}`));
      console.log(colors.textDim(`  ${symbols.bullet} Advisors consulted: ${result.advisorResponses.length}`));
      console.log('');
    } catch (error) {
      console.error(renderError(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

// MCP server command
program
  .command('mcp')
  .description('Run as MCP server (for integration with Claude Code)')
  .option('--apply', 'Allow file changes', false)
  .option('--cwd <path>', 'Working directory for read/search operations')
  .option('--workspace <path>', 'Directory where file writes are allowed (required with --apply)')
  .action(async (opts) => {
    const cwd = opts.cwd || INVOCATION_CWD;
    const allowWrite = opts.apply || false;

    // Fail-fast: require --workspace when --apply is set
    if (allowWrite && !opts.workspace) {
      console.error(
        'Error: The --workspace flag is required when using --apply.\n' +
          'This ensures file writes are sandboxed to an explicit directory.\n\n' +
          'Example:\n' +
          '  friday mcp --workspace ./my-project --apply'
      );
      process.exit(1);
    }

    const workspace = opts.workspace
      ? resolveWorkspace(opts.workspace, INVOCATION_CWD)
      : undefined;

    console.error(`Starting MCP server`);
    console.error(`  cwd: ${cwd}`);
    console.error(`  workspace: ${workspace || '(none - read-only)'}`);
    console.error(`  write: ${allowWrite}`);

    await runMCPServer({ cwd, allowWrite, workspace });
  });

// Search command
program
  .command('search')
  .description('Search the repository for a pattern')
  .argument('<query>', 'Search query')
  .option('--cwd <path>', 'Working directory')
  .action(async (query, opts) => {
    const { repoSearch } = await import('./mcp/tools/index.js');
    const cwd = opts.cwd || process.cwd();

    console.log(`\n${colors.primary(`${symbols.gear} Searching for:`)} "${query}"\n`);

    const result = await repoSearch(query, { cwd });

    if (result.matches.length === 0) {
      console.log(colors.warning('No matches found.'));
    } else {
      console.log(colors.success(`${symbols.check} Found ${result.matches.length} matches:\n`));
      for (const match of result.matches) {
        console.log(colors.label(`${match.file}:${match.line}`));
        console.log(colors.textDim(`  ${match.preview}`));
        console.log('');
      }
    }
  });

// Diff command
program
  .command('diff')
  .description('Show current git diff')
  .option('--cwd <path>', 'Working directory')
  .action(async (opts) => {
    const { gitDiff } = await import('./mcp/tools/index.js');
    const cwd = opts.cwd || process.cwd();

    const result = await gitDiff({ cwd });
    console.log(result.diff);
  });

// Run command
program
  .command('run')
  .description('Run an allowed command')
  .argument('<cmd>', 'Command to run')
  .option('--cwd <path>', 'Working directory')
  .action(async (cmd, opts) => {
    const { runCommand } = await import('./mcp/tools/index.js');
    const cwd = opts.cwd || process.cwd();

    console.log(`\n${colors.primary(`${symbols.gear} Running:`)} ${cmd}\n`);

    const result = await runCommand(cmd, { cwd });

    if (result.exitCode === 0) {
      console.log(colors.success(`${symbols.check} Command succeeded`));
    } else {
      console.log(colors.error(`${symbols.cross} Command failed (exit code: ${result.exitCode})`));
    }

    if (result.stdout) {
      console.log(colors.label('\nStdout:'));
      console.log(result.stdout);
    }

    if (result.stderr) {
      console.log(colors.label('\nStderr:'));
      console.log(colors.warning(result.stderr));
    }
  });

// Interactive mode command (default when no command given)
program
  .command('interactive', { isDefault: true })
  .alias('i')
  .description('Start an interactive REPL session with Claude (default)')
  .option(
    '--advisors <models>',
    'Comma-separated list of advisor models Claude can consult (openai,gemini)',
    ''
  )
  .option('--apply', 'Allow file changes (default: dry-run)', false)
  .option('--approve', 'Show patches and require y/N confirmation before applying', false)
  .option('--verbose', 'Show detailed tool call information', false)
  .option('--cwd <path>', 'Working directory for read/search operations')
  .option('--workspace <path>', 'Directory where file writes are allowed (required with --apply or --approve)')
  .option('--maxToolCalls <n>', 'Maximum tool calls allowed per task (default: 20)', '20')
  .option('--maxTurns <n>', 'Maximum agent loop turns per task (default: 10)', '10')
  .action(async (opts) => {
    try {
      // Parse advisors from comma-separated string
      const advisorList = opts.advisors
        ? opts.advisors.split(',').map((s: string) => s.trim().toLowerCase())
        : [];

      // Validate advisor names
      for (const advisor of advisorList) {
        if (!AVAILABLE_ADVISORS.includes(advisor as 'openai' | 'gemini')) {
          throw new Error(
            `Unknown advisor: ${advisor}\n` +
              `Available advisors: ${AVAILABLE_ADVISORS.join(', ')}`
          );
        }
      }

      // Fail-fast: require --workspace when --apply or --approve is set
      const writesEnabled = opts.apply || opts.approve;
      if (writesEnabled && !opts.workspace) {
        throw new Error(
          'The --workspace flag is required when using --apply or --approve.\n' +
            'This ensures file writes are sandboxed to an explicit directory.\n\n' +
            'Example:\n' +
            '  friday --workspace ./my-project --approve'
        );
      }

      // Resolve workspace to absolute path
      const resolvedWorkspace = opts.workspace
        ? resolveWorkspace(opts.workspace, INVOCATION_CWD)
        : undefined;

      // Parse and validate options
      const options = InteractiveOptionsSchema.parse({
        advisors: advisorList,
        apply: opts.apply,
        approve: opts.approve,
        dryRun: !opts.apply && !opts.approve,
        cwd: opts.cwd || INVOCATION_CWD,
        workspace: resolvedWorkspace,
        verbose: opts.verbose,
        maxToolCalls: parseInt(opts.maxToolCalls, 10),
        maxTurns: parseInt(opts.maxTurns, 10),
      });

      // Determine key requirements based on advisors
      const keyRequirements: KeyRequirements = {
        anthropic: true, // Always required
        openai: advisorList.includes('openai'),
        gemini: advisorList.includes('gemini'),
      };

      // Check for missing keys before loading config
      const missing = detectMissingKeys(keyRequirements);

      if (hasMissingKeys(missing)) {
        // Try interactive setup (will fail fast in non-interactive mode)
        const setupSuccess = await promptForMissingKeys(keyRequirements, missing);

        if (!setupSuccess) {
          process.exit(1);
        }
      }

      // Load and validate config (now with session keys if set)
      const config = loadConfig({ ...options, task: '' });
      validateConfig(config);

      // Start interactive session
      await runInteractiveSession(options);
    } catch (error) {
      console.error(renderError(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

program.parse();
