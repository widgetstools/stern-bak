import { describe, expect, it } from 'vitest';
import {
  INITIAL_VISUAL_EXCEL,
  VISUAL_EXCEL_MODULE_ID,
} from '@wellsfargo-starui/engine';
import { visualExcelModule } from './index';

describe('visualExcelModule', () => {
  it('registers with expected metadata', () => {
    expect(visualExcelModule.id).toBe(VISUAL_EXCEL_MODULE_ID);
    expect(visualExcelModule.code).toBe('11');
    expect(visualExcelModule.SettingsPanel).toBeTruthy();
  });

  it('getInitialState returns a clone', () => {
    const state = visualExcelModule.getInitialState();
    expect(state).toEqual(INITIAL_VISUAL_EXCEL);
    expect(state).not.toBe(INITIAL_VISUAL_EXCEL);
  });

  it('transformColumnDefs is no-op when disabled', () => {
    const defs = [{ field: 'qty' }];
    const disabled = { ...INITIAL_VISUAL_EXCEL, settings: { ...INITIAL_VISUAL_EXCEL.settings, enabled: false } };
    const out = visualExcelModule.transformColumnDefs!(defs, disabled, {
      getModuleState: () => ({ assignments: {} }),
    } as never);
    expect(out).toEqual(defs);
  });

  it('transformGridOptions is no-op when disabled', () => {
    const opts = { rowData: [] };
    const disabled = { ...INITIAL_VISUAL_EXCEL, settings: { ...INITIAL_VISUAL_EXCEL.settings, enabled: false } };
    const out = visualExcelModule.transformGridOptions!(opts, disabled, {
      getModuleState: () => ({ rules: [], assignments: {} }),
    } as never);
    expect(out).toEqual(opts);
  });
});
