import { StateGraph, END, START } from '@langchain/langgraph';
import {
  OrchestratorState,
  CliOptions,
  AgentTool,
  ToolResult,
  ToolCallRecord,
  AdvisorResponse,
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

// Graph state interface
interface GraphState {
  task: string;
  options: CliOptions;
  context: string;
  response: { content: string; model: string } | null;
  advisorResponses: AdvisorResponse[];
  toolCalls: ToolCallRecord[];
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

  // Add write tools only if --apply is set
  if (options.apply) {
    tools.push(
      {
        name: 'write_file',
        description: 'Write content to a file. Only available when --apply flag is set.',
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
        description: 'Apply a unified diff patch to a file. Only available when --apply flag is set.',
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
  if (options.advisors.includes('openai')) {
    tools.push({
      name: 'ask_openai',
      description:
        'Ask OpenAI GPT for a second opinion or alternative perspective. Use this when you want another viewpoint on architecture decisions, complex trade-offs, or to validate your reasoning.',
      inputSchema: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: 'The question or context to ask OpenAI about',
          },
        },
        required: ['prompt'],
      },
    });
  }

  if (options.advisors.includes('gemini')) {
    tools.push({
      name: 'ask_gemini',
      description:
        'Ask Google Gemini for a second opinion or alternative perspective. Use this when you want another viewpoint.',
      inputSchema: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: 'The question or context to ask Gemini about',
          },
        },
        required: ['prompt'],
      },
    });
  }

  return tools;
}

// Tool execution handler
async function executeToolCall(
  name: string,
  input: Record<string, unknown>,
  options: CliOptions,
  toolCalls: ToolCallRecord[],
  advisorResponses: AdvisorResponse[]
): Promise<ToolResult> {
  const cwd = options.cwd || process.cwd();
  const timestamp = new Date();

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
        if (!options.apply) {
          return { error: 'File writes are disabled. Use --apply flag to enable.' };
        }
        const writeResult = await writeFile(
          input.path as string,
          input.content as string,
          { cwd, allowWrite: true }
        );
        result = JSON.stringify(writeResult);
        break;
      }

      case 'apply_patch': {
        if (!options.apply) {
          return { error: 'Patch application is disabled. Use --apply flag to enable.' };
        }
        const patchResult = await applyPatch(
          input.path as string,
          input.unifiedDiff as string,
          { cwd, allowWrite: true }
        );
        result = JSON.stringify(patchResult);
        break;
      }

      case 'ask_openai': {
        const openaiKey = process.env.OPENAI_API_KEY;
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
        const geminiKey = process.env.GEMINI_API_KEY;
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

    return { content: result };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    return { error: errorMsg };
  }
}

// Node: Gather initial context
async function gatherContext(state: GraphState): Promise<Partial<GraphState>> {
  const cwd = state.options.cwd || process.cwd();
  const contextParts: string[] = [];

  // Get git diff if available
  try {
    const diffResult = await gitDiff({ cwd });
    if (diffResult.diff && !diffResult.diff.includes('No changes')) {
      contextParts.push('Current git changes:');
      contextParts.push(diffResult.diff.substring(0, 3000));
    }
  } catch {
    // Ignore git errors
  }

  // Do a quick search based on task keywords
  try {
    const keywords = state.task.split(' ').slice(0, 3).join(' ');
    const searchResult = await repoSearch(keywords, { cwd, maxResults: 5 });
    if (searchResult.matches.length > 0) {
      contextParts.push('\nPotentially relevant files:');
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
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY is required.\n' +
        'Please set it: export ANTHROPIC_API_KEY=your-key-here'
    );
  }

  const tools = buildTools(state.options);
  const toolCalls: ToolCallRecord[] = [...state.toolCalls];
  const advisorResponses: AdvisorResponse[] = [...state.advisorResponses];

  const claude = new ClaudeProvider({
    apiKey,
    tools,
    onToolCall: async (name, input) => {
      return executeToolCall(name, input, state.options, toolCalls, advisorResponses);
    },
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
    },
  });

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
  options: CliOptions
): Promise<OrchestratorState> {
  const graph = createOrchestratorGraph();

  const initialState: GraphState = {
    task,
    options,
    context: '',
    response: null,
    advisorResponses: [],
    toolCalls: [],
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
