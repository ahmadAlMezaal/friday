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
import select from '@inquirer/select';
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

/**
 * Keyboard-driven approval selector using @inquirer/select
 * Uses arrow keys to navigate, Enter to select, Esc to abort
 * Renders cleanly in place without duplication
 */
export async function promptForApproval(message: string): Promise<ApprovalChoice> {
  // Fall back to simple prompt if not a TTY
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return promptForApprovalSimple(message);
  }

  try {
    const answer = await select<ApprovalChoice>({
      message: colors.primary(message),
      choices: [
        { name: 'Apply', value: 'yes' as ApprovalChoice },
        { name: 'Skip', value: 'skip' as ApprovalChoice },
        { name: 'Reject', value: 'no' as ApprovalChoice },
      ],
      theme: {
        prefix: '',
        style: {
          highlight: (text: string) => colors.selected(text),
          message: (text: string) => text, // Already styled
        },
      },
    });

    return answer;
  } catch (error) {
    // User pressed Esc or Ctrl+C - treat as abort
    if (error instanceof Error && error.message.includes('User force closed')) {
      return 'abort';
    }
    // For any other cancellation (Esc key), return abort
    return 'abort';
  }
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
