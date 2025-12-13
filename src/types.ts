import { z } from 'zod';

// CLI Options Schema - v2 with Claude as primary
export const CliOptionsSchema = z.object({
  task: z.string(),
  advisors: z.array(z.enum(['openai', 'gemini'])).default([]),
  apply: z.boolean().default(false),
  approve: z.boolean().default(false),
  dryRun: z.boolean().default(true),
  cwd: z.string().optional(),
  workspace: z.string().optional(), // Explicit write sandbox (required if --apply or --approve)
  verbose: z.boolean().default(false),
  maxToolCalls: z.number().int().positive().default(20),
  maxTurns: z.number().int().positive().default(10),
});

export type CliOptions = z.infer<typeof CliOptionsSchema>;

// LLM Response types
export interface LLMResponse {
  content: string;
  model: string;
  confidence?: number;
  uncertaintyIndicators?: string[];
}

// Advisor response (from secondary LLMs)
export interface AdvisorResponse {
  response: string;
  model: string;
  error?: string;
}

// Tool definitions for Claude agent
export interface AgentTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

// Tool execution result
export interface ToolResult {
  content?: string;
  error?: string;
}

// Orchestration state
export interface OrchestratorState {
  task: string;
  options: CliOptions;
  context: string;
  response: LLMResponse;
  advisorResponses: AdvisorResponse[];
  toolCalls: ToolCallRecord[];
}

// Record of tool calls made during execution
export interface ToolCallRecord {
  tool: string;
  input: Record<string, unknown>;
  output: string;
  timestamp: Date;
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

// Available advisor models
export const AVAILABLE_ADVISORS = ['openai', 'gemini'] as const;
export type AdvisorType = (typeof AVAILABLE_ADVISORS)[number];

// Interactive session types (REPL mode)
export interface SessionMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface InteractiveSession {
  messages: SessionMessage[];
  workspace: string | undefined;
  cwd: string;
  options: Omit<CliOptions, 'task'>; // task is per-message in interactive mode
  startedAt: Date;
}

// Interactive mode CLI options (no task required upfront)
export const InteractiveOptionsSchema = CliOptionsSchema.omit({ task: true }).extend({
  task: z.string().optional(),
});

export type InteractiveOptions = z.infer<typeof InteractiveOptionsSchema>;
