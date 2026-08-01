import { describe, expect, it } from 'vitest';
import { deserializeConditionalStylingState } from './deserializeMigration';

describe('deserializeConditionalStylingState', () => {
  it('returns empty rules for non-object input', () => {
    expect(deserializeConditionalStylingState(null)).toEqual({ rules: [] });
  });

  it('migrates legacy flashDuration + fadeDuration to durationMs', () => {
    const result = deserializeConditionalStylingState({
      rules: [{
        id: 'r1',
        name: 'Legacy',
        enabled: true,
        priority: 0,
        scope: { type: 'cell' },
        expression: 'true',
        style: { light: {}, dark: {} },
        flash: { enabled: true, target: 'cells', flashDuration: 400, fadeDuration: 600 },
      }],
    });
    expect(result.rules[0]?.flash?.durationMs).toBe(1000);
  });

  it('clamps invalid flash target for row scope', () => {
    const result = deserializeConditionalStylingState({
      rules: [{
        id: 'r1',
        name: 'Row',
        enabled: true,
        priority: 0,
        scope: { type: 'row' },
        expression: 'true',
        style: { light: {}, dark: {} },
        flash: { enabled: true, target: 'cells', mode: 'pulse', color: 'sky' },
      }],
    });
    expect(result.rules[0]?.flash?.target).toBe('row');
  });

  it('drops indicator without icon', () => {
    const result = deserializeConditionalStylingState({
      rules: [{
        id: 'r1',
        name: 'No icon',
        enabled: true,
        priority: 0,
        scope: { type: 'cell' },
        expression: 'true',
        style: { light: {}, dark: {} },
        indicator: { icon: '', target: 'cells', position: 'top-right' },
      }],
    });
    expect(result.rules[0]?.indicator).toBeUndefined();
  });

  it('drops invalid valueFormatter kind', () => {
    const result = deserializeConditionalStylingState({
      rules: [{
        id: 'r1',
        name: 'Bad formatter',
        enabled: true,
        priority: 0,
        scope: { type: 'cell' },
        expression: 'true',
        style: { light: {}, dark: {} },
        valueFormatter: { kind: 'unknown' },
      }],
    });
    expect(result.rules[0]?.valueFormatter).toBeUndefined();
  });

  it('preserves explicit durationMs and valid formatter kinds', () => {
    const result = deserializeConditionalStylingState({
      rules: [{
        id: 'r1',
        name: 'Ok',
        enabled: true,
        priority: 0,
        scope: { type: 'cell' },
        expression: 'true',
        style: { light: {}, dark: {} },
        flash: { enabled: true, target: 'headers', durationMs: 800, mode: 'pulse', color: 'sky' },
        valueFormatter: { kind: 'preset' },
        activeDurationMs: 1500,
      }],
    });
    expect(result.rules[0]?.flash?.durationMs).toBe(800);
    expect(result.rules[0]?.flash?.target).toBe('headers');
    expect(result.rules[0]?.valueFormatter).toEqual({ kind: 'preset' });
    expect(result.rules[0]?.activeDurationMs).toBe(1500);
  });

  it('normalizes indicator target, position, and color', () => {
    const result = deserializeConditionalStylingState({
      rules: [{
        id: 'r1',
        name: 'Icon',
        enabled: true,
        priority: 0,
        scope: { type: 'cell' },
        expression: 'true',
        style: { light: {}, dark: {} },
        indicator: {
          icon: 'star',
          color: 'gold',
          target: 'bogus',
          position: 'bogus',
        },
      }],
    });
    expect(result.rules[0]?.indicator).toEqual({
      icon: 'star',
      color: 'gold',
      target: 'cells+headers',
      position: 'top-right',
    });
  });

  it('drops invalid activeDurationMs and non-array rules input', () => {
    expect(deserializeConditionalStylingState({ rules: 'nope' }).rules).toEqual([]);
    const result = deserializeConditionalStylingState({
      rules: [{
        id: 'r1',
        name: 'Timed',
        enabled: true,
        priority: 0,
        scope: { type: 'row' },
        expression: 'true',
        style: { light: {}, dark: {} },
        activeDurationMs: -1,
      }],
    });
    expect(result.rules[0]?.activeDurationMs).toBeUndefined();
  });
});
