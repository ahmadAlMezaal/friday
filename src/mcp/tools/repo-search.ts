import { glob } from 'glob';
import { readFile } from 'fs/promises';
import { join, relative } from 'path';
import { RepoSearchResult } from '../../types.js';

export interface RepoSearchOptions {
  cwd: string;
  maxResults?: number;
}

export async function repoSearch(
  query: string,
  options: RepoSearchOptions
): Promise<RepoSearchResult> {
  const { cwd, maxResults = 50 } = options;
  const matches: RepoSearchResult['matches'] = [];

  // Find all text files (exclude node_modules, dist, etc.)
  const files = await glob('**/*.{ts,tsx,js,jsx,json,md,yaml,yml,txt}', {
    cwd,
    ignore: ['**/node_modules/**', '**/dist/**', '**/.git/**', '**/coverage/**'],
    absolute: true,
  });

  const queryLower = query.toLowerCase();

  for (const file of files) {
    if (matches.length >= maxResults) break;

    try {
      const content = await readFile(file, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        if (matches.length >= maxResults) break;

        if (lines[i].toLowerCase().includes(queryLower)) {
          matches.push({
            file: relative(cwd, file),
            line: i + 1,
            preview: lines[i].trim().substring(0, 200),
          });
        }
      }
    } catch {
      // Skip files that can't be read
    }
  }

  return { matches };
}
