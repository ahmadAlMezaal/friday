import { resolve, relative, isAbsolute } from 'path';

/**
 * Workspace utilities for sandboxed file operations.
 *
 * The workspace is the explicit directory where file writes are allowed.
 * This is separate from --cwd, which affects read/search context.
 */

export class WorkspaceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkspaceError';
  }
}

/**
 * Resolve a workspace path to an absolute path.
 *
 * @param workspacePath - The workspace path (absolute or relative)
 * @param basePath - The base path to resolve relative paths against (typically process.cwd() at CLI invocation)
 * @returns Absolute path to the workspace
 */
export function resolveWorkspace(workspacePath: string, basePath: string): string {
  if (isAbsolute(workspacePath)) {
    return resolve(workspacePath);
  }
  return resolve(basePath, workspacePath);
}

/**
 * Resolve a target path within a workspace and verify it stays within bounds.
 *
 * @param targetPath - The path to resolve (absolute or relative to workspace)
 * @param workspace - The absolute path to the workspace
 * @returns The resolved absolute path
 * @throws WorkspaceError if the resolved path is outside the workspace
 */
export function resolvePathInWorkspace(targetPath: string, workspace: string): string {
  // Resolve the target path relative to workspace
  const resolvedPath = isAbsolute(targetPath)
    ? resolve(targetPath)
    : resolve(workspace, targetPath);

  // Check if the resolved path is within the workspace
  assertPathWithinWorkspace(resolvedPath, workspace);

  return resolvedPath;
}

/**
 * Assert that a resolved path is within the workspace.
 *
 * Uses path.relative() to check containment properly:
 * - If relative path starts with '..', it escapes the workspace
 * - If relative path is absolute, it's outside the workspace (different root)
 *
 * @param resolvedPath - The absolute path to check
 * @param workspace - The absolute path to the workspace
 * @throws WorkspaceError if the path is outside the workspace
 */
export function assertPathWithinWorkspace(resolvedPath: string, workspace: string): void {
  const relativePath = relative(workspace, resolvedPath);

  // If the relative path starts with '..' or is absolute, it's outside the workspace
  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    throw new WorkspaceError(
      `Attempted write outside workspace.\n` +
      `  Workspace: ${workspace}\n` +
      `  Target: ${resolvedPath}\n` +
      `  Relative: ${relativePath}`
    );
  }
}
