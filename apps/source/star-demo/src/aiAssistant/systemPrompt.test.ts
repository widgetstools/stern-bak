import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from './systemPrompt';

describe('buildSystemPrompt', () => {
  it('has no scope block when the panel is not scoped to a blotter', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).not.toContain('You are scoped to one blotter');
  });

  it('names the blotter by configId', () => {
    const prompt = buildSystemPrompt({ gridId: 'grid-test' });
    expect(prompt).toContain('You are scoped to one blotter');
    expect(prompt).toContain('"grid-test"');
  });

  describe('the pinned window', () => {
    /**
     * The prompt tells the model it is "automatically pinned to the specific
     * WINDOW it was opened from". Without naming that window it was an
     * unanswerable claim: asked "which instance is this?", the model called
     * list_grid_instances, got 38 rows, and picked the most recently updated
     * one by guess — which was a different window from the one the user was
     * looking at.
     */
    it('names the row every read and write lands on', () => {
      const prompt = buildSystemPrompt({
        gridId: 'grid-test',
        instanceId: 'dev1grid-test-1788629078186',
      });
      expect(prompt).toContain('"dev1grid-test-1788629078186"');
    });

    it('tells the model to answer from it rather than guess from the list', () => {
      const prompt = buildSystemPrompt({ gridId: 'grid-test', instanceId: 'inst-1' });
      expect(prompt).toMatch(/do NOT call list_grid_instances and guess/i);
    });

    it('says nothing about a pinned window when there is none', () => {
      const prompt = buildSystemPrompt({ gridId: 'grid-test' });
      expect(prompt).not.toMatch(/that window's configId is/i);
    });
  });

  it('still forbids using a display name as an identifier', () => {
    const prompt = buildSystemPrompt({ gridId: 'grid-test', displayName: 'TestGrid' });
    expect(prompt).toMatch(/NEVER pass a display name as targetGridId/i);
  });
});
