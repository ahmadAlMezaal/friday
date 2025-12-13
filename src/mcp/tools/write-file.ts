import { writeFile as fsWriteFile, mkdir, readFile as fsReadFile } from 'fs/promises';
import { dirname } from 'path';
import { OperationResult } from '../../types.js';
import { resolvePathInWorkspace, WorkspaceError } from '../../workspace.js';
import {
  promptForApproval,
  displayWriteProposal,
  displayApprovalResult,
} from './approval.js';

export interface WriteFileOptions {
  cwd: string;
  workspace?: string; // The explicit write sandbox
  allowWrite: boolean;
  requireApproval?: boolean;
}

export async function writeFile(
  path: string,
  content: string,
  options: WriteFileOptions
): Promise<OperationResult> {
  // Safety check: require explicit --apply or --approve flag
  if (!options.allowWrite && !options.requireApproval) {
    return {
      ok: false,
      message: 'File writes are disabled. Use --apply or --approve flag to enable file modifications.',
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

  // Read existing content for diff display
  let existingContent = '';
  let isNewFile = true;
  try {
    existingContent = await fsReadFile(fullPath, 'utf-8');
    isNewFile = false;
  } catch {
    // File doesn't exist yet, that's fine
  }

  // If approval is required, show diff and prompt with enhanced UX
  if (options.requireApproval) {
    displayWriteProposal(path, existingContent, content, isNewFile);

    const choice = await promptForApproval('Apply this change?');
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
        message: `Write to ${path} was ${action} by user.`,
      };
    }
  }

  try {
    // Ensure directory exists
    await mkdir(dirname(fullPath), { recursive: true });
    await fsWriteFile(fullPath, content, 'utf-8');
    return { ok: true, message: `Successfully wrote to ${path}` };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { ok: false, message: `Failed to write file: ${message}` };
  }
}
