import { readFile as fsReadFile, writeFile as fsWriteFile } from 'fs/promises';
import { join, isAbsolute } from 'path';
import { applyPatch as diffApplyPatch } from 'diff';
import { OperationResult } from '../../types.js';

export interface ApplyPatchOptions {
  cwd: string;
  allowWrite: boolean;
}

export async function applyPatch(
  path: string,
  unifiedDiff: string,
  options: ApplyPatchOptions
): Promise<OperationResult> {
  // Safety check: require explicit --apply flag
  if (!options.allowWrite) {
    return {
      ok: false,
      message: 'Patch application is disabled. Use --apply flag to enable file modifications.',
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

    // Write patched content
    await fsWriteFile(fullPath, patchedContent, 'utf-8');

    return { ok: true, message: `Successfully applied patch to ${path}` };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { ok: false, message: `Failed to apply patch: ${message}` };
  }
}
