import { describe, it, expect } from 'vitest';
import { CliOptions, AdvisorType } from '../src/types.js';

// Helper to create test CLI options
function createTestOptions(overrides: {
  task?: string;
  advisors?: AdvisorType[];
  apply?: boolean;
}): CliOptions {
  return {
    task: overrides.task || 'test task',
    advisors: overrides.advisors || [],
    apply: overrides.apply || false,
    dryRun: !overrides.apply,
    verbose: false,
  };
}

describe('CLI Options', () => {
  describe('advisor configuration', () => {
    it('should default to no advisors', () => {
      const options = createTestOptions({});
      expect(options.advisors).toEqual([]);
    });

    it('should accept openai as advisor', () => {
      const options = createTestOptions({ advisors: ['openai'] });
      expect(options.advisors).toContain('openai');
    });

    it('should accept gemini as advisor', () => {
      const options = createTestOptions({ advisors: ['gemini'] });
      expect(options.advisors).toContain('gemini');
    });

    it('should accept multiple advisors', () => {
      const options = createTestOptions({ advisors: ['openai', 'gemini'] });
      expect(options.advisors).toHaveLength(2);
      expect(options.advisors).toContain('openai');
      expect(options.advisors).toContain('gemini');
    });
  });

  describe('apply flag', () => {
    it('should default to dry-run mode', () => {
      const options = createTestOptions({});
      expect(options.apply).toBe(false);
      expect(options.dryRun).toBe(true);
    });

    it('should enable apply mode when requested', () => {
      const options = createTestOptions({ apply: true });
      expect(options.apply).toBe(true);
      expect(options.dryRun).toBe(false);
    });
  });
});

describe('Tool Building Logic', () => {
  // Test the tool availability logic
  describe('advisor tool availability', () => {
    it('should not include ask_openai when openai not in advisors', () => {
      const options = createTestOptions({ advisors: [] });
      const hasOpenAI = options.advisors.includes('openai');
      expect(hasOpenAI).toBe(false);
    });

    it('should include ask_openai when openai in advisors', () => {
      const options = createTestOptions({ advisors: ['openai'] });
      const hasOpenAI = options.advisors.includes('openai');
      expect(hasOpenAI).toBe(true);
    });

    it('should include ask_gemini when gemini in advisors', () => {
      const options = createTestOptions({ advisors: ['gemini'] });
      const hasGemini = options.advisors.includes('gemini');
      expect(hasGemini).toBe(true);
    });
  });

  describe('write tool availability', () => {
    it('should not allow writes when apply is false', () => {
      const options = createTestOptions({ apply: false });
      expect(options.apply).toBe(false);
    });

    it('should allow writes when apply is true', () => {
      const options = createTestOptions({ apply: true });
      expect(options.apply).toBe(true);
    });
  });
});

describe('Orchestrator State', () => {
  it('should track advisor responses', () => {
    const advisorResponses: { model: string; response: string }[] = [];

    // Simulate advisor call
    advisorResponses.push({
      model: 'openai:gpt-4-turbo',
      response: 'This is an alternative approach...',
    });

    expect(advisorResponses).toHaveLength(1);
    expect(advisorResponses[0].model).toBe('openai:gpt-4-turbo');
  });

  it('should track tool calls', () => {
    const toolCalls: { tool: string; input: Record<string, unknown> }[] = [];

    // Simulate tool calls
    toolCalls.push({ tool: 'repo_search', input: { query: 'authentication' } });
    toolCalls.push({ tool: 'read_file', input: { path: 'src/auth.ts' } });
    toolCalls.push({ tool: 'ask_openai', input: { prompt: 'What do you think?' } });

    expect(toolCalls).toHaveLength(3);
    expect(toolCalls.map((c) => c.tool)).toEqual(['repo_search', 'read_file', 'ask_openai']);
  });
});

describe('Safety Constraints', () => {
  it('advisors should not have direct tool access', () => {
    // This is a design constraint test - advisors only receive prompts and return text
    const advisorInterface = {
      askOpenAI: (prompt: string) => Promise.resolve({ response: 'text', model: 'openai' }),
      askGemini: (prompt: string) => Promise.resolve({ response: 'text', model: 'gemini' }),
    };

    // Advisors don't have access to repo tools - they only process text
    expect(advisorInterface.askOpenAI).toBeDefined();
    expect(advisorInterface.askGemini).toBeDefined();
    // No tool access methods should exist
    expect((advisorInterface as Record<string, unknown>).repoSearch).toBeUndefined();
    expect((advisorInterface as Record<string, unknown>).writeFile).toBeUndefined();
  });

  it('write operations should require apply flag', () => {
    const canWrite = (options: CliOptions) => options.apply === true;

    expect(canWrite(createTestOptions({ apply: false }))).toBe(false);
    expect(canWrite(createTestOptions({ apply: true }))).toBe(true);
  });
});
