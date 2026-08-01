import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  INITIAL_TOOLBAR_DATE_SETTINGS,
  TOOLBAR_DATE_SETTINGS_MODULE_ID,
} from './state';
import { toolbarDateSettingsModule } from './index';
import { activateRowExclusion } from './activate';
import { __resetRowExclusionCache } from './rowExclusionFilter';

describe('toolbarDateSettingsModule', () => {
  beforeEach(() => {
    __resetRowExclusionCache();
  });

  it('registers with expected metadata', () => {
    expect(toolbarDateSettingsModule.id).toBe(TOOLBAR_DATE_SETTINGS_MODULE_ID);
    expect(toolbarDateSettingsModule.code).toBe('19');
    expect(toolbarDateSettingsModule.SettingsPanel).toBeTruthy();
  });

  it('getInitialState returns toolbar date defaults', () => {
    expect(toolbarDateSettingsModule.getInitialState()).toEqual(INITIAL_TOOLBAR_DATE_SETTINGS);
  });

  it('deserialize merges partial state', () => {
    const state = toolbarDateSettingsModule.deserialize!({
      rowExclusionExpression: '[status] != "closed"',
    });
    expect(state.rowExclusionExpression).toBe('[status] != "closed"');
  });

  it('migrate returns defaults for malformed payload', () => {
    expect(toolbarDateSettingsModule.migrate!(null)).toEqual(INITIAL_TOOLBAR_DATE_SETTINGS);
  });

  it('transformGridOptions adds external filter callbacks', () => {
    const out = toolbarDateSettingsModule.transformGridOptions!({}, INITIAL_TOOLBAR_DATE_SETTINGS, {
      getModuleState: () => INITIAL_TOOLBAR_DATE_SETTINGS,
      resources: { expression: () => ({ validate: () => ({ valid: true, errors: [] }) }) },
    } as never);
    expect(typeof out.isExternalFilterPresent).toBe('function');
    expect(typeof out.doesExternalFilterPass).toBe('function');
  });

  it('external filter passes all rows when expression is blank', () => {
    const out = toolbarDateSettingsModule.transformGridOptions!({}, INITIAL_TOOLBAR_DATE_SETTINGS, {
      getModuleState: () => INITIAL_TOOLBAR_DATE_SETTINGS,
      resources: { expression: () => ({ validate: () => ({ valid: true, errors: [] }) }) },
    } as never);
    expect(out.isExternalFilterPresent!()).toBe(false);
    expect(out.doesExternalFilterPass!({ data: { ccy: 'USD' } } as never)).toBe(true);
  });

  it('external filter evaluates row exclusion expression', () => {
    const state = {
      ...INITIAL_TOOLBAR_DATE_SETTINGS,
      rowExclusionExpression: '[ccy] == "INR"',
    };
    const node = { type: 'literal' as const, value: true };
    const parse = vi.fn(() => node);
    const evaluate = vi.fn(() => true);
    const out = toolbarDateSettingsModule.transformGridOptions!({}, state, {
      getModuleState: () => state,
      resources: {
        expression: () => ({
          validate: () => ({ valid: true, errors: [] }),
          parse,
          evaluate,
        }),
      },
    } as never);
    expect(out.isExternalFilterPresent!()).toBe(true);
    expect(out.doesExternalFilterPass!({ data: { ccy: 'INR' } } as never)).toBe(false);
    expect(parse).toHaveBeenCalledWith('[ccy] == "INR"');
    expect(evaluate).toHaveBeenCalledWith(node, expect.objectContaining({ data: { ccy: 'INR' } }));
  });

  it('serialize round-trips and migrate preserves partial payloads', () => {
    const partial = { rowExclusionExpression: '[x] > 1' };
    expect(toolbarDateSettingsModule.serialize!({
      ...INITIAL_TOOLBAR_DATE_SETTINGS,
      ...partial,
    })).toMatchObject(partial);
    expect(toolbarDateSettingsModule.migrate!(partial)).toMatchObject(partial);
    expect(toolbarDateSettingsModule.activate).toBeTruthy();
  });

  it('cellValueChanged does not refilter when expression cleared', () => {
    const onFilterChanged = vi.fn();
    let state = { ...INITIAL_TOOLBAR_DATE_SETTINGS, rowExclusionExpression: '[ccy] == "INR"' };
    let cellHandler: (() => void) | null = null;
    const platform = {
      getState: () => state,
      subscribe: () => () => {},
      api: {
        on: (evt: string, fn: () => void) => {
          if (evt === 'cellValueChanged') cellHandler = fn;
          return () => {};
        },
        onReady: () => () => {},
        use: (fn: (api: { onFilterChanged: typeof onFilterChanged }) => void) => {
          fn({ onFilterChanged });
        },
      },
    };
    const dispose = activateRowExclusion(platform as never);
    state = { ...state, rowExclusionExpression: '   ' };
    cellHandler?.();
    expect(onFilterChanged).toHaveBeenCalledTimes(0);
    dispose();
  });
});
