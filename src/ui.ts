/**
 * Terminal UI Utilities
 *
 * Consistent styling for Friday CLI.
 * Designed to be subtle, elegant, and readable in plain terminals.
 */

import chalk from 'chalk';

// Color palette - subtle and professional
export const colors = {
  // Primary accent (soft violet)
  primary: chalk.hex('#A78BFA'),
  primaryDim: chalk.hex('#7C3AED'),

  // Secondary (cyan family)
  secondary: chalk.cyan,
  secondaryDim: chalk.cyanBright,

  // Semantic colors
  success: chalk.green,
  warning: chalk.yellow,
  error: chalk.red,
  info: chalk.blue,

  // Text hierarchy
  text: chalk.white,
  textDim: chalk.gray,
  textMuted: chalk.dim,

  // Labels
  label: chalk.white.bold,
};

// Standardized emojis for consistent UX
export const emojis = {
  context: '🔎',
  thinking: '🧠',
  advisor: '🧩',
  command: '⚙️',
  read: '📖',
  write: '✍️',
  applied: '✅',
  skipped: '⏭️',
  aborted: '🛑',
  error: '❌',
  info: 'ℹ️',
  tokens: '📊',
};

// Unicode characters for visual elements
export const symbols = {
  // Box drawing (rounded corners)
  topLeft: '╭',
  topRight: '╮',
  bottomLeft: '╰',
  bottomRight: '╯',
  horizontal: '─',
  vertical: '│',

  // Prompt
  chevron: '›',
  prompt: '❯',

  // Indicators
  star: '✦',
  bullet: '•',
  gear: '⚙',
  check: '✓',
  cross: '✗',
  arrow: '→',
  thinking: '◌',

  // Section markers
  sectionStart: '┌',
  sectionEnd: '└',
  sectionLine: '│',
};

// ============================================================================
// Single-Line Animated Progress
// ============================================================================

/**
 * Progress indicator that updates a single line with animated dots
 */
export class ProgressIndicator {
  private message: string = '';
  private intervalId: NodeJS.Timeout | null = null;
  private dotCount: number = 0;
  private readonly maxDots: number = 3;
  private isActive: boolean = false;

  /**
   * Check if we're in a TTY environment
   */
  private get isTTY(): boolean {
    return process.stdout.isTTY === true;
  }

  /**
   * Start showing progress with animated dots
   */
  start(emoji: string, message: string): void {
    this.stop(); // Stop any existing progress
    this.message = `${emoji} ${message}`;
    this.dotCount = 0;
    this.isActive = true;

    if (this.isTTY) {
      this.render();
      this.intervalId = setInterval(() => {
        this.dotCount = (this.dotCount + 1) % (this.maxDots + 1);
        this.render();
      }, 300);
    } else {
      // Non-TTY: just print the message once
      console.log(this.message);
    }
  }

  /**
   * Update the progress message
   */
  update(emoji: string, message: string): void {
    this.message = `${emoji} ${message}`;
    if (this.isTTY && this.isActive) {
      this.render();
    } else if (!this.isTTY) {
      console.log(this.message);
    }
  }

  /**
   * Stop the progress indicator
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.isActive && this.isTTY) {
      // Clear the line
      process.stdout.write('\r\x1b[K');
    }
    this.isActive = false;
  }

  /**
   * Complete the progress with a final message
   */
  complete(emoji: string, message: string): void {
    this.stop();
    console.log(`${emoji} ${message}`);
  }

  /**
   * Render the current progress state
   */
  private render(): void {
    const dots = '.'.repeat(this.dotCount);
    const padding = ' '.repeat(this.maxDots - this.dotCount);
    process.stdout.write(`\r\x1b[K${this.message} ${dots}${padding}`);
  }
}

// Global progress indicator instance
export const progress = new ProgressIndicator();

/**
 * Create a centered, boxed header
 */
export function renderHeader(options: {
  workspace?: string;
  mode: 'dry-run' | 'approve' | 'apply';
  advisors: string[];
}): string {
  const lines: string[] = [];
  const width = 42;

  // Box top
  lines.push(
    colors.primary(
      `   ${symbols.topLeft}${symbols.horizontal.repeat(width)}${symbols.topRight}`
    )
  );

  // Title with stars
  const title = `${symbols.star}  F R I D A Y  ${symbols.star}`;
  const titlePadding = Math.floor((width - title.length) / 2);
  lines.push(
    colors.primary(`   ${symbols.vertical}`) +
      ' '.repeat(titlePadding) +
      colors.primary.bold(title) +
      ' '.repeat(width - titlePadding - title.length) +
      colors.primary(symbols.vertical)
  );

  // Subtitle
  const subtitle = 'Claude-primary Agent';
  const subtitlePadding = Math.floor((width - subtitle.length) / 2);
  lines.push(
    colors.primary(`   ${symbols.vertical}`) +
      ' '.repeat(subtitlePadding) +
      colors.textDim(subtitle) +
      ' '.repeat(width - subtitlePadding - subtitle.length) +
      colors.primary(symbols.vertical)
  );

  // Box bottom
  lines.push(
    colors.primary(
      `   ${symbols.bottomLeft}${symbols.horizontal.repeat(width)}${symbols.bottomRight}`
    )
  );

  // Empty line
  lines.push('');

  // Status info (left-aligned with labels)
  const workspaceDisplay = options.workspace
    ? shortenPath(options.workspace)
    : colors.textDim('(read-only)');
  lines.push(`   ${colors.label('Workspace')}   ${workspaceDisplay}`);

  const modeDisplay = getModeDisplay(options.mode);
  lines.push(`   ${colors.label('Mode')}        ${modeDisplay}`);

  const advisorsDisplay =
    options.advisors.length > 0
      ? options.advisors.join(', ')
      : colors.textDim('none');
  lines.push(`   ${colors.label('Advisors')}    ${advisorsDisplay}`);

  // Empty line
  lines.push('');

  // Help hint
  lines.push(
    `   ${colors.textDim('Type your task, or')} ${colors.text('!help')} ${colors.textDim('for commands.')}`
  );

  return lines.join('\n');
}

/**
 * Get styled prompt string
 */
export function getPrompt(): string {
  return `${colors.primary(symbols.prompt)} ${colors.text('friday')} ${colors.primary(symbols.chevron)} `;
}

/**
 * Display mode with appropriate color
 */
export function getModeDisplay(
  mode: 'dry-run' | 'approve' | 'apply' | string
): string {
  switch (mode) {
    case 'apply':
      return colors.success('apply');
    case 'approve':
      return colors.secondary('approve');
    case 'dry-run':
    default:
      return colors.warning('dry-run');
  }
}

/**
 * Render thinking indicator
 */
export function renderThinking(): string {
  return `\n${colors.textDim(`${symbols.thinking} Claude is thinking...`)}\n`;
}

/**
 * Render Claude's response with styled header
 */
export function renderClaudeResponse(content: string): string {
  const width = 50;
  const header =
    colors.success(`${symbols.sectionStart} Claude `) +
    colors.success(symbols.horizontal.repeat(width - 10));
  const footer = colors.success(
    `${symbols.sectionEnd}${symbols.horizontal.repeat(width - 1)}`
  );

  return `\n${header}\n${symbols.sectionLine} \n${content}\n\n${footer}\n`;
}

/**
 * Render a section line for Claude's response (visual separator)
 */
export function renderResponseStart(): string {
  const width = 50;
  return (
    '\n' +
    colors.success(`${symbols.sectionStart} Claude `) +
    colors.success(symbols.horizontal.repeat(width - 10))
  );
}

export function renderResponseEnd(): string {
  const width = 50;
  return colors.success(
    `${symbols.sectionEnd}${symbols.horizontal.repeat(width - 1)}`
  );
}

/**
 * Render tool call indicator
 */
export function renderToolCall(toolName: string): string {
  return colors.textDim(`${symbols.gear} ${toolName}`);
}

/**
 * Render advisor consultation
 */
export function renderAdvisorResult(
  model: string,
  error?: string
): string {
  if (error) {
    return colors.warning(`${symbols.bullet} [${model}] Error: ${error}`);
  }
  return colors.textDim(`${symbols.bullet} [${model}] consulted`);
}

/**
 * Render system message
 */
export function renderSystemMessage(message: string): string {
  return colors.textDim(`${symbols.bullet} ${message}`);
}

/**
 * Render error message (readable but not alarming)
 */
export function renderError(message: string): string {
  return colors.error(`\n${symbols.cross} Error: ${message}\n`);
}

/**
 * Render success message
 */
export function renderSuccess(message: string): string {
  return colors.success(`${symbols.check} ${message}`);
}

/**
 * Render warning message
 */
export function renderWarning(message: string): string {
  return colors.warning(`${symbols.bullet} ${message}`);
}

/**
 * Render info message
 */
export function renderInfo(message: string): string {
  return colors.info(`${symbols.bullet} ${message}`);
}

/**
 * Shorten a path for display
 */
export function shortenPath(path: string): string {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  if (home && path.startsWith(home)) {
    return '~' + path.slice(home.length);
  }
  return path;
}

/**
 * Render status display for !status command
 */
export function renderStatus(options: {
  workspace?: string;
  cwd: string;
  mode: 'dry-run' | 'approve' | 'apply' | string;
  advisors: string[];
  messageCount: number;
  durationSeconds: number;
}): string {
  const lines: string[] = [];

  lines.push(`\n${colors.primary('Session status:')}`);
  lines.push(
    `  ${colors.label('Workspace')}  ${options.workspace ? shortenPath(options.workspace) : colors.textDim('(read-only)')}`
  );
  lines.push(`  ${colors.label('CWD')}        ${shortenPath(options.cwd)}`);
  lines.push(`  ${colors.label('Mode')}       ${getModeDisplay(options.mode)}`);
  lines.push(
    `  ${colors.label('Advisors')}   ${options.advisors.length > 0 ? options.advisors.join(', ') : colors.textDim('none')}`
  );
  lines.push(
    `  ${colors.label('Messages')}   ${options.messageCount}`
  );

  const mins = Math.floor(options.durationSeconds / 60);
  const secs = options.durationSeconds % 60;
  lines.push(`  ${colors.label('Duration')}   ${mins}m ${secs}s`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Render help text
 */
export function renderHelp(): string {
  const lines: string[] = [];

  lines.push(`\n${colors.primary('Commands:')}`);
  lines.push(
    `  ${colors.text('!exit, !quit, !q')}     ${colors.textDim('Exit the session')}`
  );
  lines.push(
    `  ${colors.text('!help, !h, !?')}        ${colors.textDim('Show this help')}`
  );
  lines.push(
    `  ${colors.text('!diff, !d')}            ${colors.textDim('Show current git diff')}`
  );
  lines.push(
    `  ${colors.text('!status, !s')}          ${colors.textDim('Show session status')}`
  );
  lines.push(
    `  ${colors.text('!run <cmd>, !r')}       ${colors.textDim('Run an allowed command')}`
  );
  lines.push(
    `  ${colors.text('!clear, !c')}           ${colors.textDim('Clear conversation history')}`
  );
  lines.push(
    `  ${colors.text('!usage, !u')}           ${colors.textDim('Show token usage for session')}`
  );
  lines.push(
    `  ${colors.text('!verbose, !v')}         ${colors.textDim('Toggle verbose debug logging')}`
  );
  lines.push('');

  lines.push(`${colors.primary('Session Control:')}`);
  lines.push(
    `  ${colors.text('!workspace <path>')}    ${colors.textDim('Set/change workspace directory')}`
  );
  lines.push(
    `  ${colors.text('!mode <mode>')}         ${colors.textDim('Set write mode: dry-run, approve, apply')}`
  );
  lines.push(
    `  ${colors.text('!dry')}                 ${colors.textDim('Shortcut for !mode dry-run')}`
  );
  lines.push(
    `  ${colors.text('!approve')}             ${colors.textDim('Shortcut for !mode approve')}`
  );
  lines.push(
    `  ${colors.text('!apply')}               ${colors.textDim('Shortcut for !mode apply')}`
  );
  lines.push(
    `  ${colors.text('!plan')}                ${colors.textDim('Request plan only for next task')}`
  );
  lines.push('');

  return lines.join('\n');
}

// ============================================================================
// Write Visibility Rendering
// ============================================================================

/**
 * Render file write notification
 */
export function renderFileWritten(path: string): string {
  return colors.success(`${emojis.applied} wrote: ${path}`);
}

/**
 * Render file patch notification
 */
export function renderFilePatched(path: string): string {
  return colors.success(`${emojis.applied} patched: ${path}`);
}

/**
 * Render workspace change notification
 */
export function renderWorkspaceChanged(path: string): string {
  return colors.success(`\n${symbols.check} Workspace set to: ${shortenPath(path)}\n`);
}

/**
 * Render mode change notification
 */
export function renderModeChanged(mode: 'dry-run' | 'approve' | 'apply'): string {
  return `\n${symbols.check} Mode changed to: ${getModeDisplay(mode)}\n`;
}

/**
 * Render plan mode enabled indicator
 */
export function renderPlanModeEnabled(): string {
  return colors.secondary(`\n${symbols.bullet} Plan mode enabled for next task. Claude will provide a plan without writing files.\n`);
}

/**
 * Render plan mode disabled indicator
 */
export function renderPlanModeDisabled(): string {
  return colors.textDim(`\n${symbols.bullet} Plan mode disabled.\n`);
}

/**
 * Render plan confirmation prompt
 */
export function renderPlanConfirmation(): string {
  return colors.secondary(`\n${symbols.arrow} Proceed to implementation? (y/N): `);
}

/**
 * Render goodbye message
 */
export function renderGoodbye(): string {
  return colors.textDim(`\n${symbols.bullet} Goodbye!\n`);
}

/**
 * Render interrupted message
 */
export function renderInterrupted(): string {
  return colors.textDim(`\n\n${symbols.bullet} Interrupted. Goodbye!\n`);
}

// ============================================================================
// Real-time Activity Rendering (Single-line progress)
// ============================================================================

/**
 * Map of tool names to human-readable activity descriptions and emojis
 */
const TOOL_INFO: Record<string, { emoji: string; description: string }> = {
  repo_search: { emoji: emojis.context, description: 'Searching' },
  read_file: { emoji: emojis.read, description: 'Reading' },
  git_diff: { emoji: emojis.context, description: 'Checking git' },
  run_command: { emoji: emojis.command, description: 'Running' },
  write_file: { emoji: emojis.write, description: 'Writing' },
  apply_patch: { emoji: emojis.write, description: 'Patching' },
  ask_openai: { emoji: emojis.advisor, description: 'Asking OpenAI' },
  ask_gemini: { emoji: emojis.advisor, description: 'Asking Gemini' },
};

/**
 * Get tool info for rendering
 */
function getToolInfo(toolName: string): { emoji: string; description: string } {
  return TOOL_INFO[toolName] || { emoji: emojis.command, description: toolName.replace(/_/g, ' ') };
}

/**
 * Render a real-time activity indicator - starts animated progress
 */
export function renderActivity(message: string): string {
  progress.start(emojis.thinking, message);
  return ''; // Return empty - progress handles display
}

/**
 * Render tool activity start - starts animated progress
 */
export function renderToolStart(toolName: string): string {
  const info = getToolInfo(toolName);
  progress.start(info.emoji, info.description);
  return ''; // Return empty - progress handles display
}

/**
 * Render tool activity end - completes progress
 *
 * @param toolName - The tool that finished
 * @param success - Whether the tool succeeded
 * @param message - Optional message for context (shown for errors)
 */
export function renderToolEnd(toolName: string, success: boolean, message?: string): string {
  progress.stop();
  // Don't output anything on success for cleaner UX
  // Only output on failure
  if (!success) {
    const toolDisplay = toolName.replace(/_/g, ' ');
    // If we have a message, show it for context (truncated)
    if (message) {
      const truncatedMsg = message.length > 60 ? message.substring(0, 57) + '...' : message;
      return colors.warning(`${emojis.error} ${toolDisplay}: ${truncatedMsg}`);
    }
    return colors.warning(`${emojis.error} Failed: ${toolDisplay}`);
  }
  return '';
}

/**
 * Render file not found (informational, not error)
 */
export function renderFileNotFound(path: string): string {
  return colors.info(`${emojis.info} Not found (new file): ${path}`);
}

/**
 * Render advisor consultation start - starts animated progress
 */
export function renderAdvisorStart(advisor: string, questionSummary?: string): string {
  const advisorName = advisor.charAt(0).toUpperCase() + advisor.slice(1);
  const shortQuestion = questionSummary
    ? `: ${questionSummary.length > 40 ? questionSummary.substring(0, 37) + '...' : questionSummary}`
    : '';
  progress.start(emojis.advisor, `Asking ${advisorName}${shortQuestion}`);
  return ''; // Return empty - progress handles display
}

/**
 * Render advisor consultation end - completes progress
 */
export function renderAdvisorEnd(advisor: string, success: boolean): string {
  const advisorName = advisor.charAt(0).toUpperCase() + advisor.slice(1);
  if (success) {
    progress.complete(emojis.advisor, `${advisorName} replied`);
  } else {
    progress.complete(emojis.error, `${advisorName} failed`);
  }
  return ''; // Return empty - progress handles display
}

/**
 * Render context gathering activity - starts animated progress
 */
export function renderContextGathering(): string {
  progress.start(emojis.context, 'Context');
  return ''; // Return empty - progress handles display
}

/**
 * Clear the current line (for updating in-place)
 */
export function clearLine(): void {
  process.stdout.write('\r\x1b[K');
}

/**
 * Stop the progress indicator (call before printing response)
 */
export function stopProgress(): void {
  progress.stop();
}

// ============================================================================
// Execution Phase Rendering
// ============================================================================

/**
 * Render phase transition banner
 */
export function renderPhaseTransition(
  phase: 'planning' | 'proposed_changes' | 'writing' | 'completed',
  details?: { fileCount?: number }
): string {
  const width = 50;

  switch (phase) {
    case 'planning':
      return colors.primary(`\n   ${symbols.thinking} Planning phase started...`);

    case 'proposed_changes':
      return colors.secondary.bold(`
${symbols.horizontal.repeat(width)}
${symbols.star}  PROPOSED CHANGES
${symbols.horizontal.repeat(width)}`);

    case 'writing': {
      const fileInfo = details?.fileCount ? ` (${details.fileCount} file${details.fileCount === 1 ? '' : 's'})` : '';
      return colors.success.bold(`
${symbols.horizontal.repeat(width)}
${symbols.gear}  WRITING PHASE${fileInfo}
${symbols.horizontal.repeat(width)}`);
    }

    case 'completed':
      return colors.success(`\n   ${symbols.check} All changes applied successfully\n`);

    default:
      return '';
  }
}

/**
 * Render a "ready to write" announcement that Claude should use
 */
export function renderReadyToWrite(files: Array<{ path: string; action: 'create' | 'modify'; description: string }>): string {
  const lines: string[] = [];
  const divider = symbols.horizontal.repeat(50);

  lines.push('');
  lines.push(colors.primary.bold(divider));
  lines.push(colors.primary.bold(`${symbols.star}  I am ready to write the following files:`));
  lines.push(colors.primary.bold(divider));
  lines.push('');

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const actionLabel = file.action === 'create'
      ? colors.success('(create)')
      : colors.warning('(modify)');
    lines.push(`   ${i + 1}. ${colors.text(file.path)} ${actionLabel}`);
    lines.push(`      ${colors.textDim(file.description)}`);
  }

  lines.push('');

  return lines.join('\n');
}

/**
 * Render mode-specific hint about what will happen
 */
export function renderWriteModeHint(mode: 'apply' | 'approve'): string {
  if (mode === 'apply') {
    return colors.warning(`   ${symbols.bullet} Mode: --apply (changes will be written immediately)\n`);
  }
  return colors.secondary(`   ${symbols.bullet} Mode: --approve (you will be prompted for each file)\n`);
}

// ============================================================================
// Token Usage Rendering
// ============================================================================

/**
 * Format a number with commas for readability
 */
function formatNumber(n: number): string {
  return n.toLocaleString();
}

/**
 * Render token usage for a single model call
 */
export function renderTokenUsage(
  provider: string,
  inputTokens: number,
  outputTokens: number
): string {
  const total = inputTokens + outputTokens;
  return colors.textDim(
    `${emojis.tokens} ${provider}: ${formatNumber(inputTokens)} in / ${formatNumber(outputTokens)} out (${formatNumber(total)} total)`
  );
}

/**
 * Render session token usage summary for !usage command
 */
export function renderUsageSummary(usage: {
  claude: { inputTokens: number; outputTokens: number; totalTokens: number };
  openai: { inputTokens: number; outputTokens: number; totalTokens: number };
  gemini: { inputTokens: number; outputTokens: number; totalTokens: number };
  total: { inputTokens: number; outputTokens: number; totalTokens: number };
}): string {
  const lines: string[] = [];

  lines.push('');
  lines.push(colors.primary('Session Token Usage:'));
  lines.push(colors.textDim('─'.repeat(50)));

  // Claude usage
  if (usage.claude.totalTokens > 0) {
    lines.push(
      `  ${colors.label('Claude')}    ${formatNumber(usage.claude.inputTokens).padStart(10)} in  │  ${formatNumber(usage.claude.outputTokens).padStart(10)} out  │  ${formatNumber(usage.claude.totalTokens).padStart(10)} total`
    );
  } else {
    lines.push(`  ${colors.label('Claude')}    ${colors.textDim('(no usage)')}`);
  }

  // OpenAI usage
  if (usage.openai.totalTokens > 0) {
    lines.push(
      `  ${colors.label('OpenAI')}    ${formatNumber(usage.openai.inputTokens).padStart(10)} in  │  ${formatNumber(usage.openai.outputTokens).padStart(10)} out  │  ${formatNumber(usage.openai.totalTokens).padStart(10)} total`
    );
  } else {
    lines.push(`  ${colors.label('OpenAI')}    ${colors.textDim('(no usage)')}`);
  }

  // Gemini usage
  if (usage.gemini.totalTokens > 0) {
    lines.push(
      `  ${colors.label('Gemini')}    ${formatNumber(usage.gemini.inputTokens).padStart(10)} in  │  ${formatNumber(usage.gemini.outputTokens).padStart(10)} out  │  ${formatNumber(usage.gemini.totalTokens).padStart(10)} total`
    );
  } else {
    lines.push(`  ${colors.label('Gemini')}    ${colors.textDim('(no usage)')}`);
  }

  // Total
  lines.push(colors.textDim('─'.repeat(50)));
  lines.push(
    colors.success(
      `  ${colors.label('Total')}     ${formatNumber(usage.total.inputTokens).padStart(10)} in  │  ${formatNumber(usage.total.outputTokens).padStart(10)} out  │  ${formatNumber(usage.total.totalTokens).padStart(10)} total`
    )
  );
  lines.push('');

  return lines.join('\n');
}
