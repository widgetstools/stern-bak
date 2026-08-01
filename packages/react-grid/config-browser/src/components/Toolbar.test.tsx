import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TableMeta } from '../types';
import { Toolbar } from './Toolbar';

afterEach(cleanup);

const APP_CONFIG: TableMeta = {
  key: 'appConfig',
  label: 'App Config',
  primaryKey: 'configId',
  scopable: true,
  description: 'Component configurations (templates + instances).',
};

function handlers() {
  return {
    onRefresh: vi.fn(),
    onNew: vi.fn(),
    onExport: vi.fn(),
    onExportAll: vi.fn(),
    onExportDeploy: vi.fn(),
    onImport: vi.fn(),
    onDeleteAll: vi.fn(),
    onResetToSeed: vi.fn(),
    onQuickFilterChange: vi.fn(),
  };
}

function renderToolbar(overrides: Partial<React.ComponentProps<typeof Toolbar>> = {}) {
  const h = handlers();
  render(
    <Toolbar
      table={APP_CONFIG}
      rowCount={5}
      quickFilter=""
      canResetToSeed
      {...h}
      {...overrides}
    />,
  );
  return h;
}

describe('Toolbar', () => {
  it('shows the table label, row count and primary key', () => {
    renderToolbar();

    expect(screen.getByText('App Config')).toBeTruthy();
    expect(screen.getByText('5 rows · pk configId')).toBeTruthy();
  });

  it('singularises the row count at exactly one row', () => {
    renderToolbar({ rowCount: 1 });

    expect(screen.getByText('1 row · pk configId')).toBeTruthy();
  });

  it.each([
    ['Refresh', 'onRefresh'],
    ['Import JSON (matches Export format)', 'onImport'],
    ['Export JSON (this table only)', 'onExport'],
    ['Export for deploy — scoped seed bundle with validation (workspaces + referenced instances only)', 'onExportDeploy'],
    ['Export ALL (raw) — full Dexie dump for debugging; may include orphan instance rows', 'onExportAll'],
    ['Reset ALL config to seed.json (requires backup first)', 'onResetToSeed'],
    ['Delete all rows in this view (requires backup)', 'onDeleteAll'],
    // The only button with a visible label — its text content wins over
    // `title="New row"` for the accessible name.
    ['New', 'onNew'],
  ] as const)('routes the %s button to its own handler', async (title, handlerName) => {
    const h = renderToolbar();

    await userEvent.click(screen.getByRole('button', { name: title }));

    // Eight near-identical icon buttons in a row is exactly where a
    // copy-paste crosses two handlers; assert one fired and none of the
    // others did.
    expect(h[handlerName]).toHaveBeenCalledTimes(1);
    for (const [name, fn] of Object.entries(h)) {
      if (name !== handlerName && name !== 'onQuickFilterChange') {
        expect(fn, `${name} should not have fired`).not.toHaveBeenCalled();
      }
    }
  });

  it('reports every keystroke in the quick filter box', async () => {
    const h = renderToolbar();

    await userEvent.type(screen.getByRole('textbox'), 'ab');

    // Controlled input pinned at '' — each keystroke reports the char it
    // would have produced from that value.
    expect(h.onQuickFilterChange.mock.calls.map((c) => c[0])).toEqual(['a', 'b']);
  });

  it('renders the quick filter as a controlled value', () => {
    renderToolbar({ quickFilter: 'trader' });

    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('trader');
  });

  it('disables Delete all on an empty table and swallows the click', async () => {
    const h = renderToolbar({ rowCount: 0 });

    const button = screen.getByRole('button', {
      name: 'Delete all rows in this view (requires backup)',
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);

    await userEvent.click(button);
    expect(h.onDeleteAll).not.toHaveBeenCalled();
  });

  it('disables Reset to seed and explains why when no seed is configured', async () => {
    const h = renderToolbar({ canResetToSeed: false });

    const button = screen.getByRole('button', {
      name: 'Reset to seed unavailable — no seed file is configured',
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);

    await userEvent.click(button);
    expect(h.onResetToSeed).not.toHaveBeenCalled();
  });
});
