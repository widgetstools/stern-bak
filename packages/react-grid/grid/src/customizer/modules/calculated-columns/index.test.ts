import { describe, expect, it } from 'vitest';
import {
  INITIAL_CALCULATED_COLUMNS,
  CALCULATED_COLUMNS_MODULE_ID,
} from './index';
import { calculatedColumnsModule } from './index';

describe('calculatedColumnsModule', () => {
  it('registers with expected metadata', () => {
    expect(calculatedColumnsModule.id).toBe(CALCULATED_COLUMNS_MODULE_ID);
    expect(calculatedColumnsModule.code).toBe('03');
    expect(calculatedColumnsModule.ListPane).toBeTruthy();
  });

  it('getInitialState ships zero virtual columns', () => {
    expect(calculatedColumnsModule.getInitialState()).toEqual({ virtualColumns: [] });
  });

  it('transformColumnDefs is no-op with no virtual columns', () => {
    const defs = [{ field: 'qty' }];
    const out = calculatedColumnsModule.transformColumnDefs!(defs, INITIAL_CALCULATED_COLUMNS, {
      getModuleState: () => ({ assignments: {} }),
      resources: { expression: () => ({ parse: () => ({}), validate: () => ({ valid: true, errors: [] }) }) },
    } as never);
    expect(out).toBe(defs);
  });

  it('deserialize coerces legacy string formatter templates', () => {
    const raw = {
      virtualColumns: [{
        colId: 'v1',
        headerName: 'V',
        expression: '[a]',
        valueFormatterTemplate: 'UPPER([a])',
      }],
    };
    const state = calculatedColumnsModule.deserialize!(raw);
    expect(state.virtualColumns[0]?.valueFormatterTemplate).toEqual({
      kind: 'expression',
      expression: 'UPPER([a])',
    });
  });

  it('deserialize falls back to empty virtualColumns for invalid raw', () => {
    expect(calculatedColumnsModule.deserialize!(null)).toEqual({ virtualColumns: [] });
  });

  it('transformColumnDefs appends virtual column defs', () => {
    const defs = [{ field: 'qty', colId: 'qty' }];
    const state = {
      virtualColumns: [{
        colId: 'net',
        headerName: 'Net',
        expression: '[qty] * 2',
      }],
    };
    const engine = {
      parse: () => ({}),
      validate: () => ({ valid: true, errors: [] }),
      evaluate: () => 0,
    };
    const cache = () => new WeakMap();
    const out = calculatedColumnsModule.transformColumnDefs!(defs, state, {
      getModuleState: () => ({ assignments: {} }),
      resources: { expression: () => engine, cache },
    } as never);
    expect(out.length).toBe(2);
    expect(out[1]).toMatchObject({ colId: 'net', headerName: 'Net' });
  });

  it('exports master-detail panes and SettingsPanel', () => {
    expect(calculatedColumnsModule.ListPane).toBeTruthy();
    expect(calculatedColumnsModule.EditorPane).toBeTruthy();
    expect(calculatedColumnsModule.SettingsPanel).toBeTruthy();
  });

  it('transformColumnDefs merges column-customization assignments', () => {
    const defs = [{ field: 'qty', colId: 'qty' }];
    const state = {
      virtualColumns: [{
        colId: 'net',
        headerName: 'Net',
        expression: '[qty] * 2',
        position: 1,
      }],
    };
    const engine = {
      parse: () => ({}),
      validate: () => ({ valid: true, errors: [] }),
      evaluate: () => 0,
    };
    const out = calculatedColumnsModule.transformColumnDefs!(defs, state, {
      getModuleState: () => ({
        assignments: {
          net: {
            headerName: 'Net renamed',
            cellStyleOverrides: { dark: { alignment: { horizontal: 'right' } } },
            filter: { kind: 'text' },
            rowGrouping: { enabled: false },
            valueFormatterTemplate: { kind: 'excelFormat', format: '#,##0' },
          },
        },
      }),
      resources: { expression: () => engine, cache: () => new WeakMap() },
    } as never);
    expect(out[1]).toMatchObject({ headerName: 'Net renamed' });
  });

  it('deserialize keeps non-string formatter templates and empty strings', () => {
    const state = calculatedColumnsModule.deserialize!({
      virtualColumns: [{
        colId: 'v1',
        headerName: 'V',
        expression: '[a]',
        valueFormatterTemplate: { kind: 'excelFormat', format: '0' },
      }, {
        colId: 'v2',
        headerName: 'V2',
        expression: '[b]',
        valueFormatterTemplate: '',
      }],
    });
    expect(state.virtualColumns[0]?.valueFormatterTemplate).toEqual({ kind: 'excelFormat', format: '0' });
    expect(state.virtualColumns[1]?.valueFormatterTemplate).toBeUndefined();
  });
});
