#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { CliOptionsSchema, CliOptions, AVAILABLE_ADVISORS } from './types.js';
import { loadConfig, validateConfig } from './config.js';
import { runOrchestrator } from './router.js';
import { runMCPServer } from './mcp/server.js';

const program = new Command();

program
  .name('llm-help')
  .description('Claude-primary LLM orchestrator with advisor models')
  .version('2.0.0');

// Main help command
program
  .command('ask', { isDefault: true })
  .description('Ask Claude for help with a task (Claude decides when to consult advisors)')
  .requiredOption('--task <prompt>', 'The task or question to analyze')
  .option(
    '--advisors <models>',
    'Comma-separated list of advisor models Claude can consult (openai,gemini)',
    ''
  )
  .option('--apply', 'Allow file changes (default: dry-run)', false)
  .option('--verbose', 'Show detailed tool call information', false)
  .option('--cwd <path>', 'Working directory')
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

      // Parse and validate options
      const options: CliOptions = CliOptionsSchema.parse({
        task: opts.task,
        advisors: advisorList,
        apply: opts.apply,
        dryRun: !opts.apply,
        cwd: opts.cwd || process.cwd(),
        verbose: opts.verbose,
      });

      // Load and validate config
      const config = loadConfig(options);
      validateConfig(config);

      // Print header
      console.log(chalk.cyan('\n╔══════════════════════════════════════════════════════╗'));
      console.log(chalk.cyan('║   LLM Orchestrator v2 - Claude as Primary Agent      ║'));
      console.log(chalk.cyan('╚══════════════════════════════════════════════════════╝\n'));

      console.log(chalk.bold('Task:'), options.task);
      console.log(
        chalk.bold('Advisors:'),
        options.advisors.length > 0
          ? options.advisors.join(', ')
          : chalk.gray('none (Claude works independently)')
      );
      console.log(
        chalk.bold('Apply changes:'),
        options.apply ? chalk.green('Yes') : chalk.yellow('No (dry-run)')
      );
      console.log('');

      // Run orchestrator
      console.log(chalk.blue('▶ Claude is analyzing your task...\n'));
      const result = await runOrchestrator(options.task, options);

      // Display tool calls if verbose
      if (options.verbose && result.toolCalls.length > 0) {
        console.log(chalk.gray('───────────────────────────────────────────────'));
        console.log(chalk.gray.bold('Tool Calls:'));
        for (const call of result.toolCalls) {
          console.log(chalk.gray(`  • ${call.tool}`));
          if (call.tool.startsWith('ask_')) {
            console.log(chalk.gray(`    Advisor response received`));
          }
        }
        console.log('');
      }

      // Display advisor consultations
      if (result.advisorResponses.length > 0) {
        console.log(chalk.magenta('═══════════════════════════════════════════════════════'));
        console.log(chalk.magenta.bold(' ADVISOR CONSULTATIONS'));
        console.log(chalk.magenta('═══════════════════════════════════════════════════════\n'));

        for (const advisor of result.advisorResponses) {
          if (advisor.error) {
            console.log(chalk.yellow(`[${advisor.model}] Error: ${advisor.error}`));
          } else {
            console.log(chalk.gray(`[${advisor.model}]`));
            console.log(advisor.response.substring(0, 500));
            if (advisor.response.length > 500) {
              console.log(chalk.gray('... (truncated)'));
            }
          }
          console.log('');
        }
      }

      // Display Claude's response
      console.log(chalk.green('═══════════════════════════════════════════════════════'));
      console.log(chalk.green.bold(' CLAUDE\'S RESPONSE'));
      console.log(chalk.green('═══════════════════════════════════════════════════════\n'));
      console.log(result.response.content);
      console.log('');

      // Summary
      console.log(chalk.gray('───────────────────────────────────────────────────────'));
      console.log(chalk.gray('Summary:'));
      console.log(chalk.gray(`  • Model: ${result.response.model}`));
      console.log(chalk.gray(`  • Tool calls: ${result.toolCalls.length}`));
      console.log(chalk.gray(`  • Advisors consulted: ${result.advisorResponses.length}`));
      console.log('');
    } catch (error) {
      console.error(chalk.red('\nError:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// MCP server command
program
  .command('mcp')
  .description('Run as MCP server (for integration with Claude Code)')
  .option('--apply', 'Allow file changes', false)
  .option('--cwd <path>', 'Working directory')
  .action(async (opts) => {
    const cwd = opts.cwd || process.cwd();
    const allowWrite = opts.apply || false;

    console.error(`Starting MCP server (cwd: ${cwd}, write: ${allowWrite})`);

    await runMCPServer({ cwd, allowWrite });
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

    console.log(chalk.cyan(`\nSearching for: "${query}"\n`));

    const result = await repoSearch(query, { cwd });

    if (result.matches.length === 0) {
      console.log(chalk.yellow('No matches found.'));
    } else {
      console.log(chalk.green(`Found ${result.matches.length} matches:\n`));
      for (const match of result.matches) {
        console.log(chalk.bold(`${match.file}:${match.line}`));
        console.log(chalk.gray(`  ${match.preview}`));
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

    console.log(chalk.cyan(`\nRunning: ${cmd}\n`));

    const result = await runCommand(cmd, { cwd });

    if (result.exitCode === 0) {
      console.log(chalk.green('✓ Command succeeded'));
    } else {
      console.log(chalk.red(`✗ Command failed (exit code: ${result.exitCode})`));
    }

    if (result.stdout) {
      console.log(chalk.bold('\nStdout:'));
      console.log(result.stdout);
    }

    if (result.stderr) {
      console.log(chalk.bold('\nStderr:'));
      console.log(result.stderr);
    }
  });

program.parse();
