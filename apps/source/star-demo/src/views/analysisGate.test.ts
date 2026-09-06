import { describe, expect, it } from 'vitest';
import { hasNothingToShow } from './analysisGate';

/**
 * The bug this pins, exactly.
 *
 * The gate tested only for a HANDOFF. A saved dashboard opened from the dock
 * carries `?dashboard=` and no handoff, so every one of them rendered "Nothing
 * to show. Open this window from an analysis result…" — regardless of the spec
 * and rows having both loaded. Asking the assistant to regenerate the
 * dashboard appeared to fix it, because a freshly generated report DOES arrive
 * with a handoff.
 *
 * Every previous test asserted the shape of what was WRITTEN — the spec is
 * stored, the registry entry exists, the dock button appears. None asked
 * whether the window would draw it.
 */
const SPEC = { title: 'D', blocks: [] };

describe('what the analysis window has to show', () => {
  it('shows a saved dashboard — the case that was broken', () => {
    expect(hasNothingToShow({ dashboardId: 'dashboard-trader', spec: SPEC })).toBe(false);
  });

  it('shows a report opened from a handoff', () => {
    expect(hasNothingToShow({ handoffId: 'h1', spec: SPEC })).toBe(false);
  });

  it('has nothing when the window was opened with neither', () => {
    expect(hasNothingToShow({ spec: null })).toBe(true);
  });

  /** Addressed but still resolving is not the same as "nothing to show" —
   *  though both render the same way today, so this pins the distinction. */
  it('has nothing YET while a dashboard is still loading', () => {
    expect(hasNothingToShow({ dashboardId: 'dashboard-trader', spec: null })).toBe(true);
  });

  it('defers to the error path once loading has failed', () => {
    expect(hasNothingToShow({ dashboardId: 'gone', spec: null, error: 'No saved dashboard' })).toBe(false);
  });

  it('shows the report when rows failed but a spec arrived', () => {
    expect(hasNothingToShow({ handoffId: 'h1', spec: SPEC, error: 'feed unreachable' })).toBe(false);
  });
});
