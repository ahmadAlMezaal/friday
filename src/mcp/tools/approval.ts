/**
 * Shared Approval UX Module
 *
 * Provides consistent approval flow for file writes with:
 * - Keyboard-driven selector (arrow keys, Enter, Esc)
 * - Clear diff display
 * - Visual formatting
 */

import { createTwoFilesPatch } from 'diff';
import chalk from 'chalk';
import { ApprovalChoice } from '../../types.js';

// Visual elements - standardized emojis
const symbols = {
  write: '✍️',
  patch: '🔧',
  divider: '─',
  check: '✅',
  cross: '❌',
  skip: '⏭️',
  abort: '🛑',
  pointer: '❯',
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
  selected: chalk.cyan.bold,
  unselected: chalk.gray,
};

// Options for the approval selector
const APPROVAL_OPTIONS: { label: string; value: ApprovalChoice }[] = [
  { label: 'Apply', value: 'yes' },
  { label: 'Skip', value: 'skip' },
  { label: 'Reject', value: 'no' },
];

/**
 * Keyboard-driven approval selector
 * Uses arrow keys to navigate, Enter to select, Esc to abort
 */
export async function promptForApproval(message: string): Promise<ApprovalChoice> {
  // Fall back to simple prompt if not a TTY
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return promptForApprovalSimple(message);
  }

  return new Promise((resolve) => {
    let selectedIndex = 0;
    const stdin = process.stdin;

    // Enable raw mode to capture individual keypresses
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    // Render the selector
    const render = () => {
      // Clear previous render (move up and clear lines)
      const totalLines = APPROVAL_OPTIONS.length + 2; // options + hint line + question
      process.stdout.write(`\x1b[${totalLines}A\x1b[J`);

      // Question
      console.log(colors.primary(message));
      console.log('');

      // Options
      APPROVAL_OPTIONS.forEach((option, index) => {
        if (index === selectedIndex) {
          console.log(colors.selected(`  ${symbols.pointer} ${option.label}`));
        } else {
          console.log(colors.unselected(`    ${option.label}`));
        }
      });

      // Hint
      console.log('');
      console.log(colors.dim('(↑↓ navigate · Enter select · Esc abort)'));
    };

    // Initial render - need to print blank lines first
    console.log('');
    console.log('');
    APPROVAL_OPTIONS.forEach(() => console.log(''));
    console.log('');
    console.log('');
    render();

    // Handle keypress
    const onData = (key: string) => {
      // Escape key
      if (key === '\x1b' || key === '\x1b\x1b') {
        cleanup();
        resolve('abort');
        return;
      }

      // Enter key
      if (key === '\r' || key === '\n') {
        cleanup();
        resolve(APPROVAL_OPTIONS[selectedIndex].value);
        return;
      }

      // Arrow up
      if (key === '\x1b[A' || key === 'k') {
        selectedIndex = Math.max(0, selectedIndex - 1);
        render();
        return;
      }

      // Arrow down
      if (key === '\x1b[B' || key === 'j') {
        selectedIndex = Math.min(APPROVAL_OPTIONS.length - 1, selectedIndex + 1);
        render();
        return;
      }

      // Ctrl+C
      if (key === '\x03') {
        cleanup();
        process.exit(0);
      }
    };

    const cleanup = () => {
      stdin.setRawMode(false);
      stdin.removeListener('data', onData);
      stdin.pause();
      // Clear the selector UI
      const totalLines = APPROVAL_OPTIONS.length + 3;
      process.stdout.write(`\x1b[${totalLines}A\x1b[J`);
    };

    stdin.on('data', onData);
  });
}

/**
 * Simple fallback prompt for non-TTY environments
 */
async function promptForApprovalSimple(message: string): Promise<ApprovalChoice> {
  const { createInterface } = await import('readline');
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} [y]es/[s]kip/[n]o: `, (answer) => {
      rl.close();
      const normalized = answer.toLowerCase().trim();
      if (normalized === 'y' || normalized === 'yes') resolve('yes');
      else if (normalized === 's' || normalized === 'skip') resolve('skip');
      else resolve('no');
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
      console.log(colors.error.bold(`${symbols.abort} Aborted`));
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
