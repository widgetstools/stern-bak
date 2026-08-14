/**
 * Covers the popped FormatterPanel branch in FormattingToolbar.
 */
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GridPlatform } from '@wellsfargo-starui/core';
import { GridProvider, generalSettingsModule } from '../customizer/internal.js';
import { FormattingToolbar } from './FormattingToolbar';

vi.mock('../customizer/internal.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../customizer/internal.js')>();
  return {
    ...actual,
    Poppable: React.forwardRef(function MockPoppable(_props: any, ref) {
      React.useImperativeHandle(ref, () => ({ focusIfPopped: () => false }));
      return (
        <div data-testid="mock-poppable">
          {_props.children({
            popped: true,
            PopoutButton: ({ children }: any) => <button type="button">{children}</button>,
            close: vi.fn(),
          })}
        </div>
      );
    }),
    useFormatter: () => ({
      state: {
        colIds: ['price'],
        colLabel: 'Price',
        pickerDataType: 'number',
        target: 'cell',
        scope: 'selected',
        disabled: false,
        isHeader: false,
        fmt: { bold: false, italic: false, underline: false, borders: {} },
        previewText: '1',
        templates: [],
        saveAsTplName: '',
        saveAsTplConfirmed: false,
        clearConfirmed: false,
        clearSelectedConfirmed: false,
        canUndo: false,
        canRedo: false,
        singleColumnSelected: true,
        cellsEditable: true,
        filterIsCustom: false,
        floatingFilterOn: false,
        capturableFields: [],
        headerCaseUppercase: false,
        showCellTooltips: false,
      },
      actions: {
        setTarget: vi.fn(),
        setScope: vi.fn(),
        toggleBold: vi.fn(),
        toggleItalic: vi.fn(),
        toggleUnderline: vi.fn(),
        setFontSizePx: vi.fn(),
        toggleAlign: vi.fn(),
        setTextColor: vi.fn(),
        setBgColor: vi.fn(),
        applyBordersMap: vi.fn(),
        doFormat: vi.fn(),
        decreaseDecimals: vi.fn(),
        increaseDecimals: vi.fn(),
        applyTemplate: vi.fn(),
        saveAsTemplate: vi.fn(),
        updateTemplate: vi.fn(),
        renameTemplate: vi.fn(),
        deleteTemplate: vi.fn(),
        setSaveAsTplName: vi.fn(),
        flashSaveAsTpl: vi.fn(),
        confirmClearAll: vi.fn(),
        confirmClearSelected: vi.fn(),
        undo: vi.fn(),
        redo: vi.fn(),
        setHeaderName: vi.fn(),
        toggleEditable: vi.fn(),
        setCellEditorKind: vi.fn(),
        setCellEditorValues: vi.fn(),
        setFilterPrimaryKind: vi.fn(),
        toggleFloatingFilter: vi.fn(),
        toggleHeaderCaseUppercase: vi.fn(),
        toggleCellTooltips: vi.fn(),
      },
    }),
  };
});

describe('FormattingToolbar popout branch', () => {
  it('renders FormatterPanel when Poppable reports popped', () => {
    const platform = new GridPlatform({ gridId: 'pop-grid', modules: [generalSettingsModule] });
    render(
      <GridProvider platform={platform}>
        <FormattingToolbar />
      </GridProvider>,
    );
    expect(screen.getByTestId('formatting-properties-panel')).toBeInTheDocument();
  });
});
