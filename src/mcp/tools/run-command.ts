import { exec } from 'child_process';
import { promisify } from 'util';
import { CommandResult, ALLOWED_COMMANDS } from '../../types.js';

const execAsync = promisify(exec);

export interface RunCommandOptions {
  cwd: string;
  timeout?: number;
}

function isCommandAllowed(cmd: string): boolean {
  const normalizedCmd = cmd.trim().toLowerCase();

  // Check exact matches first
  for (const allowed of ALLOWED_COMMANDS) {
    if (normalizedCmd === allowed.toLowerCase()) {
      return true;
    }
  }

  // Check prefix matches (for commands with arguments)
  const prefixAllowed = [
    'yarn test',
    'yarn lint',
    'yarn typecheck',
    'yarn build',
    'npm test',
    'npm run',
    'git diff',
    'git status',
    'git log',
    'ls',
    'cat',
    'head',
    'tail',
  ];

  for (const prefix of prefixAllowed) {
    if (normalizedCmd.startsWith(prefix.toLowerCase())) {
      return true;
    }
  }

  return false;
}

export async function runCommand(
  cmd: string,
  options: RunCommandOptions
): Promise<CommandResult> {
  // Security: only allow safe commands
  if (!isCommandAllowed(cmd)) {
    return {
      stdout: '',
      stderr: `Command not allowed: ${cmd}\n\nAllowed commands: ${ALLOWED_COMMANDS.join(', ')}`,
      exitCode: 1,
    };
  }

  try {
    const { stdout, stderr } = await execAsync(cmd, {
      cwd: options.cwd,
      timeout: options.timeout || 60000, // 60 second default timeout
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    });

    return {
      stdout,
      stderr,
      exitCode: 0,
    };
  } catch (error) {
    if (error instanceof Error && 'stdout' in error && 'stderr' in error) {
      const execError = error as Error & { stdout: string; stderr: string; code?: number };
      return {
        stdout: execError.stdout || '',
        stderr: execError.stderr || error.message,
        exitCode: execError.code || 1,
      };
    }

    return {
      stdout: '',
      stderr: error instanceof Error ? error.message : 'Unknown error',
      exitCode: 1,
    };
  }
}
