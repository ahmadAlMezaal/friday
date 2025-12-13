import { writeFile as fsWriteFile, mkdir } from 'fs/promises';
import { join, isAbsolute, dirname } from 'path';
import { OperationResult } from '../../types.js';

export interface WriteFileOptions {
  cwd: string;
  allowWrite: boolean;
}

export async function writeFile(
  path: string,
  content: string,
  options: WriteFileOptions
): Promise<OperationResult> {
  // Safety check: require explicit --apply flag
  if (!options.allowWrite) {
    return {
      ok: false,
      message: 'File writes are disabled. Use --apply flag to enable file modifications.',
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
    // Ensure directory exists
    await mkdir(dirname(fullPath), { recursive: true });
    await fsWriteFile(fullPath, content, 'utf-8');
    return { ok: true, message: `Successfully wrote to ${path}` };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { ok: false, message: `Failed to write file: ${message}` };
  }
}
