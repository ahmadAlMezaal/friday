import { StateGraph, END, START } from '@langchain/langgraph';
import {
  OrchestratorState,
  CliOptions,
  AgentTool,
  ToolResult,
  ToolCallRecord,
  AdvisorResponse,
  ActivityCallback,
  ActivityEvent,
} from './types.js';
import { ClaudeProvider } from './providers/claude.js';
import { askOpenAI } from './advisors/openai.js';
import { askGemini } from './advisors/gemini.js';
import {
  repoSearch,
  readFile,
  writeFile,
  applyPatch,
  runCommand,
  gitDiff,
} from './mcp/tools/index.js';
import { getKey } from './api-key-setup.js';

// Graph state interface
interface GraphState {
  task: string;
  options: CliOptions;
  context: string;
  response: { content: string; model: string } | null;
  advisorResponses: AdvisorResponse[];
  toolCalls: ToolCallRecord[];
  onActivity?: ActivityCallback;
}

// Build the tool definitions for Claude
function buildTools(options: CliOptions): AgentTool[] {
  const tools: AgentTool[] = [
    // Repository tools
    {
      name: 'repo_search',
      description: 'Search for text patterns in repository files. Returns matching files, line numbers, and previews.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query to find in files',
          },
        },
        required: ['query'],
      },
    },
    {
      name: 'read_file',
      description: 'Read the contents of a file in the repository.',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the file (relative to repository root)',
          },
        },
        required: ['path'],
      },
    },
    {
      name: 'git_diff',
      description: 'Get the current git diff showing staged and unstaged changes.',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
    {
      name: 'run_command',
      description: 'Run an allowed command (yarn test, yarn lint, git status, etc.). Only safe commands are permitted.',
      inputSchema: {
        type: 'object',
        properties: {
          cmd: {
            type: 'string',
            description: 'The command to run (must be in allowlist)',
          },
        },
        required: ['cmd'],
      },
    },
  ];

  // Add write tools only if --apply or --approve is set
  if (options.apply || options.approve) {
    const modeNote = options.approve
      ? 'User will be prompted to approve each change.'
      : 'Changes will be applied immediately.';
    tools.push(
      {
        name: 'write_file',
        description: `Write content to a file. ${modeNote}`,
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to the file (relative to repository root)',
            },
            content: {
              type: 'string',
              description: 'Content to write to the file',
            },
          },
          required: ['path', 'content'],
        },
      },
      {
        name: 'apply_patch',
        description: `Apply a unified diff patch to a file. ${modeNote}`,
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to the file (relative to repository root)',
            },
            unifiedDiff: {
              type: 'string',
              description: 'The unified diff to apply',
            },
          },
          required: ['path', 'unifiedDiff'],
        },
      }
    );
  }

  // Add advisor tools based on --advisors flag
  // Advisor prompts should be structured: task summary, relevant snippets, constraints, explicit question
  const advisorPromptGuidance = `Structure your prompt as:
1. TASK: Brief summary of what you're working on
2. CONTEXT: Only relevant code snippets (max 50 lines)
3. CONSTRAINTS: Any requirements (tests, style, compatibility)
4. QUESTION: Specific question with expected response format`;

  if (options.advisors.includes('openai')) {
    tools.push({
      name: 'ask_openai',
      description: `Ask OpenAI GPT for a second opinion. Use for architecture decisions, trade-offs, or validation. ${advisorPromptGuidance}`,
      inputSchema: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: 'Structured prompt with TASK, CONTEXT, CONSTRAINTS, and QUESTION sections',
          },
        },
        required: ['prompt'],
      },
    });
  }

  if (options.advisors.includes('gemini')) {
    tools.push({
      name: 'ask_gemini',
      description: `Ask Google Gemini for a second opinion. ${advisorPromptGuidance}`,
      inputSchema: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: 'Structured prompt with TASK, CONTEXT, CONSTRAINTS, and QUESTION sections',
          },
        },
        required: ['prompt'],
      },
    });
  }

  return tools;
}

/**
 * Extract a high-level question summary from an advisor prompt.
 * Looks for the QUESTION section or takes the first line.
 */
function extractQuestionSummary(prompt: string): string {
  // Try to find a QUESTION section
  const questionMatch = prompt.match(/(?:^|\n)\s*(?:QUESTION|Question):\s*(.+?)(?:\n|$)/i);
  if (questionMatch) {
    return questionMatch[1].trim();
  }

  // Try to find the TASK section
  const taskMatch = prompt.match(/(?:^|\n)\s*(?:TASK|Task):\s*(.+?)(?:\n|$)/i);
  if (taskMatch) {
    return taskMatch[1].trim();
  }

  // Fall back to first meaningful line
  const lines = prompt.split('\n').filter(l => l.trim().length > 0);
  if (lines.length > 0) {
    const firstLine = lines[0].trim();
    return firstLine.length > 100 ? firstLine.substring(0, 97) + '...' : firstLine;
  }

  return 'Seeking a second opinion';
}

// Tool execution handler
async function executeToolCall(
  name: string,
  input: Record<string, unknown>,
  options: CliOptions,
  toolCalls: ToolCallRecord[],
  advisorResponses: AdvisorResponse[],
  onActivity?: ActivityCallback
): Promise<ToolResult> {
  const cwd = options.cwd || process.cwd();
  const timestamp = new Date();

  // Determine if this is an advisor tool
  const isAdvisorTool = name === 'ask_openai' || name === 'ask_gemini';
  const advisorName = name === 'ask_openai' ? 'openai' : name === 'ask_gemini' ? 'gemini' : undefined;

  // Emit activity start event
  if (onActivity) {
    if (isAdvisorTool && advisorName) {
      const questionSummary = extractQuestionSummary(input.prompt as string);
      onActivity({
        type: 'advisor_start',
        message: `Asking ${advisorName} for a second opinion...`,
        details: { advisor: advisorName, question: questionSummary },
      });
    } else {
      onActivity({
        type: 'tool_start',
        message: `Using ${name}`,
        details: { tool: name },
      });
    }
  }

  try {
    let result: string;

    switch (name) {
      case 'repo_search': {
        const searchResult = await repoSearch(input.query as string, { cwd });
        result = JSON.stringify(searchResult, null, 2);
        break;
      }

      case 'read_file': {
        const fileResult = await readFile(input.path as string, { cwd });
        result = fileResult.content;
        break;
      }

      case 'git_diff': {
        const diffResult = await gitDiff({ cwd });
        result = diffResult.diff;
        break;
      }

      case 'run_command': {
        const cmdResult = await runCommand(input.cmd as string, { cwd });
        result = JSON.stringify(cmdResult, null, 2);
        break;
      }

      case 'write_file': {
        if (!options.apply && !options.approve) {
          return { error: 'File writes are disabled. Use --apply or --approve flag to enable.' };
        }
        const writeResult = await writeFile(
          input.path as string,
          input.content as string,
          {
            cwd,
            workspace: options.workspace,
            allowWrite: options.apply,
            requireApproval: options.approve,
          }
        );
        result = JSON.stringify(writeResult);
        break;
      }

      case 'apply_patch': {
        if (!options.apply && !options.approve) {
          return { error: 'Patch application is disabled. Use --apply or --approve flag to enable.' };
        }
        const patchResult = await applyPatch(
          input.path as string,
          input.unifiedDiff as string,
          {
            cwd,
            workspace: options.workspace,
            allowWrite: options.apply,
            requireApproval: options.approve,
          }
        );
        result = JSON.stringify(patchResult);
        break;
      }

      case 'ask_openai': {
        const openaiKey = getKey('openai');
        const advisorResult = await askOpenAI(input.prompt as string, {
          apiKey: openaiKey || '',
        });
        advisorResponses.push(advisorResult);
        if (advisorResult.error) {
          return { error: advisorResult.error };
        }
        result = advisorResult.response;
        break;
      }

      case 'ask_gemini': {
        const geminiKey = getKey('gemini');
        const advisorResult = await askGemini(input.prompt as string, {
          apiKey: geminiKey || '',
        });
        advisorResponses.push(advisorResult);
        if (advisorResult.error) {
          return { error: advisorResult.error };
        }
        result = advisorResult.response;
        break;
      }

      default:
        return { error: `Unknown tool: ${name}` };
    }

    // Record the tool call
    toolCalls.push({
      tool: name,
      input,
      output: result.substring(0, 1000), // Truncate for logging
      timestamp,
    });

    // Emit activity end event
    if (onActivity) {
      if (isAdvisorTool && advisorName) {
        onActivity({
          type: 'advisor_end',
          message: `${advisorName} responded`,
          details: { advisor: advisorName, success: true },
        });
      } else {
        onActivity({
          type: 'tool_end',
          message: `Completed ${name}`,
          details: { tool: name, success: true },
        });
      }
    }

    return { content: result };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';

    // Emit activity end event for failure
    if (onActivity) {
      if (isAdvisorTool && advisorName) {
        onActivity({
          type: 'advisor_end',
          message: `${advisorName} failed`,
          details: { advisor: advisorName, success: false },
        });
      } else {
        onActivity({
          type: 'tool_end',
          message: `Failed ${name}`,
          details: { tool: name, success: false },
        });
      }
    }

    return { error: errorMsg };
  }
}

/**
 * Deterministic Context Pack
 *
 * This is NOT Claude-driven tool usage. This is a fixed pre-flight step that runs
 * BEFORE Claude is invoked, providing a minimal context pack:
 * - Git diff (if in a git repo)
 * - Quick keyword search based on task (first 3 words)
 *
 * Design choice: This reduces latency by front-loading common context that Claude
 * would likely request anyway. Claude can still use tools to gather more context.
 */
async function gatherContext(state: GraphState): Promise<Partial<GraphState>> {
  const cwd = state.options.cwd || process.cwd();
  const contextParts: string[] = [];

  // Emit context gathering activity
  if (state.onActivity) {
    state.onActivity({
      type: 'context_gathering',
      message: 'Gathering context...',
    });
  }

  // Deterministic: always get git diff if available
  try {
    const diffResult = await gitDiff({ cwd });
    if (diffResult.diff && !diffResult.diff.includes('No changes')) {
      contextParts.push('## Git Changes (auto-gathered)');
      contextParts.push(diffResult.diff.substring(0, 3000));
    }
  } catch {
    // Ignore git errors (not a git repo)
  }

  // Deterministic: keyword search based on first 3 words of task
  try {
    const keywords = state.task.split(' ').slice(0, 3).join(' ');
    const searchResult = await repoSearch(keywords, { cwd, maxResults: 5 });
    if (searchResult.matches.length > 0) {
      contextParts.push('\n## Potentially Relevant Files (auto-gathered)');
      for (const match of searchResult.matches) {
        contextParts.push(`  ${match.file}:${match.line} - ${match.preview}`);
      }
    }
  } catch {
    // Ignore search errors
  }

  return {
    context: contextParts.join('\n'),
  };
}

// Node: Run Claude agent
async function runClaudeAgent(state: GraphState): Promise<Partial<GraphState>> {
  const apiKey = getKey('anthropic');
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY is required.\n' +
        'Please set it: export ANTHROPIC_API_KEY=your-key-here'
    );
  }

  // Emit thinking activity
  if (state.onActivity) {
    state.onActivity({
      type: 'thinking',
      message: 'Claude is analysing the task...',
    });
  }

  const tools = buildTools(state.options);
  const toolCalls: ToolCallRecord[] = [...state.toolCalls];
  const advisorResponses: AdvisorResponse[] = [...state.advisorResponses];

  const claude = new ClaudeProvider({
    apiKey,
    tools,
    onToolCall: async (name, input) => {
      return executeToolCall(name, input, state.options, toolCalls, advisorResponses, state.onActivity);
    },
    maxToolCalls: state.options.maxToolCalls,
    maxTurns: state.options.maxTurns,
  });

  // Build the task prompt with context
  let taskPrompt = state.task;
  if (state.context) {
    taskPrompt = `## Repository Context\n${state.context}\n\n## Task\n${state.task}`;
  }

  // Add info about available tools
  const advisorInfo =
    state.options.advisors.length > 0
      ? `\n\nYou have access to advisor tools: ${state.options.advisors.join(', ')}. Use them when you want a second opinion.`
      : '\n\nNo advisor tools are configured. Work independently.';

  const applyInfo = state.options.apply
    ? '\n\nFile modification is ENABLED. You can write files and apply patches.'
    : '\n\nFile modification is DISABLED (dry-run mode). You can only read and analyze.';

  taskPrompt += advisorInfo + applyInfo;

  const response = await claude.generateResponse(taskPrompt);

  return {
    response,
    toolCalls,
    advisorResponses,
  };
}

// Create the orchestrator graph
export function createOrchestratorGraph() {
  // Use type assertion to work around LangGraph's strict typing
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const workflow = new StateGraph<GraphState>({
    channels: {
      task: {
        value: (a: string, b?: string) => b ?? a,
        default: () => '',
      },
      options: {
        value: (a: CliOptions, b?: CliOptions) => b ?? a,
        default: () => ({}) as CliOptions,
      },
      context: {
        value: (a: string, b?: string) => b ?? a,
        default: () => '',
      },
      response: {
        value: (
          a: { content: string; model: string } | null,
          b?: { content: string; model: string } | null
        ) => b ?? a,
        default: () => null,
      },
      advisorResponses: {
        value: (a: AdvisorResponse[], b?: AdvisorResponse[]) => b ?? a,
        default: () => [],
      },
      toolCalls: {
        value: (a: ToolCallRecord[], b?: ToolCallRecord[]) => b ?? a,
        default: () => [],
      },
      onActivity: {
        value: (a: ActivityCallback | undefined, b?: ActivityCallback) => b ?? a,
        default: () => undefined,
      },
    },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;

  // Add nodes
  workflow.addNode('gather_context', gatherContext);
  workflow.addNode('claude_agent', runClaudeAgent);

  // Add edges - simple linear flow, Claude handles all decisions
  workflow.addEdge(START, 'gather_context');
  workflow.addEdge('gather_context', 'claude_agent');
  workflow.addEdge('claude_agent', END);

  return workflow.compile();
}

// Main orchestrator function
export async function runOrchestrator(
  task: string,
  options: CliOptions,
  onActivity?: ActivityCallback
): Promise<OrchestratorState> {
  const graph = createOrchestratorGraph();

  const initialState: GraphState = {
    task,
    options,
    context: '',
    response: null,
    advisorResponses: [],
    toolCalls: [],
    onActivity,
  };

  const result = await graph.invoke(initialState);

  return {
    task,
    options,
    context: result.context,
    response: result.response || { content: 'No response generated', model: 'unknown' },
    advisorResponses: result.advisorResponses,
    toolCalls: result.toolCalls,
  };
}

// Export types for testing
export type { GraphState };
