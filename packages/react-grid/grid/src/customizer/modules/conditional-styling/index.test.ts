import { describe, expect, it, vi } from 'vitest';
import { INITIAL_CONDITIONAL_STYLING } from './state';
import { conditionalStylingModule, CONDITIONAL_STYLING_MODULE_ID } from './index';

describe('conditionalStylingModule', () => {
  it('registers with expected metadata', () => {
    expect(conditionalStylingModule.id).toBe(CONDITIONAL_STYLING_MODULE_ID);
    expect(conditionalStylingModule.code).toBe('01');
    expect(conditionalStylingModule.ListPane).toBeTruthy();
  });

  it('getInitialState starts with empty rules', () => {
    expect(conditionalStylingModule.getInitialState().rules).toEqual([]);
  });

  it('transformColumnDefs is no-op without enabled cell rules', () => {
    const defs = [{ field: 'qty' }];
    const out = conditionalStylingModule.transformColumnDefs!(defs, { rules: [] }, {
      resources: {
        css: () => ({ clear: vi.fn(), addRule: vi.fn() }),
        cache: () => new WeakMap(),
        expression: () => ({ parse: vi.fn(), validate: () => ({ valid: true, errors: [] }) }),
      },
    } as never);
    expect(out).toBe(defs);
  });

  it('transformGridOptions emits rowClassRules for row-scoped rules', () => {
    const state = {
      rules: [{
        id: 'row-rule',
        name: 'Highlight row',
        enabled: true,
        priority: 0,
        scope: { type: 'row' as const },
        expression: 'true',
        style: { light: {}, dark: {} },
      }],
    };
    const out = conditionalStylingModule.transformGridOptions!({}, state, {
      resources: {
        cache: () => new WeakMap(),
        expression: () => ({
          parse: () => ({}),
          validate: () => ({ valid: true, errors: [] }),
          compile: () => () => true,
        }),
      },
    } as never);
    expect(Object.keys(out.rowClassRules ?? {})).toContain('ds-rule-row-rule');
  });

  it('deserialize delegates to migration helper', () => {
    const raw = { rules: [] };
    expect(conditionalStylingModule.deserialize!(raw)).toEqual({ rules: [] });
  });

  it('transformColumnDefs applies enabled cell-scoped rules', () => {
    const css = { clear: vi.fn(), addRule: vi.fn(), removeRule: vi.fn() };
    const defs = [{ field: 'price', colId: 'price' }];
    const state = {
      rules: [{
        id: 'cell-rule',
        name: 'Hot',
        enabled: true,
        priority: 0,
        scope: { type: 'cell' as const, columns: ['price'] },
        expression: '[price] > 0',
        style: { light: {}, dark: {} },
      }],
    };
    const out = conditionalStylingModule.transformColumnDefs!(defs, state, {
      resources: {
        css: () => css,
        cache: () => new WeakMap(),
        expression: () => ({
          parse: () => ({}),
          validate: () => ({ valid: true, errors: [] }),
          compile: () => () => true,
        }),
      },
    } as never);
    expect(out).not.toBe(defs);
    expect(css.clear).toHaveBeenCalled();
  });

  it('migrate is not defined — deserialize handles legacy payloads', () => {
    expect(conditionalStylingModule.migrate).toBeUndefined();
  });

  it('getInitialState returns empty rules and activate is wired', () => {
    expect(conditionalStylingModule.getInitialState().rules).toEqual([]);
    expect(conditionalStylingModule.activate).toBeTruthy();
    expect(conditionalStylingModule.EditorPane).toBeTruthy();
  });

  it('serialize round-trips state unchanged', () => {
    const state = {
      rules: [{
        id: 'r1',
        name: 'Rule',
        enabled: true,
        priority: 1,
        scope: { type: 'row' as const },
        expression: 'true',
        style: { light: {}, dark: {} },
      }],
    };
    expect(conditionalStylingModule.serialize!(state)).toBe(state);
  });
});
