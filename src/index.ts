#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { CliOptionsSchema, CliOptions } from './types.js';
import { loadConfig, validateConfig } from './config.js';
import { runOrchestrator } from './router.js';
import { runMCPServer } from './mcp/server.js';

const program = new Command();

program
  .name('llm-help')
  .description('Multi-LLM orchestrator for development assistance')
  .version('1.0.0');

// Main help command
program
  .command('ask', { isDefault: true })
  .description('Ask the orchestrator for help with a task')
  .requiredOption('--task <prompt>', 'The task or question to analyze')
  .option('--modelPrimary <model>', 'Primary model (conceptual)', 'claude')
  .option('--modelSecondary <model>', 'Secondary model', 'openai:gpt-4.1')
  .option('--when <mode>', 'When to consult secondary: auto|always|never', 'auto')
  .option('--apply', 'Allow file changes', false)
  .option('--dry-run', 'Dry run mode (default)', true)
  .option('--cwd <path>', 'Working directory')
  .action(async (opts) => {
    try {
      // Parse and validate options
      const options: CliOptions = CliOptionsSchema.parse({
        task: opts.task,
        modelPrimary: opts.modelPrimary,
        modelSecondary: opts.modelSecondary,
        when: opts.when,
        apply: opts.apply,
        dryRun: !opts.apply,
        cwd: opts.cwd || process.cwd(),
      });

      // Load and validate config
      const config = loadConfig(options);

      // Validate API keys only if we might use secondary
      if (options.when !== 'never') {
        try {
          validateConfig(config);
        } catch (error) {
          if (options.when === 'always') {
            throw error;
          }
          // For 'auto', just warn
          console.log(
            chalk.yellow(
              '\nWarning: Secondary model may not be available (missing API key).\n' +
                'Proceeding with primary analysis only.\n'
            )
          );
          options.when = 'never';
        }
      }

      // Print header
      console.log(chalk.cyan('\n╔══════════════════════════════════════════════╗'));
      console.log(chalk.cyan('║     LLM Orchestrator - Multi-Model Helper    ║'));
      console.log(chalk.cyan('╚══════════════════════════════════════════════╝\n'));

      console.log(chalk.bold('Task:'), options.task);
      console.log(chalk.bold('Mode:'), options.when === 'never' ? 'Primary only' : `Auto-consult secondary (${options.modelSecondary})`);
      console.log(chalk.bold('Apply changes:'), options.apply ? chalk.green('Yes') : chalk.yellow('No (dry-run)'));
      console.log('');

      // Run orchestrator
      console.log(chalk.blue('▶ Running analysis...\n'));
      const result = await runOrchestrator(options.task, options);

      // Display results
      console.log(chalk.green('═══════════════════════════════════════════════'));
      console.log(chalk.green.bold(' PRIMARY ANALYSIS'));
      console.log(chalk.green('═══════════════════════════════════════════════\n'));
      console.log(result.primaryResponse?.content || 'No primary response');
      console.log('');

      if (result.secondaryResponse) {
        console.log(chalk.magenta('═══════════════════════════════════════════════'));
        console.log(chalk.magenta.bold(' SECONDARY OPINION'));
        console.log(chalk.magenta('═══════════════════════════════════════════════\n'));
        console.log(result.secondaryResponse.content);
        console.log('');
      }

      console.log(chalk.cyan('═══════════════════════════════════════════════'));
      console.log(chalk.cyan.bold(' FINAL RECOMMENDATION'));
      console.log(chalk.cyan('═══════════════════════════════════════════════\n'));
      console.log(result.mergedRecommendation);

      // Summary
      console.log(chalk.gray('\n───────────────────────────────────────────────'));
      console.log(chalk.gray('Summary:'));
      console.log(chalk.gray(`  • Primary model: ${result.primaryResponse?.model || 'claude'}`));
      if (result.secondaryResponse) {
        console.log(chalk.gray(`  • Secondary model: ${result.secondaryResponse.model}`));
      }
      console.log(chalk.gray(`  • Secondary consulted: ${result.shouldCallSecondary ? 'Yes' : 'No'}`));
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
