import { z } from 'zod';

// CLI Options Schema
export const CliOptionsSchema = z.object({
  task: z.string(),
  modelPrimary: z.string().default('claude'),
  modelSecondary: z.string().default('openai:gpt-4.1'),
  when: z.enum(['auto', 'always', 'never']).default('auto'),
  apply: z.boolean().default(false),
  dryRun: z.boolean().default(true),
  cwd: z.string().optional(),
});

export type CliOptions = z.infer<typeof CliOptionsSchema>;

// LLM Response types
export interface LLMResponse {
  content: string;
  model: string;
  confidence?: number;
  uncertaintyIndicators?: string[];
}

// Orchestration state
export interface OrchestratorState {
  task: string;
  options: CliOptions;
  primaryResponse?: LLMResponse;
  secondaryResponse?: LLMResponse;
  shouldCallSecondary: boolean;
  mergedRecommendation?: string;
  proposedPatches?: PatchProposal[];
  executionResults?: ExecutionResult[];
}

// Patch types
export interface PatchProposal {
  path: string;
  diff: string;
  description: string;
}

export interface ExecutionResult {
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
}

// MCP Tool types
export interface RepoSearchResult {
  matches: Array<{
    file: string;
    line: number;
    preview: string;
  }>;
}

export interface FileContent {
  content: string;
}

export interface OperationResult {
  ok: boolean;
  message?: string;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface GitDiffResult {
  diff: string;
}

// Provider interface
export interface LLMProvider {
  name: string;
  generateResponse(prompt: string, context?: string): Promise<LLMResponse>;
}

// Uncertainty detection patterns
export const UNCERTAINTY_PATTERNS = [
  /not sure/i,
  /might be/i,
  /could be/i,
  /unclear/i,
  /uncertain/i,
  /possibly/i,
  /perhaps/i,
  /I think/i,
  /probably/i,
  /may need/i,
];

// Architecture/refactor detection patterns
export const COMPLEXITY_PATTERNS = [
  /refactor/i,
  /architecture/i,
  /redesign/i,
  /restructure/i,
  /migrate/i,
  /breaking change/i,
  /significant change/i,
  /major update/i,
];

// Allowed safe commands
export const ALLOWED_COMMANDS = [
  'yarn test',
  'yarn lint',
  'yarn typecheck',
  'yarn build',
  'npm test',
  'npm run lint',
  'npm run typecheck',
  'npm run build',
  'git diff',
  'git status',
  'git log',
  'ls',
  'cat',
  'head',
  'tail',
];
