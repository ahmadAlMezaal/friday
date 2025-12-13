import { readFile as fsReadFile, writeFile as fsWriteFile } from 'fs/promises';
import { applyPatch as diffApplyPatch } from 'diff';
import { OperationResult } from '../../types.js';
import { resolvePathInWorkspace, WorkspaceError } from '../../workspace.js';
import {
  promptForApproval,
  displayPatchProposal,
  displayApprovalResult,
} from './approval.js';
import { renderFilePatched } from '../../ui.js';

export interface ApplyPatchOptions {
  cwd: string;
  workspace?: string; // The explicit write sandbox
  allowWrite: boolean;
  requireApproval?: boolean;
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

    // If approval is required, show diff and prompt with enhanced UX
    if (options.requireApproval) {
      displayPatchProposal(path, unifiedDiff);

      const choice = await promptForApproval('Apply this patch?');
      displayApprovalResult(path, choice);

      if (choice === 'abort') {
        return {
          ok: false,
          message: `ABORT: User aborted all remaining changes.`,
          abort: true,
        } as OperationResult & { abort?: boolean };
      }

      if (choice === 'no' || choice === 'skip') {
        const action = choice === 'skip' ? 'skipped' : 'rejected';
        return {
          ok: false,
          message: `Patch to ${path} was ${action} by user.`,
        };
      }
    }

    // Write patched content
    await fsWriteFile(fullPath, patchedContent, 'utf-8');

    // Display patch visibility notification
    console.log(renderFilePatched(path));

    return { ok: true, message: `Successfully applied patch to ${path}` };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { ok: false, message: `Failed to apply patch: ${message}` };
  }
}
