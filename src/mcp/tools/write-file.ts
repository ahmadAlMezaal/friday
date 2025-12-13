import { writeFile as fsWriteFile, mkdir, readFile as fsReadFile } from 'fs/promises';
import { dirname } from 'path';
import { createInterface } from 'readline';
import { createTwoFilesPatch } from 'diff';
import { OperationResult } from '../../types.js';
import { resolvePathInWorkspace, WorkspaceError } from '../../workspace.js';

export interface WriteFileOptions {
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
  try {
    existingContent = await fsReadFile(fullPath, 'utf-8');
  } catch {
    // File doesn't exist yet, that's fine
  }

  // If approval is required, show diff and prompt
  if (options.requireApproval) {
    const patch = createTwoFilesPatch(path, path, existingContent, content, 'original', 'new');
    console.log('\n' + '─'.repeat(60));
    console.log(`📝 Proposed write to: ${path}`);
    console.log('─'.repeat(60));
    console.log(patch);
    console.log('─'.repeat(60));

    const approved = await promptForApproval('Apply this change?');
    if (!approved) {
      return {
        ok: false,
        message: `Write to ${path} was rejected by user.`,
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
