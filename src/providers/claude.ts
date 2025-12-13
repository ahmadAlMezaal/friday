import Anthropic from '@anthropic-ai/sdk';
import { LLMProvider, LLMResponse, AgentTool, ToolResult } from '../types.js';

export interface ClaudeAgentOptions {
  apiKey: string;
  model?: string;
  maxTokens?: number;
  tools?: AgentTool[];
  onToolCall?: (name: string, input: Record<string, unknown>) => Promise<ToolResult>;
}

export class ClaudeProvider implements LLMProvider {
  name = 'claude';
  private client: Anthropic;
  private model: string;
  private maxTokens: number;
  private tools: AgentTool[];
  private onToolCall?: (name: string, input: Record<string, unknown>) => Promise<ToolResult>;

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

    // Agentic loop: handle tool calls
    while (response.stop_reason === 'tool_use') {
      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
      );

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const toolUse of toolUseBlocks) {
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
    }

    // Extract final text response
    const textBlocks = response.content.filter(
      (block): block is Anthropic.TextBlock => block.type === 'text'
    );
    const content = textBlocks.map((b) => b.text).join('\n');

    return {
      content,
      model: `claude:${this.model}`,
      confidence: 0.95,
    };
  }

  private buildSystemPrompt(): string {
    return `You are the primary engineering agent in a development assistant tool.

## Your Role
- You are the single reasoning brain responsible for analyzing tasks and producing solutions
- You have access to repository tools (search, read files, git diff) and advisor tools (ask other LLMs)
- You make all final decisions about what to recommend or implement

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
- When proposing code changes, show unified diffs
- Explain your reasoning
- If you consulted advisors, summarize what you learned from them
- Always produce a single, coherent final answer

## Safety
- Only propose file changes when explicitly asked to implement something
- Never execute destructive commands
- Validate all inputs before acting`;
  }
}
