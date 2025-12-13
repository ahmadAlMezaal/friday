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
  return colors.success(`   ✍ wrote: ${path}`);
}

/**
 * Render file patch notification
 */
export function renderFilePatched(path: string): string {
  return colors.secondary(`   🩹 patched: ${path}`);
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
// Real-time Activity Rendering
// ============================================================================

/**
 * Map of tool names to human-readable activity descriptions
 */
const TOOL_DESCRIPTIONS: Record<string, string> = {
  repo_search: 'searching the repository',
  read_file: 'reading a file',
  git_diff: 'checking git changes',
  run_command: 'running a command',
  write_file: 'writing a file',
  apply_patch: 'applying a patch',
  ask_openai: 'consulting OpenAI',
  ask_gemini: 'consulting Gemini',
};

/**
 * Get a human-readable description for a tool
 */
function getToolDescription(toolName: string): string {
  return TOOL_DESCRIPTIONS[toolName] || toolName.replace(/_/g, ' ');
}

/**
 * Render a real-time activity indicator (inline, no newline)
 */
export function renderActivity(message: string): string {
  return colors.textDim(`   ${symbols.thinking} ${message}`);
}

/**
 * Render tool activity start
 */
export function renderToolStart(toolName: string): string {
  const description = getToolDescription(toolName);
  return colors.textDim(`   ${symbols.gear} Claude is ${description}...`);
}

/**
 * Render tool activity end
 */
export function renderToolEnd(toolName: string, success: boolean): string {
  const description = getToolDescription(toolName);
  if (success) {
    return colors.textDim(`   ${symbols.check} Done ${description}`);
  }
  return colors.warning(`   ${symbols.cross} Failed ${description}`);
}

/**
 * Render advisor consultation start
 */
export function renderAdvisorStart(advisor: string, questionSummary?: string): string {
  const advisorName = advisor.charAt(0).toUpperCase() + advisor.slice(1);
  const lines: string[] = [];
  lines.push(colors.secondary(`   ${symbols.bullet} Asking ${advisorName} for a second opinion...`));
  if (questionSummary) {
    // Truncate long questions
    const truncated = questionSummary.length > 80
      ? questionSummary.substring(0, 77) + '...'
      : questionSummary;
    lines.push(colors.textDim(`     "${truncated}"`));
  }
  return lines.join('\n');
}

/**
 * Render advisor consultation end
 */
export function renderAdvisorEnd(advisor: string, success: boolean): string {
  const advisorName = advisor.charAt(0).toUpperCase() + advisor.slice(1);
  if (success) {
    return colors.secondary(`   ${symbols.check} ${advisorName} responded`);
  }
  return colors.warning(`   ${symbols.cross} ${advisorName} failed to respond`);
}

/**
 * Render context gathering activity
 */
export function renderContextGathering(): string {
  return colors.textDim(`   ${symbols.thinking} Gathering context...`);
}

/**
 * Clear the current line (for updating in-place)
 */
export function clearLine(): void {
  process.stdout.write('\r\x1b[K');
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
