import { exec } from 'child_process';
import { promisify } from 'util';
import { GitDiffResult } from '../../types.js';

const execAsync = promisify(exec);

export interface GitDiffOptions {
  cwd: string;
}

export async function gitDiff(options: GitDiffOptions): Promise<GitDiffResult> {
  try {
    // Get both staged and unstaged changes
    const { stdout: stagedDiff } = await execAsync('git diff --cached', {
      cwd: options.cwd,
      maxBuffer: 10 * 1024 * 1024,
    });

    const { stdout: unstagedDiff } = await execAsync('git diff', {
      cwd: options.cwd,
      maxBuffer: 10 * 1024 * 1024,
    });

    let diff = '';

    if (stagedDiff) {
      diff += '=== Staged Changes ===\n' + stagedDiff + '\n';
    }

    if (unstagedDiff) {
      diff += '=== Unstaged Changes ===\n' + unstagedDiff + '\n';
    }

    if (!diff) {
      diff = 'No changes detected in the repository.';
    }

    return { diff };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    // Check if this is not a git repository
    if (message.includes('not a git repository')) {
      return { diff: 'Not a git repository. Initialize with: git init' };
    }

    return { diff: `Failed to get git diff: ${message}` };
  }
}
