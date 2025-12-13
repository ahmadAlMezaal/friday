import { describe, it, expect } from 'vitest';
import {
  shouldCallSecondary,
  detectUncertainty,
  detectComplexity,
  detectErrors,
} from '../src/router.js';
import { CliOptions, LLMResponse } from '../src/types.js';

// Helper to create test state
function createTestState(overrides: {
  task?: string;
  when?: 'auto' | 'always' | 'never';
  primaryContent?: string;
  context?: string;
}) {
  const options: CliOptions = {
    task: overrides.task || 'test task',
    modelPrimary: 'claude',
    modelSecondary: 'openai:gpt-4.1',
    when: overrides.when || 'auto',
    apply: false,
    dryRun: true,
  };

  const primaryResponse: LLMResponse | null = overrides.primaryContent
    ? {
        content: overrides.primaryContent,
        model: 'claude',
        confidence: 0.9,
      }
    : null;

  return {
    task: options.task,
    options,
    context: overrides.context || '',
    primaryResponse,
    secondaryResponse: null,
    shouldCallSecondary: false,
    mergedRecommendation: '',
    messages: [],
  };
}

describe('Router Decision Logic', () => {
  describe('shouldCallSecondary', () => {
    it('should return true when when=always', () => {
      const state = createTestState({
        when: 'always',
        primaryContent: 'Clear and confident response',
      });

      expect(shouldCallSecondary(state)).toBe(true);
    });

    it('should return false when when=never', () => {
      const state = createTestState({
        when: 'never',
        primaryContent: 'I am not sure about this',
      });

      expect(shouldCallSecondary(state)).toBe(false);
    });

    it('should return true when primary response has uncertainty (auto mode)', () => {
      const state = createTestState({
        when: 'auto',
        primaryContent: 'I am not sure about the best approach here.',
      });

      expect(shouldCallSecondary(state)).toBe(true);
    });

    it('should return true when task involves refactoring (auto mode)', () => {
      const state = createTestState({
        when: 'auto',
        task: 'refactor the authentication module',
        primaryContent: 'Here is my analysis.',
      });

      expect(shouldCallSecondary(state)).toBe(true);
    });

    it('should return true when task involves architecture decisions (auto mode)', () => {
      const state = createTestState({
        when: 'auto',
        task: 'design the architecture for the new feature',
        primaryContent: 'Here is my analysis.',
      });

      expect(shouldCallSecondary(state)).toBe(true);
    });

    it('should return true when context has errors (auto mode)', () => {
      const state = createTestState({
        when: 'auto',
        primaryContent: 'Here is my analysis.',
        context: 'Test failure: Expected 3 but got 5',
      });

      expect(shouldCallSecondary(state)).toBe(true);
    });

    it('should return false for simple task with confident response (auto mode)', () => {
      const state = createTestState({
        when: 'auto',
        task: 'add a console log',
        primaryContent: 'Here is exactly what you need to do.',
      });

      expect(shouldCallSecondary(state)).toBe(false);
    });
  });

  describe('detectUncertainty', () => {
    it('should detect "not sure"', () => {
      expect(detectUncertainty('I am not sure about this')).toBe(true);
    });

    it('should detect "might be"', () => {
      expect(detectUncertainty('This might be the issue')).toBe(true);
    });

    it('should detect "could be"', () => {
      expect(detectUncertainty('It could be caused by X')).toBe(true);
    });

    it('should detect "unclear"', () => {
      expect(detectUncertainty('The requirements are unclear')).toBe(true);
    });

    it('should detect "uncertain"', () => {
      expect(detectUncertainty('I am uncertain about the approach')).toBe(true);
    });

    it('should detect "probably"', () => {
      expect(detectUncertainty('This is probably the solution')).toBe(true);
    });

    it('should detect "I think"', () => {
      expect(detectUncertainty('I think this should work')).toBe(true);
    });

    it('should return false for confident text', () => {
      expect(detectUncertainty('Here is the solution. Do X then Y.')).toBe(false);
    });

    it('should be case insensitive', () => {
      expect(detectUncertainty('NOT SURE about this')).toBe(true);
    });
  });

  describe('detectComplexity', () => {
    it('should detect refactor tasks', () => {
      expect(detectComplexity('refactor the authentication')).toBe(true);
    });

    it('should detect architecture tasks', () => {
      expect(detectComplexity('design the architecture')).toBe(true);
    });

    it('should detect redesign tasks', () => {
      expect(detectComplexity('redesign the user flow')).toBe(true);
    });

    it('should detect migration tasks', () => {
      expect(detectComplexity('migrate to the new API')).toBe(true);
    });

    it('should detect breaking change mentions', () => {
      expect(detectComplexity('this is a breaking change')).toBe(true);
    });

    it('should return false for simple tasks', () => {
      expect(detectComplexity('add a button')).toBe(false);
    });

    it('should return false for bug fixes', () => {
      expect(detectComplexity('fix the typo in header')).toBe(false);
    });
  });

  describe('detectErrors', () => {
    it('should detect error messages', () => {
      expect(detectErrors('Error: Cannot find module')).toBe(true);
    });

    it('should detect test failures', () => {
      expect(detectErrors('Test failed: expected 1 got 2')).toBe(true);
    });

    it('should detect exceptions', () => {
      expect(detectErrors('Exception thrown in handler')).toBe(true);
    });

    it('should detect broken state', () => {
      expect(detectErrors('The build is broken')).toBe(true);
    });

    it('should return false for clean context', () => {
      expect(detectErrors('All tests passing, build successful')).toBe(false);
    });

    it('should be case insensitive', () => {
      expect(detectErrors('ERROR in compilation')).toBe(true);
    });
  });
});
