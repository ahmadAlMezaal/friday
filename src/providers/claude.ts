import Anthropic from '@anthropic-ai/sdk';
import { LLMProvider, LLMResponse, AgentTool, ToolResult, TokenUsage } from '../types.js';

export interface ClaudeAgentOptions {
  apiKey: string;
  model?: string;
  maxTokens?: number;
  tools?: AgentTool[];
  onToolCall?: (name: string, input: Record<string, unknown>) => Promise<ToolResult>;
  maxToolCalls?: number;
  maxTurns?: number;
}

export class ClaudeProvider implements LLMProvider {
  name = 'claude';
  private client: Anthropic;
  private model: string;
  private maxTokens: number;
  private tools: AgentTool[];
  private onToolCall?: (name: string, input: Record<string, unknown>) => Promise<ToolResult>;
  private maxToolCalls: number;
  private maxTurns: number;

  constructor(options: ClaudeAgentOptions) {
    if (!options.apiKey) {
      throw new Error(
        'Anthropic API key is required.\n' +
          'Please set ANTHROPIC_API_KEY environment variable.'
      );
    }

    this.client = new Anthropic({ apiKey: options.apiKey });
    this.model = options.model || 'claude-sonnet-4-20250514';
    this.maxTokens = options.maxTokens || 4096;
    this.tools = options.tools || [];
    this.onToolCall = options.onToolCall;
    this.maxToolCalls = options.maxToolCalls ?? 20;
    this.maxTurns = options.maxTurns ?? 10;
  }

  async generateResponse(prompt: string, context?: string): Promise<LLMResponse> {
    const systemPrompt = this.buildSystemPrompt();
    const userMessage = context ? `Context:\n${context}\n\nTask:\n${prompt}` : prompt;

    // Convert tools to Anthropic format
    const anthropicTools: Anthropic.Tool[] = this.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema as Anthropic.Tool['input_schema'],
    }));

    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: userMessage },
    ];

    let response = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      system: systemPrompt,
      tools: anthropicTools.length > 0 ? anthropicTools : undefined,
      messages,
    });

    // Track cumulative token usage across all API calls
    let totalInputTokens = response.usage?.input_tokens || 0;
    let totalOutputTokens = response.usage?.output_tokens || 0;

    // Agentic loop: handle tool calls with budget guards
    let turnCount = 0;
    let toolCallCount = 0;

    while (response.stop_reason === 'tool_use') {
      turnCount++;

      // Check turn limit
      if (turnCount > this.maxTurns) {
        const warning = `\n\n[Agent stopped: reached maximum turns (${this.maxTurns}). Use --maxTurns to increase.]`;
        const textBlocks = response.content.filter(
          (block): block is Anthropic.TextBlock => block.type === 'text'
        );
        const partialContent = textBlocks.map((b) => b.text).join('\n');
        return {
          content: partialContent + warning,
          model: `claude:${this.model}`,
          confidence: 0.5,
          usage: {
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
            totalTokens: totalInputTokens + totalOutputTokens,
          },
        };
      }

      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
      );

      // Check tool call limit
      if (toolCallCount + toolUseBlocks.length > this.maxToolCalls) {
        const warning = `\n\n[Agent stopped: reached maximum tool calls (${this.maxToolCalls}). Use --maxToolCalls to increase.]`;
        const textBlocks = response.content.filter(
          (block): block is Anthropic.TextBlock => block.type === 'text'
        );
        const partialContent = textBlocks.map((b) => b.text).join('\n');
        return {
          content: partialContent + warning,
          model: `claude:${this.model}`,
          confidence: 0.5,
          usage: {
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
            totalTokens: totalInputTokens + totalOutputTokens,
          },
        };
      }

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const toolUse of toolUseBlocks) {
        toolCallCount++;

        if (this.onToolCall) {
          const result = await this.onToolCall(
            toolUse.name,
            toolUse.input as Record<string, unknown>
          );
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: result.error
              ? `Error: ${result.error}`
              : (result.content ?? ''),
            is_error: !!result.error,
          });
        } else {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: 'Tool handler not configured',
            is_error: true,
          });
        }
      }

      // Continue conversation with tool results
      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: toolResults });

      response = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        system: systemPrompt,
        tools: anthropicTools.length > 0 ? anthropicTools : undefined,
        messages,
      });

      // Accumulate token usage
      totalInputTokens += response.usage?.input_tokens || 0;
      totalOutputTokens += response.usage?.output_tokens || 0;
    }

    // Extract final text response
    const textBlocks = response.content.filter(
      (block): block is Anthropic.TextBlock => block.type === 'text'
    );
    const content = textBlocks.map((b) => b.text).join('\n');

    const usage: TokenUsage = {
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      totalTokens: totalInputTokens + totalOutputTokens,
    };

    return {
      content,
      model: `claude:${this.model}`,
      confidence: 0.95,
      usage,
    };
  }

  private buildSystemPrompt(): string {
    // Check if write tools are available
    const hasWriteTools = this.tools.some(t => t.name === 'write_file' || t.name === 'apply_patch');

    return `You are the primary engineering agent in a development assistant tool called Friday.

## Your Role
- You are the single reasoning brain responsible for analyzing tasks and producing solutions
- You have access to repository tools (search, read files, git diff) and advisor tools (ask other LLMs)
- You make all final decisions about what to recommend or implement
${hasWriteTools ? '- You have write_file and apply_patch tools available - USE THEM when the task requires creating or modifying files' : ''}

## Execution Workflow - IMPORTANT

You MUST follow this phased workflow when file modifications are requested:

### Phase 1: Planning
- Analyze the task and gather context
- Read relevant files to understand the codebase
- Search for patterns and dependencies
- Consult advisors if needed

### Phase 2: Propose Changes
When you are ready to write files, you MUST:
1. Clearly state: "I am ready to write the following files:"
2. List each file with:
   - File path
   - Action: (create) for new files, (modify) for existing files
   - Brief description of changes

Example:
\`\`\`
I am ready to write the following files:

1. src/utils/validator.ts (create) - New validation utility module
2. src/index.ts (modify) - Add import and use validator
3. tests/validator.test.ts (create) - Unit tests for validator
\`\`\`

### Phase 3: Writing - CRITICAL
${hasWriteTools ? `After stating your proposal, you MUST call write_file or apply_patch for EACH file.
DO NOT just describe what you would create - actually call the write_file tool.
The task is NOT complete until you have called write_file for every file that needs to be created.
If read_file returns "FILE DOES NOT EXIST", you must create it using write_file.` : 'File modification is disabled. Describe the changes without calling write tools.'}

## Advisor Models
You may consult other AI models (OpenAI GPT, Google Gemini) for second opinions when:
- You want an alternative perspective on architecture decisions
- You're uncertain about a specific approach
- The task involves complex trade-offs that benefit from multiple viewpoints
- You want to validate your reasoning

When consulting advisors:
- Be specific about what you're asking
- Critically evaluate their responses
- You are responsible for the final, coherent answer
- Advisors cannot edit files or run commands - only you can

## Output Guidelines
- Provide clear, actionable recommendations
- When proposing code changes, show unified diffs in your explanation
- Explain your reasoning
- If you consulted advisors, summarize what you learned from them
- Always produce a single, coherent final answer
${hasWriteTools ? '- When the task requires creating files, you MUST call write_file - do not just describe what files would be created' : ''}

## Safety
- Only propose file changes when explicitly asked to implement something
- Never execute destructive commands
- Validate all inputs before acting
- All writes are sandboxed to the --workspace directory`;
  }
}
