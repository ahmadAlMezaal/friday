/**
 * Shared Approval UX Module
 *
 * Provides consistent approval flow for file writes with:
 * - Clear diff display
 * - Multiple response options: yes/no/skip/abort
 * - Visual formatting
 */

import { createInterface } from 'readline';
import { createTwoFilesPatch } from 'diff';
import chalk from 'chalk';
import { ApprovalChoice } from '../../types.js';

// Visual elements
const symbols = {
  write: '📝',
  patch: '🔧',
  divider: '─',
  check: '✓',
  cross: '✗',
  skip: '⊘',
  abort: '⏹',
};

const colors = {
  primary: chalk.hex('#A78BFA'),
  success: chalk.green,
  warning: chalk.yellow,
  error: chalk.red,
  dim: chalk.gray,
  file: chalk.cyan.bold,
  action: {
    create: chalk.green.bold,
    modify: chalk.yellow.bold,
  },
};

/**
 * Format approval prompt options
 */
function formatOptions(): string {
  return [
    colors.success('[y]es'),
    colors.error('[n]o'),
    colors.warning('[s]kip'),
    colors.error.bold('[a]bort all'),
  ].join(' / ');
}

/**
 * Parse user input to approval choice
 */
function parseApprovalChoice(input: string): ApprovalChoice {
  const normalized = input.toLowerCase().trim();

  if (normalized === 'y' || normalized === 'yes') {
    return 'yes';
  }
  if (normalized === 'n' || normalized === 'no') {
    return 'no';
  }
  if (normalized === 's' || normalized === 'skip') {
    return 'skip';
  }
  if (normalized === 'a' || normalized === 'abort') {
    return 'abort';
  }

  // Default to 'no' for safety (same as before)
  return 'no';
}

/**
 * Prompt user for approval with enhanced options
 */
export async function promptForApproval(message: string): Promise<ApprovalChoice> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} ${formatOptions()}: `, (answer) => {
      rl.close();
      resolve(parseApprovalChoice(answer));
    });
  });
}

/**
 * Display a file write proposal with diff
 */
export function displayWriteProposal(
  path: string,
  existingContent: string,
  newContent: string,
  isNewFile: boolean
): void {
  const divider = symbols.divider.repeat(60);
  const action = isNewFile ? 'CREATE' : 'MODIFY';
  const actionColor = isNewFile ? colors.action.create : colors.action.modify;

  console.log('\n' + colors.dim(divider));
  console.log(`${symbols.write} ${actionColor(action)} ${colors.file(path)}`);
  console.log(colors.dim(divider));

  const patch = createTwoFilesPatch(
    path,
    path,
    existingContent,
    newContent,
    isNewFile ? '(new file)' : 'original',
    'proposed'
  );

  // Colorize the diff output
  const colorizedDiff = colorizeDiff(patch);
  console.log(colorizedDiff);
  console.log(colors.dim(divider));
}

/**
 * Display a patch proposal
 */
export function displayPatchProposal(path: string, unifiedDiff: string): void {
  const divider = symbols.divider.repeat(60);

  console.log('\n' + colors.dim(divider));
  console.log(`${symbols.patch} ${colors.action.modify('PATCH')} ${colors.file(path)}`);
  console.log(colors.dim(divider));

  const colorizedDiff = colorizeDiff(unifiedDiff);
  console.log(colorizedDiff);
  console.log(colors.dim(divider));
}

/**
 * Colorize diff output for better readability
 */
function colorizeDiff(diff: string): string {
  return diff
    .split('\n')
    .map((line) => {
      if (line.startsWith('+++') || line.startsWith('---')) {
        return colors.dim(line);
      }
      if (line.startsWith('+')) {
        return colors.success(line);
      }
      if (line.startsWith('-')) {
        return colors.error(line);
      }
      if (line.startsWith('@@')) {
        return colors.primary(line);
      }
      return line;
    })
    .join('\n');
}

/**
 * Display approval result feedback
 */
export function displayApprovalResult(
  path: string,
  choice: ApprovalChoice
): void {
  switch (choice) {
    case 'yes':
      console.log(colors.success(`${symbols.check} Applied: ${path}`));
      break;
    case 'no':
      console.log(colors.error(`${symbols.cross} Rejected: ${path}`));
      break;
    case 'skip':
      console.log(colors.warning(`${symbols.skip} Skipped: ${path}`));
      break;
    case 'abort':
      console.log(colors.error.bold(`${symbols.abort} Aborting all remaining changes`));
      break;
  }
}

/**
 * Announce the start of the writing phase
 */
export function displayWritingPhaseStart(fileCount: number): void {
  console.log('');
  console.log(colors.primary.bold('═'.repeat(60)));
  console.log(colors.primary.bold(`  WRITING PHASE - ${fileCount} file(s) to process`));
  console.log(colors.primary.bold('═'.repeat(60)));
  console.log('');
}

/**
 * Announce the completion of the writing phase
 */
export function displayWritingPhaseSummary(
  applied: number,
  rejected: number,
  skipped: number,
  aborted: number
): void {
  console.log('');
  console.log(colors.dim('─'.repeat(60)));
  console.log(colors.primary.bold('  Summary:'));
  if (applied > 0) {
    console.log(colors.success(`    ${symbols.check} Applied: ${applied}`));
  }
  if (rejected > 0) {
    console.log(colors.error(`    ${symbols.cross} Rejected: ${rejected}`));
  }
  if (skipped > 0) {
    console.log(colors.warning(`    ${symbols.skip} Skipped: ${skipped}`));
  }
  if (aborted > 0) {
    console.log(colors.error(`    ${symbols.abort} Aborted: ${aborted}`));
  }
  console.log(colors.dim('─'.repeat(60)));
  console.log('');
}

// Re-export for convenience
export { ApprovalChoice };
