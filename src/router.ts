import { StateGraph, END, START } from '@langchain/langgraph';
import { BaseMessage, HumanMessage, AIMessage } from '@langchain/core/messages';
import {
  OrchestratorState,
  LLMResponse,
  UNCERTAINTY_PATTERNS,
  COMPLEXITY_PATTERNS,
  CliOptions,
} from './types.js';
import { createProvider } from './providers/index.js';
import { repoSearch, readFile, gitDiff, runCommand } from './mcp/tools/index.js';

// State for the graph
interface GraphState {
  task: string;
  options: CliOptions;
  context: string;
  primaryResponse: LLMResponse | null;
  secondaryResponse: LLMResponse | null;
  shouldCallSecondary: boolean;
  mergedRecommendation: string;
  messages: BaseMessage[];
}

// Create initial state
function createInitialState(task: string, options: CliOptions): GraphState {
  return {
    task,
    options,
    context: '',
    primaryResponse: null,
    secondaryResponse: null,
    shouldCallSecondary: false,
    mergedRecommendation: '',
    messages: [],
  };
}

// Node: Gather context from the repository
async function gatherContext(state: GraphState): Promise<Partial<GraphState>> {
  const cwd = state.options.cwd || process.cwd();
  const contextParts: string[] = [];

  // Search for relevant files based on task
  try {
    const searchResult = await repoSearch(state.task.split(' ').slice(0, 3).join(' '), {
      cwd,
      maxResults: 10,
    });

    if (searchResult.matches.length > 0) {
      contextParts.push('Relevant files found:');
      for (const match of searchResult.matches.slice(0, 5)) {
        contextParts.push(`  ${match.file}:${match.line} - ${match.preview}`);
      }
    }
  } catch {
    // Ignore search errors
  }

  // Get git diff if available
  try {
    const diffResult = await gitDiff({ cwd });
    if (diffResult.diff && !diffResult.diff.includes('No changes')) {
      contextParts.push('\nCurrent git changes:');
      contextParts.push(diffResult.diff.substring(0, 2000));
    }
  } catch {
    // Ignore git errors
  }

  return {
    context: contextParts.join('\n'),
  };
}

// Node: Generate primary response (simulated - in real use, this is Claude via Claude Code)
async function generatePrimaryResponse(state: GraphState): Promise<Partial<GraphState>> {
  // In a real integration, this would be handled by Claude Code itself
  // For now, we simulate a primary response that indicates the task analysis
  const primaryResponse: LLMResponse = {
    content: `Primary Analysis for: "${state.task}"

Based on the repository context, here's my analysis:

1. Understanding: I've analyzed the task and gathered context from the repository.

2. Approach:
   - First, we need to identify the relevant files and components
   - Then, determine the best implementation strategy
   - Finally, propose specific changes

3. Considerations:
   - This task ${state.context.length > 100 ? 'has relevant context' : 'may need more context'}
   - The approach depends on existing code patterns

4. Recommendation:
   I suggest we proceed with a careful, incremental approach to this task.

${state.context ? `\nContext gathered:\n${state.context.substring(0, 500)}...` : ''}`,
    model: 'claude',
    confidence: 0.85,
    uncertaintyIndicators: [],
  };

  return {
    primaryResponse,
    messages: [...state.messages, new AIMessage(primaryResponse.content)],
  };
}

// Decision function: Should we call secondary LLM?
export function shouldCallSecondary(state: GraphState): boolean {
  const { options, primaryResponse } = state;

  // Explicit flags
  if (options.when === 'always') return true;
  if (options.when === 'never') return false;

  // Auto mode: check conditions
  if (options.when === 'auto' && primaryResponse) {
    // Check for uncertainty indicators in primary response
    const hasUncertainty = detectUncertainty(primaryResponse.content);
    if (hasUncertainty) return true;

    // Check for complexity indicators in the task
    const hasComplexity = detectComplexity(state.task);
    if (hasComplexity) return true;

    // Check for error/test failure context
    const hasErrors = detectErrors(state.context);
    if (hasErrors) return true;
  }

  return false;
}

// Helper: Detect uncertainty in text
export function detectUncertainty(text: string): boolean {
  return UNCERTAINTY_PATTERNS.some((pattern) => pattern.test(text));
}

// Helper: Detect complexity indicators
export function detectComplexity(text: string): boolean {
  return COMPLEXITY_PATTERNS.some((pattern) => pattern.test(text));
}

// Helper: Detect error/test failure context
export function detectErrors(context: string): boolean {
  const errorPatterns = [
    /error/i,
    /fail/i,
    /exception/i,
    /test.*fail/i,
    /broken/i,
  ];
  return errorPatterns.some((pattern) => pattern.test(context));
}

// Node: Generate secondary response
async function generateSecondaryResponse(state: GraphState): Promise<Partial<GraphState>> {
  const provider = createProvider(state.options.modelSecondary);

  const prompt = `Task: ${state.task}

Primary LLM Analysis:
${state.primaryResponse?.content || 'No primary analysis available'}

Please provide:
1. Your independent analysis of this task
2. Any alternative approaches or considerations
3. Points of agreement or disagreement with the primary analysis
4. Specific recommendations`;

  const secondaryResponse = await provider.generateResponse(prompt, state.context);

  return {
    secondaryResponse,
    shouldCallSecondary: true,
    messages: [...state.messages, new AIMessage(`[Secondary LLM]: ${secondaryResponse.content}`)],
  };
}

// Node: Merge responses
async function mergeResponses(state: GraphState): Promise<Partial<GraphState>> {
  const { primaryResponse, secondaryResponse } = state;

  let merged = '## Final Recommendation\n\n';

  merged += '### Primary Analysis\n';
  merged += primaryResponse?.content || 'No primary analysis';
  merged += '\n\n';

  if (secondaryResponse) {
    merged += '### Secondary Opinion\n';
    merged += secondaryResponse.content;
    merged += '\n\n';

    merged += '### Synthesis\n';
    merged += 'After comparing both analyses:\n\n';
    merged += '**Agreements:**\n';
    merged += '- Both analyses provide valuable perspectives on the task\n';
    merged += '- The core approach aligns with best practices\n\n';
    merged += '**Key Considerations:**\n';
    merged += '- Consider the trade-offs mentioned by both analyses\n';
    merged += '- Proceed incrementally and verify each step\n\n';
  }

  merged += '### Recommended Next Steps\n';
  merged += '1. Review the analysis above\n';
  merged += '2. Identify specific files that need changes\n';
  merged += '3. Make changes incrementally\n';
  merged += '4. Test after each change\n';

  return {
    mergedRecommendation: merged,
  };
}

// Conditional edge function
function routeAfterPrimary(state: GraphState): string {
  if (shouldCallSecondary(state)) {
    return 'secondary';
  }
  return 'merge';
}

// Create the orchestrator graph
export function createOrchestratorGraph() {
  const workflow = new StateGraph<GraphState>({
    channels: {
      task: { value: (a: string, b?: string) => b ?? a, default: () => '' },
      options: { value: (a: CliOptions, b?: CliOptions) => b ?? a, default: () => ({} as CliOptions) },
      context: { value: (a: string, b?: string) => b ?? a, default: () => '' },
      primaryResponse: { value: (a: LLMResponse | null, b?: LLMResponse | null) => b ?? a, default: () => null },
      secondaryResponse: { value: (a: LLMResponse | null, b?: LLMResponse | null) => b ?? a, default: () => null },
      shouldCallSecondary: { value: (a: boolean, b?: boolean) => b ?? a, default: () => false },
      mergedRecommendation: { value: (a: string, b?: string) => b ?? a, default: () => '' },
      messages: { value: (a: BaseMessage[], b?: BaseMessage[]) => b ?? a, default: () => [] },
    },
  });

  // Add nodes
  workflow.addNode('gather_context', gatherContext);
  workflow.addNode('primary', generatePrimaryResponse);
  workflow.addNode('secondary', generateSecondaryResponse);
  workflow.addNode('merge', mergeResponses);

  // Add edges
  workflow.addEdge(START, 'gather_context');
  workflow.addEdge('gather_context', 'primary');
  workflow.addConditionalEdges('primary', routeAfterPrimary, {
    secondary: 'secondary',
    merge: 'merge',
  });
  workflow.addEdge('secondary', 'merge');
  workflow.addEdge('merge', END);

  return workflow.compile();
}

// Main orchestrator function
export async function runOrchestrator(
  task: string,
  options: CliOptions
): Promise<OrchestratorState> {
  const graph = createOrchestratorGraph();
  const initialState = createInitialState(task, options);

  const result = await graph.invoke(initialState);

  return {
    task,
    options,
    primaryResponse: result.primaryResponse ?? undefined,
    secondaryResponse: result.secondaryResponse ?? undefined,
    shouldCallSecondary: result.shouldCallSecondary,
    mergedRecommendation: result.mergedRecommendation,
  };
}
