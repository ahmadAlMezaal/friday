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

// Write mode for interactive sessions
export type WriteMode = 'dry-run' | 'approve' | 'apply';

export interface InteractiveSession {
  messages: SessionMessage[];
  workspace: string | undefined;
  cwd: string;
  invocationCwd: string; // Directory where friday was launched (for resolving relative paths)
  options: Omit<CliOptions, 'task'>; // task is per-message in interactive mode
  startedAt: Date;
  planOnly: boolean; // When true, next task will be plan-only
}

// Interactive mode CLI options (no task required upfront)
export const InteractiveOptionsSchema = CliOptionsSchema.omit({ task: true }).extend({
  task: z.string().optional(),
  invocationCwd: z.string().optional(), // Directory where friday was launched
});

export type InteractiveOptions = z.infer<typeof InteractiveOptionsSchema>;

// Execution phases for clear workflow
export type ExecutionPhase =
  | 'planning'          // Claude is analyzing and planning
  | 'proposed_changes'  // Claude has listed proposed changes
  | 'approval'          // Waiting for user approval (--approve mode)
  | 'writing'           // Actively writing files
  | 'completed';        // All changes applied

// Proposed file change (collected before writing)
export interface ProposedChange {
  path: string;
  action: 'create' | 'modify';
  description: string;
  content?: string;       // For write_file
  unifiedDiff?: string;   // For apply_patch
}

// Approval response for a single file
export type ApprovalChoice = 'yes' | 'no' | 'skip' | 'abort';

// Activity callback types for real-time transparency
export type ActivityType =
  | 'thinking'           // Claude is analyzing/reasoning
  | 'tool_start'         // Starting a tool call
  | 'tool_end'           // Tool call completed
  | 'advisor_start'      // Starting advisor consultation
  | 'advisor_end'        // Advisor consultation completed
  | 'context_gathering'  // Gathering initial context
  | 'phase_change';      // Execution phase changed

export interface ActivityEvent {
  type: ActivityType;
  message: string;           // Human-readable activity message
  details?: {
    tool?: string;           // Tool name (for tool events)
    advisor?: string;        // Advisor name (for advisor events)
    question?: string;       // High-level question summary (for advisor events)
    success?: boolean;       // Whether the operation succeeded (for _end events)
    phase?: ExecutionPhase;  // Current execution phase (for phase_change events)
    proposedChanges?: ProposedChange[];  // List of proposed changes
  };
}

export type ActivityCallback = (event: ActivityEvent) => void;
