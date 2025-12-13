import { readFile as fsReadFile, writeFile as fsWriteFile } from 'fs/promises';
import { applyPatch as diffApplyPatch } from 'diff';
import { createInterface } from 'readline';
import { OperationResult } from '../../types.js';
import { resolvePathInWorkspace, WorkspaceError } from '../../workspace.js';

export interface ApplyPatchOptions {
  cwd: string;
  workspace?: string; // The explicit write sandbox
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

  // Safety check: require workspace when writes are enabled
  if (!options.workspace) {
    return {
      ok: false,
      message: 'No workspace configured. Use --workspace to specify where file writes are allowed.',
    };
  }

  // Resolve path within workspace and enforce containment
  let fullPath: string;
  try {
    fullPath = resolvePathInWorkspace(path, options.workspace);
  } catch (error) {
    if (error instanceof WorkspaceError) {
      return {
        ok: false,
        message: error.message,
      };
    }
    throw error;
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
