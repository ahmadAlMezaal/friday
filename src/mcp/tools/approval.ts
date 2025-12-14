/**
 * Shared Approval UX Module
 *
 * Provides consistent approval flow for file writes with:
 * - Keyboard-driven selector (arrow keys, Enter, Esc)
 * - Clear diff display with plain-English summary
 * - Visual formatting
 */

import * as readline from 'readline';
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
  info: 'ℹ️',
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

// Total lines used by the selector UI
const SELECTOR_LINES = APPROVAL_OPTIONS.length + 4; // question + blank + options + blank + hint

/**
 * Keyboard-driven approval selector
 * Uses arrow keys to navigate, Enter to select, Esc to abort
 * Properly redraws in place without duplication
 */
export async function promptForApproval(message: string): Promise<ApprovalChoice> {
  // Fall back to simple prompt if not a TTY
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return promptForApprovalSimple(message);
  }

  return new Promise((resolve) => {
    let selectedIndex = 0;
    const stdin = process.stdin;
    let keyBuffer = '';
    let resolved = false;

    // Save cursor position and render initial state
    const renderInitial = () => {
      // Print the menu structure
      process.stdout.write('\n'); // question line
      process.stdout.write('\n'); // blank
      for (let i = 0; i < APPROVAL_OPTIONS.length; i++) {
        process.stdout.write('\n'); // option lines
      }
      process.stdout.write('\n'); // blank
      process.stdout.write('\n'); // hint line
    };

    // Render the selector by moving cursor and rewriting
    const render = () => {
      // Move cursor up to the start of our menu
      process.stdout.write(`\x1b[${SELECTOR_LINES}A`);
      // Clear from cursor to end of screen
      process.stdout.write('\x1b[J');

      // Question
      process.stdout.write(colors.primary(message) + '\n');
      process.stdout.write('\n');

      // Options
      for (let i = 0; i < APPROVAL_OPTIONS.length; i++) {
        const option = APPROVAL_OPTIONS[i];
        if (i === selectedIndex) {
          process.stdout.write(colors.selected(`  ${symbols.pointer} ${option.label}`) + '\n');
        } else {
          process.stdout.write(colors.unselected(`    ${option.label}`) + '\n');
        }
      }

      // Hint
      process.stdout.write('\n');
      process.stdout.write(colors.dim('(↑↓ navigate · Enter select · Esc abort)') + '\n');
    };

    const cleanup = () => {
      if (resolved) return;
      resolved = true;

      // Restore terminal state
      stdin.setRawMode(false);
      stdin.removeListener('data', onData);
      stdin.pause();

      // Clear the selector UI - move up and clear
      process.stdout.write(`\x1b[${SELECTOR_LINES}A`);
      process.stdout.write('\x1b[J');
    };

    // Handle keypress with proper escape sequence buffering
    const onData = (data: string) => {
      if (resolved) return;

      keyBuffer += data;

      // Process complete sequences
      while (keyBuffer.length > 0) {
        // Check for escape sequences (arrow keys)
        if (keyBuffer.startsWith('\x1b[A')) {
          // Arrow up
          selectedIndex = Math.max(0, selectedIndex - 1);
          render();
          keyBuffer = keyBuffer.slice(3);
          continue;
        }
        if (keyBuffer.startsWith('\x1b[B')) {
          // Arrow down
          selectedIndex = Math.min(APPROVAL_OPTIONS.length - 1, selectedIndex + 1);
          render();
          keyBuffer = keyBuffer.slice(3);
          continue;
        }
        if (keyBuffer.startsWith('\x1b[C') || keyBuffer.startsWith('\x1b[D')) {
          // Arrow left/right - ignore
          keyBuffer = keyBuffer.slice(3);
          continue;
        }

        // Check for bare Escape (need to wait to see if more chars follow)
        if (keyBuffer === '\x1b') {
          // Wait a bit to see if more chars are coming (escape sequence)
          setTimeout(() => {
            if (keyBuffer === '\x1b' && !resolved) {
              // It's a bare Escape key
              cleanup();
              resolve('abort');
            }
          }, 50);
          return;
        }

        // Skip incomplete escape sequences
        if (keyBuffer.startsWith('\x1b') && keyBuffer.length < 3) {
          return; // Wait for more data
        }

        // Handle other keys
        const char = keyBuffer[0];
        keyBuffer = keyBuffer.slice(1);

        // Enter key
        if (char === '\r' || char === '\n') {
          cleanup();
          resolve(APPROVAL_OPTIONS[selectedIndex].value);
          return;
        }

        // Vim-style navigation
        if (char === 'k' || char === 'K') {
          selectedIndex = Math.max(0, selectedIndex - 1);
          render();
          continue;
        }
        if (char === 'j' || char === 'J') {
          selectedIndex = Math.min(APPROVAL_OPTIONS.length - 1, selectedIndex + 1);
          render();
          continue;
        }

        // Ctrl+C
        if (char === '\x03') {
          cleanup();
          process.exit(0);
        }
      }
    };

    // Enable raw mode to capture individual keypresses
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    // Initial render
    renderInitial();
    render();

    stdin.on('data', onData);
  });
}

/**
 * Simple fallback prompt for non-TTY environments
 */
async function promptForApprovalSimple(message: string): Promise<ApprovalChoice> {
  const rl = readline.createInterface({
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
 * Generate a plain-English summary of changes from a diff
 * This is deterministic - no LLM call required
 */
function generateDiffSummary(
  path: string,
  existingContent: string,
  newContent: string,
  isNewFile: boolean
): string[] {
  const summary: string[] = [];
  const newLines = newContent.split('\n').length;

  if (isNewFile) {
    summary.push(`Create new file ${path} (${newLines} lines)`);
    // Detect file type and add context
    if (path.endsWith('.css') || path.endsWith('.scss')) {
      const classCount = (newContent.match(/\.[a-zA-Z][\w-]*/g) || []).length;
      if (classCount > 0) summary.push(`  • ${classCount} CSS classes defined`);
    } else if (path.endsWith('.ts') || path.endsWith('.js') || path.endsWith('.tsx') || path.endsWith('.jsx')) {
      const funcCount = (newContent.match(/(?:function\s+\w+|const\s+\w+\s*=\s*(?:async\s*)?\(|=>\s*{)/g) || []).length;
      const classCount = (newContent.match(/class\s+\w+/g) || []).length;
      if (funcCount > 0) summary.push(`  • ${funcCount} functions`);
      if (classCount > 0) summary.push(`  • ${classCount} classes`);
    } else if (path.endsWith('.html')) {
      summary.push(`  • HTML document`);
    }
    return summary;
  }

  // For modifications, analyze the diff
  const oldLines = existingContent.split('\n');
  const newLinesArr = newContent.split('\n');

  let addedCount = 0;
  let removedCount = 0;

  // Simple line-based diff analysis
  const oldSet = new Set(oldLines.map(l => l.trim()));
  const newSet = new Set(newLinesArr.map(l => l.trim()));

  for (const line of newLinesArr) {
    if (line.trim() && !oldSet.has(line.trim())) addedCount++;
  }
  for (const line of oldLines) {
    if (line.trim() && !newSet.has(line.trim())) removedCount++;
  }

  summary.push(`Modify ${path}: +${addedCount} / -${removedCount} lines`);

  // Detect patterns in changes
  const changes: string[] = [];

  // CSS patterns
  if (path.endsWith('.css') || path.endsWith('.scss')) {
    const removedGradients = existingContent.includes('gradient') && !newContent.includes('gradient');
    const removedAnimations = existingContent.includes('animation') && !newContent.includes('animation');
    if (removedGradients) changes.push('remove gradients');
    if (removedAnimations) changes.push('remove animations');

    const addedFlexbox = !existingContent.includes('display: flex') && newContent.includes('display: flex');
    const addedGrid = !existingContent.includes('display: grid') && newContent.includes('display: grid');
    if (addedFlexbox) changes.push('add flexbox layout');
    if (addedGrid) changes.push('add grid layout');
  }

  // JS/TS patterns
  if (path.endsWith('.ts') || path.endsWith('.js') || path.endsWith('.tsx') || path.endsWith('.jsx')) {
    const removedClasses = (existingContent.match(/class\s+\w+/g) || []).length - (newContent.match(/class\s+\w+/g) || []).length;
    if (removedClasses > 0) changes.push('simplify class structure');

    const addedAsync = !existingContent.includes('async') && newContent.includes('async');
    if (addedAsync) changes.push('add async handling');

    const addedFetch = !existingContent.includes('fetch(') && newContent.includes('fetch(');
    if (addedFetch) changes.push('add API calls');

    const removedLocalStorage = existingContent.includes('localStorage') && !newContent.includes('localStorage');
    if (removedLocalStorage) changes.push('remove localStorage');
  }

  if (changes.length > 0) {
    summary.push(`  • ${changes.slice(0, 3).join(', ')}`);
  }

  return summary;
}

/**
 * Generate a plain-English summary from a unified diff string
 */
function generatePatchSummary(path: string, unifiedDiff: string): string[] {
  const summary: string[] = [];

  const lines = unifiedDiff.split('\n');
  let addedCount = 0;
  let removedCount = 0;

  for (const line of lines) {
    if (line.startsWith('+') && !line.startsWith('+++')) addedCount++;
    if (line.startsWith('-') && !line.startsWith('---')) removedCount++;
  }

  summary.push(`Patch ${path}: +${addedCount} / -${removedCount} lines`);

  return summary;
}

/**
 * Display a file write proposal with diff and plain-English summary
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

  // Plain-English summary before the diff
  const summary = generateDiffSummary(path, existingContent, newContent, isNewFile);
  console.log('');
  console.log(colors.primary.bold('Summary:'));
  for (const line of summary) {
    console.log(chalk.white(`  ${line}`));
  }
  console.log('');

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
 * Display a patch proposal with plain-English summary
 */
export function displayPatchProposal(path: string, unifiedDiff: string): void {
  const divider = symbols.divider.repeat(60);

  console.log('\n' + colors.dim(divider));
  console.log(`${symbols.patch} ${colors.action.modify('PATCH')} ${colors.file(path)}`);
  console.log(colors.dim(divider));

  // Plain-English summary before the diff
  const summary = generatePatchSummary(path, unifiedDiff);
  console.log('');
  console.log(colors.primary.bold('Summary:'));
  for (const line of summary) {
    console.log(chalk.white(`  ${line}`));
  }
  console.log('');

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
