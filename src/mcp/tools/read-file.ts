import { readFile as fsReadFile } from 'fs/promises';
import { join, isAbsolute } from 'path';
import { FileContent } from '../../types.js';

export interface ReadFileOptions {
  cwd: string;
}

export async function readFile(
  path: string,
  options: ReadFileOptions
): Promise<FileContent> {
  const fullPath = isAbsolute(path) ? path : join(options.cwd, path);

  // Security: prevent path traversal outside cwd
  if (!fullPath.startsWith(options.cwd)) {
    throw new Error(`Access denied: path must be within working directory`);
  }

  try {
    const content = await fsReadFile(fullPath, 'utf-8');
    return { content };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to read file ${path}: ${message}`);
  }
}
