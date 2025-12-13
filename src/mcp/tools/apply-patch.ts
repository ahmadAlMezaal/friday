import { readFile as fsReadFile, writeFile as fsWriteFile } from 'fs/promises';
import { join, isAbsolute } from 'path';
import { applyPatch as diffApplyPatch } from 'diff';
import { createInterface } from 'readline';
import { OperationResult } from '../../types.js';

export interface ApplyPatchOptions {
  cwd: string;
  allowWrite: boolean;
  requireApproval?: boolean;
}

async function promptForApproval(message: string): Promise<boolean> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} [y/N]: `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

export async function applyPatch(
  path: string,
  unifiedDiff: string,
  options: ApplyPatchOptions
): Promise<OperationResult> {
  // Safety check: require explicit --apply or --approve flag
  if (!options.allowWrite && !options.requireApproval) {
    return {
      ok: false,
      message: 'Patch application is disabled. Use --apply or --approve flag to enable file modifications.',
    };
  }

  const fullPath = isAbsolute(path) ? path : join(options.cwd, path);

  // Security: prevent path traversal outside cwd
  if (!fullPath.startsWith(options.cwd)) {
    return {
      ok: false,
      message: 'Access denied: path must be within working directory',
    };
  }

  try {
    // Read current file content
    let originalContent: string;
    try {
      originalContent = await fsReadFile(fullPath, 'utf-8');
    } catch {
      // File might not exist, start with empty content
      originalContent = '';
    }

    // Apply the patch
    const patchedContent = diffApplyPatch(originalContent, unifiedDiff);

    if (patchedContent === false) {
      return {
        ok: false,
        message: 'Failed to apply patch: patch does not match current file content',
      };
    }

    // If approval is required, show diff and prompt
    if (options.requireApproval) {
      console.log('\n' + '─'.repeat(60));
      console.log(`🔧 Proposed patch to: ${path}`);
      console.log('─'.repeat(60));
      console.log(unifiedDiff);
      console.log('─'.repeat(60));

      const approved = await promptForApproval('Apply this patch?');
      if (!approved) {
        return {
          ok: false,
          message: `Patch to ${path} was rejected by user.`,
        };
      }
    }

    // Write patched content
    await fsWriteFile(fullPath, patchedContent, 'utf-8');

    return { ok: true, message: `Successfully applied patch to ${path}` };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { ok: false, message: `Failed to apply patch: ${message}` };
  }
}
