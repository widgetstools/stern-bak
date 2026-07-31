/**
 * Integration tests for FormattingToolbar.
 *
 * These mount the toolbar inside a <GridProvider> with a minimal fake
 * GridApi so the component's real code paths run end-to-end:
 *
 *   user clicks button → toolbar handler → delegating helper → pure
 *   reducer → setModuleState → store update → assertion reads back
 *
 * The reducers already have 63 unit tests in core
 * (formattingActions.test.ts + snapshotTemplate.test.ts). The point of
 * THESE tests is to verify the PLUMBING — that every button is wired to
 * the correct reducer with the correct args. Together they cover the
 * refactor end-to-end and make the upcoming "drop the store prop"
 * commits safe.
 */
import * as React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Column, GridApi } from 'ag-grid-community';
import { GridPlatform } from '@wellsfargo-starui/engine';
import {
  columnCustomizationModule,
  columnTemplatesModule,
  generalSettingsModule,
  GENERAL_SETTINGS_MODULE_ID,
  GridProvider,
  type ColumnCustomizationState,
  type ColumnTemplatesState,
  type GeneralSettingsState,
} from '@wellsfargo-starui/grid/customizer';
import { FormattingToolbar } from './FormattingToolbar';

// Per-column overrides are theme-keyed in profile state. jsdom has no
// `[data-theme]` so the active theme resolves to `'dark'` — seed both
// slots in setup so reducers reading the active slot see the legacy
// flat shape.
function themed(flat: any): any {
  return { dark: flat, light: flat };
}


// ─── Fake GridApi harness ─────────────────────────────────────────────

interface FakeCol {
  id: string;
  headerName?: string;
  cellDataType?: string;
}

/**
 * Build a `GridApi`-shaped object that the toolbar's two read sites
 * (`useActiveColumns` via ApiHub + the inline `core.getGridApi()` calls
 * for colLabel / pickerDataType / saveAsTemplate) both recognise.
 *
 * - `getColumns()` + `getColumn(id)` expose the column list for
 *   headerName / cellDataType lookups.
 * - `getCellRanges()` returns a synthetic range with exactly the colIds
 *   we want the toolbar to treat as "active". Used by `useActiveColumns`.
 * - `addEventListener` / `removeEventListener` store subscriptions and
 *   expose a `fireEvent(name)` helper so tests can simulate AG-Grid
 *   emitting cellFocused / cellSelectionChanged / etc.
 */
function makeFakeApi(cols: FakeCol[], activeColIds: string[]) {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  const toColumn = (c: FakeCol): Column =>
    ({
      getColId: () => c.id,
      getColDef: () => ({ headerName: c.headerName, cellDataType: c.cellDataType }),
    }) as Column;

  const api: Partial<GridApi> = {
    getColumns: () => cols.map(toColumn),
    getColumn: ((id: string) => {
      const c = cols.find((x) => x.id === id);
      return c ? toColumn(c) : null;
    }) as GridApi['getColumn'],
    getCellRanges: () =>
      activeColIds.length === 0
        ? null
        : ([
            { columns: activeColIds.map((id) => toColumn({ id })) },
          ] as unknown as ReturnType<GridApi['getCellRanges']>),
    getFocusedCell: () => null,
    addEventListener: ((evt: string, fn: (...a: unknown[]) => void) => {
      if (!listeners.has(evt)) listeners.set(evt, new Set());
      listeners.get(evt)!.add(fn);
    }) as unknown as GridApi['addEventListener'],
    removeEventListener: ((evt: string, fn: (...a: unknown[]) => void) => {
      listeners.get(evt)?.delete(fn);
    }) as unknown as GridApi['removeEventListener'],
  };
  return {
    api: api as GridApi,
    fireEvent(evt: string) {
      for (const fn of Array.from(listeners.get(evt) ?? [])) fn();
    },
    setActive(next: string[]) {
      activeColIds = next;
    },
  };
}

function makePlatform() {
  return new GridPlatform({
    gridId: 'test-grid',
    modules: [generalSettingsModule, columnTemplatesModule, columnCustomizationModule],
  });
}

function mountToolbar({
  platform,
  api,
}: {
  platform: GridPlatform;
  api: GridApi;
}) {
  // FormattingToolbar is fully context-driven as of step 7 — it takes
  // NO props. Every dependency (live GridApi, module stores, ApiHub)
  // flows through `useGridPlatform()`.
  platform.onGridReady(api);
  return render(
    <GridProvider platform={platform}>
      <FormattingToolbar />
    </GridProvider>,
  );
}

const COLS: FakeCol[] = [
  { id: 'price', headerName: 'Price', cellDataType: 'numeric' },
  { id: 'quantity', headerName: 'Quantity', cellDataType: 'numeric' },
];

function getCustState(platform: GridPlatform) {
  return platform.store.getModuleState<ColumnCustomizationState>('column-customization');
}

function getAssignment(platform: GridPlatform, colId: string) {
  return getCustState(platform).assignments[colId];
}

function getTplState(platform: GridPlatform) {
  return platform.store.getModuleState<ColumnTemplatesState>('column-templates');
}

function getGeneralState(platform: GridPlatform) {
  return platform.store.getModuleState<GeneralSettingsState>(GENERAL_SETTINGS_MODULE_ID);
}

// ─── Tests ─────────────────────────────────────────────────────────────

describe('FormattingToolbar — typography', () => {
  let platform: GridPlatform;
  beforeEach(() => { platform = makePlatform(); });

  it('Bold button writes typography.bold on the active column', async () => {
    const fake = makeFakeApi(COLS, ['price']);
    mountToolbar({ platform, api: fake.api });

    // useActiveColumns() starts empty; the onReady fires synchronously
    // once the api is live, but React may batch — wait for the button
    // to render in its enabled state.
    await waitFor(() =>
      expect((screen.getByRole('button', { name: 'Bold' }) as HTMLButtonElement).disabled).toBe(false),
    );

    act(() => {
      fireEvent.mouseDown(screen.getByRole('button', { name: 'Bold' }));
    });

    expect(getAssignment(platform, 'price')?.cellStyleOverrides?.dark?.typography?.bold).toBe(true);
  });

  it('Bold is idempotent-toggle: second click clears it', async () => {
    const fake = makeFakeApi(COLS, ['price']);
    mountToolbar({ platform, api: fake.api });
    const bold = () => screen.getByRole('button', { name: 'Bold' }) as HTMLButtonElement;

    await waitFor(() => expect(bold().disabled).toBe(false));
    act(() => fireEvent.mouseDown(bold()));
    expect(getAssignment(platform, 'price')?.cellStyleOverrides?.dark?.typography?.bold).toBe(true);

    // Second click clears.
    act(() => fireEvent.mouseDown(bold()));
    // Every override has been un-set → the assignment collapses to `{ colId }`.
    expect(getAssignment(platform, 'price')).toEqual({ colId: 'price' });
  });

  it('Italic button writes typography.italic', async () => {
    const fake = makeFakeApi(COLS, ['price']);
    mountToolbar({ platform, api: fake.api });

    await waitFor(() =>
      expect((screen.getByRole('button', { name: 'Italic' }) as HTMLButtonElement).disabled).toBe(false),
    );
    act(() => fireEvent.mouseDown(screen.getByRole('button', { name: 'Italic' })));

    expect(getAssignment(platform, 'price')?.cellStyleOverrides?.dark?.typography?.italic).toBe(true);
  });

  it('Underline button writes typography.underline', async () => {
    const fake = makeFakeApi(COLS, ['price']);
    mountToolbar({ platform, api: fake.api });

    await waitFor(() =>
      expect((screen.getByRole('button', { name: 'Underline' }) as HTMLButtonElement).disabled).toBe(false),
    );
    act(() => fireEvent.mouseDown(screen.getByRole('button', { name: 'Underline' })));

    expect(getAssignment(platform, 'price')?.cellStyleOverrides?.dark?.typography?.underline).toBe(true);
  });

  it('writes to multiple columns when more than one is in the active range', async () => {
    const fake = makeFakeApi(COLS, ['price', 'quantity']);
    mountToolbar({ platform, api: fake.api });

    await waitFor(() =>
      expect((screen.getByRole('button', { name: 'Bold' }) as HTMLButtonElement).disabled).toBe(false),
    );
    act(() => fireEvent.mouseDown(screen.getByRole('button', { name: 'Bold' })));

    expect(getAssignment(platform, 'price')?.cellStyleOverrides?.dark?.typography?.bold).toBe(true);
    expect(getAssignment(platform, 'quantity')?.cellStyleOverrides?.dark?.typography?.bold).toBe(true);
  });
});

describe('FormattingToolbar — alignment', () => {
  let platform: GridPlatform;
  beforeEach(() => { platform = makePlatform(); });

  it.each(['Left', 'Center', 'Right'] as const)(
    '"%s" alignment button writes alignment.horizontal',
    async (label) => {
      const buttonName = `Align ${label.toLowerCase()}`;
      const fake = makeFakeApi(COLS, ['price']);
      mountToolbar({ platform, api: fake.api });

      await waitFor(() =>
        expect((screen.getByRole('button', { name: buttonName }) as HTMLButtonElement).disabled).toBe(false),
      );
      act(() => fireEvent.mouseDown(screen.getByRole('button', { name: buttonName })));

      expect(
        getAssignment(platform, 'price')?.cellStyleOverrides?.dark?.alignment?.horizontal,
      ).toBe(label.toLowerCase());
    },
  );

  it('clicking the active alignment again clears it', async () => {
    const fake = makeFakeApi(COLS, ['price']);
    mountToolbar({ platform, api: fake.api });

    await waitFor(() =>
      expect((screen.getByRole('button', { name: 'Align center' }) as HTMLButtonElement).disabled).toBe(false),
    );
    act(() => fireEvent.mouseDown(screen.getByRole('button', { name: 'Align center' })));
    expect(
      getAssignment(platform, 'price')?.cellStyleOverrides?.dark?.alignment?.horizontal,
    ).toBe('center');

    act(() => fireEvent.mouseDown(screen.getByRole('button', { name: 'Align center' })));
    expect(getAssignment(platform, 'price')).toEqual({ colId: 'price' });
  });
});

describe('FormattingToolbar — target switcher', () => {
  let platform: GridPlatform;
  beforeEach(() => { platform = makePlatform(); });

  it('defaults to target="cell" — writes land in cellStyleOverrides', async () => {
    const fake = makeFakeApi(COLS, ['price']);
    mountToolbar({ platform, api: fake.api });

    await waitFor(() =>
      expect((screen.getByRole('button', { name: 'Bold' }) as HTMLButtonElement).disabled).toBe(false),
    );
    act(() => fireEvent.mouseDown(screen.getByRole('button', { name: 'Bold' })));

    expect(getAssignment(platform, 'price')?.cellStyleOverrides?.dark?.typography?.bold).toBe(true);
    expect(getAssignment(platform, 'price')?.headerStyleOverrides).toBeUndefined();
  });

  it('switching to target="header" routes writes into headerStyleOverrides', async () => {
    const fake = makeFakeApi(COLS, ['price']);
    mountToolbar({ platform, api: fake.api });

    await waitFor(() =>
      expect((screen.getByRole('button', { name: 'Bold' }) as HTMLButtonElement).disabled).toBe(false),
    );

    // The segmented toggle renders both options at all times. Pick
    // the HEADER side via mousedown to mirror real-user input.
    act(() => fireEvent.mouseDown(screen.getByTestId('formatting-target-header')));

    act(() => fireEvent.mouseDown(screen.getByRole('button', { name: 'Bold' })));

    expect(getAssignment(platform, 'price')?.cellStyleOverrides).toBeUndefined();
    expect(getAssignment(platform, 'price')?.headerStyleOverrides?.dark?.typography?.bold).toBe(true);
  });
});

describe('FormattingToolbar — ALL + HEADER scope writes to globalHeaderStyle', () => {
  let platform: GridPlatform;
  beforeEach(() => { platform = makePlatform(); });

  // The toolbar now has two explicit segmented toggles instead of an
  // implicit "header mode → broadcast" shortcut. The user picks
  // HEADERS + ALL to apply a baseline across every column; writes
  // land on `globalHeaderStyle` rather than each column's
  // `headerStyleOverrides`. Per-column rules win over the global
  // baseline at render time via more-specific CSS selectors.
  async function switchToHeaderAndAll() {
    act(() => fireEvent.mouseDown(screen.getByTestId('formatting-target-header')));
    act(() => fireEvent.mouseDown(screen.getByTestId('formatting-scope-all')));
    await waitFor(() => {
      expect(screen.getByTestId('formatting-target-header').getAttribute('data-active')).toBe('true');
      expect(screen.getByTestId('formatting-scope-all').getAttribute('data-active')).toBe('true');
    });
  }

  it('header font size lands on globalHeaderStyle, not per-column overrides', async () => {
    const user = userEvent.setup();
    const fake = makeFakeApi(COLS, ['price']);
    mountToolbar({ platform, api: fake.api });

    await switchToHeaderAndAll();

    const sizeButton = screen.getByTestId('fmt-panel-font-size') as HTMLButtonElement;
    expect(sizeButton.disabled).toBe(false);
    await user.click(sizeButton);
    const option = await screen.findByText('16px');
    await user.click(option);

    const cust = platform.store.getModuleState<ColumnCustomizationState>('column-customization');
    expect(cust?.globalHeaderStyle?.dark?.typography?.fontSize).toBe(16);
    // Per-column overrides for either column must NOT be set —
    // global means "every column, no per-column entries needed".
    expect(getAssignment(platform, 'price')?.headerStyleOverrides).toBeUndefined();
    expect(getAssignment(platform, 'quantity')?.headerStyleOverrides).toBeUndefined();
  });

  it('header text color lands on globalHeaderStyle, not per-column overrides', async () => {
    const fake = makeFakeApi(COLS, ['price']);
    mountToolbar({ platform, api: fake.api });

    await switchToHeaderAndAll();

    const textColor = screen.getByRole('button', { name: 'Text color' });
    act(() => {
      fireEvent.pointerDown(textColor);
      fireEvent.click(textColor);
    });
    const input = await waitFor(() => {
      const el = document.querySelector<HTMLInputElement>('input[type="text"][value="#000000"]');
      expect(el).not.toBeNull();
      return el!;
    });
    act(() => fireEvent.change(input, { target: { value: '#ef4444' } }));

    const cust = platform.store.getModuleState<ColumnCustomizationState>('column-customization');
    expect(cust?.globalHeaderStyle?.dark?.colors?.text).toBe('#ef4444');
    expect(getAssignment(platform, 'price')?.headerStyleOverrides).toBeUndefined();
    expect(getAssignment(platform, 'quantity')?.headerStyleOverrides).toBeUndefined();
  });

  it('color picker dismisses on a discrete commit (Enter on a valid hex)', async () => {
    const fake = makeFakeApi(COLS, ['price']);
    mountToolbar({ platform, api: fake.api });

    await switchToHeaderAndAll();

    const textColor = screen.getByRole('button', { name: 'Text color' });
    act(() => {
      fireEvent.pointerDown(textColor);
      fireEvent.click(textColor);
    });
    const input = await waitFor(() => {
      const el = document.querySelector<HTMLInputElement>('input[type="text"][value="#000000"]');
      expect(el).not.toBeNull();
      return el!;
    });

    // Typing alone keeps the popover open so partial hexes stay editable.
    act(() => fireEvent.change(input, { target: { value: '#ef4444' } }));
    expect(document.querySelector('input[type="text"]')).not.toBeNull();

    // Enter on a valid hex is an explicit commit — the popover closes.
    act(() => fireEvent.keyDown(input, { key: 'Enter' }));
    await waitFor(() => {
      expect(document.body.contains(input)).toBe(false);
    });

    const cust = platform.store.getModuleState<ColumnCustomizationState>('column-customization');
    expect(cust?.globalHeaderStyle?.dark?.colors?.text).toBe('#ef4444');
  });

  it('header case toggle flips the grid-wide general-settings flag', async () => {
    const fake = makeFakeApi(COLS, []);
    mountToolbar({ platform, api: fake.api });

    const pill = await screen.findByTestId('formatting-toggle-header-case');
    expect((pill as HTMLButtonElement).disabled).toBe(false);
    expect(getGeneralState(platform).headerCaseUppercase).toBe(false);
    expect(pill.getAttribute('aria-pressed')).toBe('false');

    act(() => fireEvent.mouseDown(pill));
    expect(getGeneralState(platform).headerCaseUppercase).toBe(true);
    expect(pill.getAttribute('aria-pressed')).toBe('true');

    act(() => fireEvent.mouseDown(pill));
    expect(getGeneralState(platform).headerCaseUppercase).toBe(false);
    expect(pill.getAttribute('aria-pressed')).toBe('false');
  });
});

describe('FormattingToolbar — templates', () => {
  let platform: GridPlatform;
  beforeEach(() => {
    platform = makePlatform();
    // Seed a template so the templates picker has something to show.
    platform.store.setModuleState<ColumnTemplatesState>('column-templates', () => ({
      templates: {
        'tpl-red': {
          id: 'tpl-red',
          name: 'Red text',
          cellStyleOverrides: themed({ colors: { text: '#ff0000' } }),
          createdAt: 1,
          updatedAt: 1,
        },
      },
      typeDefaults: {},
    }));
  });

  it('picking a template sets templateIds on active columns', async () => {
    const fake = makeFakeApi(COLS, ['price']);
    mountToolbar({ platform, api: fake.api });

    await waitFor(() =>
      expect((screen.getByRole('button', { name: 'Bold' }) as HTMLButtonElement).disabled).toBe(false),
    );

    // Open the templates popover and click the seeded `tpl-red` row —
    // TemplateManager applies the template on row click.
    act(() => fireEvent.click(screen.getByTestId('templates-menu-trigger')));
    const row = await screen.findByTestId('tb-tpl-row-tpl-red');
    act(() => fireEvent.click(row));

    expect(getAssignment(platform, 'price')?.templateIds).toEqual(['tpl-red']);
  });

  it('save-as-template inserts a new ColumnTemplate when the column has style', async () => {
    const fake = makeFakeApi(COLS, ['price']);
    mountToolbar({ platform, api: fake.api });

    await waitFor(() =>
      expect((screen.getByRole('button', { name: 'Bold' }) as HTMLButtonElement).disabled).toBe(false),
    );

    // Lay down some style on `price` first.
    act(() => fireEvent.mouseDown(screen.getByRole('button', { name: 'Bold' })));
    expect(getAssignment(platform, 'price')?.cellStyleOverrides?.dark?.typography?.bold).toBe(true);

    // Open the unified Templates popover (save-as input lives inside
    // the same popover as the template list, via TemplateManager),
    // then type + hit the Save button.
    act(() => fireEvent.click(screen.getByTestId('templates-menu-trigger')));
    const input = await screen.findByTestId('tb-tpl-save-input');
    act(() => fireEvent.change(input, { target: { value: 'Bold Style' } }));
    act(() => fireEvent.click(screen.getByTestId('tb-tpl-save-btn')));

    const templates = getTplState(platform).templates;
    // Original `tpl-red` + the new one.
    expect(Object.keys(templates).length).toBe(2);
    const saved = Object.values(templates).find((t) => t.name === 'Bold Style');
    expect(saved).toBeDefined();
    expect(saved!.cellStyleOverrides?.dark?.typography?.bold).toBe(true);
    expect(saved!.description).toBe('Saved from price');
  });

  it('save-as-template is a no-op when the column has no overrides', async () => {
    const fake = makeFakeApi(COLS, ['price']);
    mountToolbar({ platform, api: fake.api });

    await waitFor(() =>
      expect((screen.getByRole('button', { name: 'Bold' }) as HTMLButtonElement).disabled).toBe(false),
    );

    // Open the unified Templates popover and try to save with no
    // overrides on the column — expect the save to be a no-op.
    act(() => fireEvent.click(screen.getByTestId('templates-menu-trigger')));
    const input = await screen.findByTestId('tb-tpl-save-input');
    act(() => fireEvent.change(input, { target: { value: 'Empty' } }));
    act(() => fireEvent.click(screen.getByTestId('tb-tpl-save-btn')));

    // Template count is unchanged — still just the seed `tpl-red`.
    expect(Object.keys(getTplState(platform).templates)).toEqual(['tpl-red']);
  });
});

describe('FormattingToolbar — clear flows', () => {
  let platform: GridPlatform;
  beforeEach(() => { platform = makePlatform(); });

  it('Clear all wipes every column assignment immediately (no confirm dialog)', async () => {
    const fake = makeFakeApi(COLS, ['price']);
    mountToolbar({ platform, api: fake.api });

    // Apply something so there's state to clear.
    await waitFor(() =>
      expect((screen.getByRole('button', { name: 'Bold' }) as HTMLButtonElement).disabled).toBe(false),
    );
    act(() => fireEvent.mouseDown(screen.getByRole('button', { name: 'Bold' })));
    expect(getAssignment(platform, 'price')?.cellStyleOverrides?.dark?.typography?.bold).toBe(true);

    // Clicking Clear-all fires the clear directly — no confirm dialog.
    act(() => {
      fireEvent.click(screen.getByTestId('formatting-clear-all'));
    });
    expect(screen.queryByTestId('formatting-clear-all-confirm-btn')).toBeNull();

    expect(getCustState(platform).assignments).toEqual({});
  });

  it('Clear selected wipes only the targeted column immediately (no confirm dialog)', async () => {
    const fake = makeFakeApi(COLS, ['price']);
    mountToolbar({ platform, api: fake.api });

    await waitFor(() =>
      expect((screen.getByRole('button', { name: 'Bold' }) as HTMLButtonElement).disabled).toBe(false),
    );
    // Style price.
    act(() => fireEvent.mouseDown(screen.getByRole('button', { name: 'Bold' })));
    // Style quantity directly via the store so we have a second column to compare.
    platform.store.setModuleState<ColumnCustomizationState>('column-customization', (prev) => ({
      ...(prev ?? { assignments: {} }),
      assignments: {
        ...(prev?.assignments ?? {}),
        quantity: { colId: 'quantity', cellStyleOverrides: themed({ typography: { bold: true } }) },
      },
    }));

    expect(getAssignment(platform, 'price')?.cellStyleOverrides?.dark?.typography?.bold).toBe(true);
    expect(getAssignment(platform, 'quantity')?.cellStyleOverrides?.dark?.typography?.bold).toBe(true);

    act(() => {
      fireEvent.click(screen.getByTestId('formatting-clear-selected'));
    });
    expect(screen.queryByTestId('formatting-clear-selected-confirm-btn')).toBeNull();

    expect(getAssignment(platform, 'price')).toEqual({ colId: 'price' });
    expect(getAssignment(platform, 'quantity')?.cellStyleOverrides?.dark?.typography?.bold).toBe(true);
  });
});

describe('FormattingToolbar — disabled state', () => {
  let platform: GridPlatform;
  beforeEach(() => { platform = makePlatform(); });

  it('Bold button is disabled when no column is active', async () => {
    const fake = makeFakeApi(COLS, []);
    mountToolbar({ platform, api: fake.api });

    // The toolbar re-computes once the api is ready and still finds
    // no active columns → buttons are disabled.
    await waitFor(() => {
      const b = screen.getByRole('button', { name: 'Bold' }) as HTMLButtonElement;
      expect(b.disabled).toBe(true);
    });
  });

  it('format readout invites selection when no column is active', async () => {
    const fake = makeFakeApi(COLS, []);
    mountToolbar({ platform, api: fake.api });
    await waitFor(() => {
      const readout = screen.getByTestId('formatting-readout');
      expect(readout.getAttribute('data-empty')).toBe('true');
      expect(readout.textContent).toContain('Select a column to format');
    });
  });

  it('format readout names the target + scope for the active column', async () => {
    const fake = makeFakeApi(COLS, ['price']);
    mountToolbar({ platform, api: fake.api });
    await waitFor(() => {
      const readout = screen.getByTestId('formatting-readout');
      expect(readout.getAttribute('data-empty')).toBeNull();
      expect(readout.textContent).toContain('Cells');
      expect(readout.textContent).toContain('Price');
    });
  });
});
