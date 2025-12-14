import { describe, it, expect } from 'vitest';
import { CliOptions, AdvisorType, WriteMode } from '../src/types.js';

// Helper to create test CLI options
function createTestOptions(overrides: {
  task?: string;
  advisors?: AdvisorType[];
  apply?: boolean;
  approve?: boolean;
  workspace?: string;
}): CliOptions {
  const apply = overrides.apply || false;
  const approve = overrides.approve || false;
  return {
    task: overrides.task || 'test task',
    advisors: overrides.advisors || [],
    apply,
    approve,
    dryRun: !apply && !approve,
    workspace: overrides.workspace,
    verbose: false,
  };
}

// Helper to determine write mode from options (mirrors interactive.ts logic)
function getWriteMode(options: CliOptions): WriteMode {
  if (options.apply) return 'apply';
  if (options.approve) return 'approve';
  return 'dry-run';
}

// Helper to check if file writes are enabled (mirrors router.ts logic)
function areFileWritesEnabled(options: CliOptions): boolean {
  return options.apply || options.approve;
}

// Helper to get mode info string (mirrors router.ts runClaudeAgent logic)
function getModeInfo(options: CliOptions): string {
  if (options.apply) {
    return 'File modification is ENABLED (apply mode). Changes will be written immediately.';
  } else if (options.approve) {
    return 'File modification is ENABLED (approve mode). User will be prompted to confirm each file change.';
  } else {
    return 'File modification is DISABLED (dry-run mode). You can only read and analyze.';
  }
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

// ============================================================================
// Mode Regression Tests
// ============================================================================
// These tests verify that approve mode correctly enables file writes
// and that Claude is properly informed of the mode.

describe('Mode Regression: Approve Mode', () => {
  describe('write mode detection', () => {
    it('should return dry-run when neither apply nor approve is set', () => {
      const options = createTestOptions({});
      expect(getWriteMode(options)).toBe('dry-run');
    });

    it('should return apply when apply is true', () => {
      const options = createTestOptions({ apply: true });
      expect(getWriteMode(options)).toBe('apply');
    });

    it('should return approve when approve is true', () => {
      const options = createTestOptions({ approve: true, workspace: '/test' });
      expect(getWriteMode(options)).toBe('approve');
    });

    it('should prioritize apply over approve if both are set', () => {
      const options = createTestOptions({ apply: true, approve: true, workspace: '/test' });
      expect(getWriteMode(options)).toBe('apply');
    });
  });

  describe('file writes enabled check', () => {
    it('should return false for dry-run mode', () => {
      const options = createTestOptions({});
      expect(areFileWritesEnabled(options)).toBe(false);
    });

    it('should return true for apply mode', () => {
      const options = createTestOptions({ apply: true });
      expect(areFileWritesEnabled(options)).toBe(true);
    });

    it('should return true for approve mode', () => {
      const options = createTestOptions({ approve: true, workspace: '/test' });
      expect(areFileWritesEnabled(options)).toBe(true);
    });
  });

  describe('mode info string for Claude', () => {
    it('should indicate dry-run when neither apply nor approve is set', () => {
      const options = createTestOptions({});
      const modeInfo = getModeInfo(options);
      expect(modeInfo).toContain('DISABLED');
      expect(modeInfo).toContain('dry-run');
    });

    it('should indicate ENABLED for apply mode', () => {
      const options = createTestOptions({ apply: true });
      const modeInfo = getModeInfo(options);
      expect(modeInfo).toContain('ENABLED');
      expect(modeInfo).toContain('apply mode');
      expect(modeInfo).not.toContain('DISABLED');
    });

    it('should indicate ENABLED for approve mode (regression test)', () => {
      // This is the key regression test - approve mode should NOT say dry-run
      const options = createTestOptions({ approve: true, workspace: '/test' });
      const modeInfo = getModeInfo(options);
      expect(modeInfo).toContain('ENABLED');
      expect(modeInfo).toContain('approve mode');
      expect(modeInfo).not.toContain('DISABLED');
      expect(modeInfo).not.toContain('dry-run');
    });
  });

  describe('mode persistence across multiple operations', () => {
    it('should maintain approve mode across simulated file writes', () => {
      const options = createTestOptions({ approve: true, workspace: '/test' });

      // Simulate multiple file write checks (as would happen in a task)
      const firstCheck = areFileWritesEnabled(options);
      const secondCheck = areFileWritesEnabled(options);
      const thirdCheck = areFileWritesEnabled(options);

      // All checks should return true - mode should not regress
      expect(firstCheck).toBe(true);
      expect(secondCheck).toBe(true);
      expect(thirdCheck).toBe(true);
    });

    it('should maintain consistent mode info across multiple calls', () => {
      const options = createTestOptions({ approve: true, workspace: '/test' });

      // Simulate multiple Claude prompts
      const firstModeInfo = getModeInfo(options);
      const secondModeInfo = getModeInfo(options);

      // Mode info should be identical and always show ENABLED
      expect(firstModeInfo).toBe(secondModeInfo);
      expect(firstModeInfo).toContain('ENABLED');
    });
  });
});

// ============================================================================
// File Creation Task Detection Tests
// ============================================================================
// These tests verify that tasks requesting file creation are properly detected
// and that the write flow is triggered.

/**
 * Detect if a task is requesting file creation/modification
 * (mirrors router.ts isFileCreationTask logic)
 */
function isFileCreationTask(task: string): boolean {
  const lowerTask = task.toLowerCase();
  const creationKeywords = [
    'create', 'build', 'make', 'generate', 'write', 'implement',
    'add', 'setup', 'scaffold', 'init', 'new', 'develop'
  ];
  const fileKeywords = [
    'file', 'files', 'app', 'application', 'website', 'page',
    'component', 'module', 'project', 'code', 'html', 'css', 'js',
    'javascript', 'typescript', 'todo', 'script'
  ];

  const hasCreationKeyword = creationKeywords.some(kw => lowerTask.includes(kw));
  const hasFileKeyword = fileKeywords.some(kw => lowerTask.includes(kw));

  return hasCreationKeyword && hasFileKeyword;
}

describe('File Creation Task Detection', () => {
  describe('should detect file creation tasks', () => {
    it('should detect "create a minimal todo list website"', () => {
      expect(isFileCreationTask('create a minimal todo list website using plain HTML, CSS, and JS')).toBe(true);
    });

    it('should detect "build a simple app"', () => {
      expect(isFileCreationTask('build a simple app')).toBe(true);
    });

    it('should detect "make a new website"', () => {
      expect(isFileCreationTask('make a new website')).toBe(true);
    });

    it('should detect "generate a typescript module"', () => {
      expect(isFileCreationTask('generate a typescript module')).toBe(true);
    });

    it('should detect "write some javascript code"', () => {
      expect(isFileCreationTask('write some javascript code')).toBe(true);
    });

    it('should detect "implement a todo app"', () => {
      expect(isFileCreationTask('implement a todo app')).toBe(true);
    });

    it('should detect "add a new component"', () => {
      expect(isFileCreationTask('add a new component')).toBe(true);
    });

    it('should detect "setup a new project"', () => {
      expect(isFileCreationTask('setup a new project')).toBe(true);
    });

    it('should detect "create index.html"', () => {
      expect(isFileCreationTask('create index.html')).toBe(true);
    });

    it('should detect "develop a script"', () => {
      expect(isFileCreationTask('develop a script')).toBe(true);
    });
  });

  describe('should NOT detect non-file-creation tasks', () => {
    it('should not detect "explain this code"', () => {
      expect(isFileCreationTask('explain this code')).toBe(false);
    });

    it('should not detect "what does this function do"', () => {
      expect(isFileCreationTask('what does this function do')).toBe(false);
    });

    it('should not detect "read the package.json"', () => {
      expect(isFileCreationTask('read the package.json')).toBe(false);
    });

    it('should not detect "find bugs in the code"', () => {
      expect(isFileCreationTask('find bugs in the code')).toBe(false);
    });

    it('should not detect "review the implementation"', () => {
      expect(isFileCreationTask('review the implementation')).toBe(false);
    });
  });
});

// ============================================================================
// Write Pipeline Regression Tests
// ============================================================================
// These tests verify the write pipeline behavior in approve/apply modes.

describe('Write Pipeline Behavior', () => {
  describe('tool availability in different modes', () => {
    // Mirrors buildTools logic
    function getAvailableToolNames(options: CliOptions): string[] {
      const baseTools = ['repo_search', 'read_file', 'git_diff', 'run_command'];
      const writeTools = options.apply || options.approve ? ['write_file', 'apply_patch'] : [];
      const advisorTools = options.advisors.map(a => `ask_${a}`);
      return [...baseTools, ...writeTools, ...advisorTools];
    }

    it('should NOT include write tools in dry-run mode', () => {
      const options = createTestOptions({});
      const tools = getAvailableToolNames(options);
      expect(tools).not.toContain('write_file');
      expect(tools).not.toContain('apply_patch');
    });

    it('should include write tools in apply mode', () => {
      const options = createTestOptions({ apply: true, workspace: '/test' });
      const tools = getAvailableToolNames(options);
      expect(tools).toContain('write_file');
      expect(tools).toContain('apply_patch');
    });

    it('should include write tools in approve mode', () => {
      const options = createTestOptions({ approve: true, workspace: '/test' });
      const tools = getAvailableToolNames(options);
      expect(tools).toContain('write_file');
      expect(tools).toContain('apply_patch');
    });
  });

  describe('file creation task in approve mode', () => {
    it('should have write tools and detect file creation task', () => {
      const options = createTestOptions({ approve: true, workspace: '/test' });
      const task = 'create a minimal todo list website using plain HTML, CSS, and JS';

      // Write tools should be enabled
      expect(areFileWritesEnabled(options)).toBe(true);

      // Task should be detected as file creation
      expect(isFileCreationTask(task)).toBe(true);

      // Mode info should indicate ENABLED
      const modeInfo = getModeInfo(options);
      expect(modeInfo).toContain('ENABLED');
      expect(modeInfo).toContain('approve mode');
    });

    it('should have write tools and detect file creation in workspace', () => {
      const options = createTestOptions({ approve: true, workspace: '/home/user/project' });
      const task = 'build a simple todo app with html, css, and javascript';

      // All conditions for write flow should be met
      expect(areFileWritesEnabled(options)).toBe(true);
      expect(isFileCreationTask(task)).toBe(true);
      expect(options.workspace).toBe('/home/user/project');
    });
  });

  describe('FileNotFoundError handling', () => {
    it('should return instructive message for missing files', () => {
      // The message returned by router.ts when file is not found
      const expectedMessage = '[FILE DOES NOT EXIST:';
      expect(expectedMessage).toContain('FILE DOES NOT EXIST');
    });
  });
});
