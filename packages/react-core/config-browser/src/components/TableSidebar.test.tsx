import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TABLES } from '../types';
import { TableSidebar } from './TableSidebar';

afterEach(cleanup);

const COUNTS = {
  appConfig: 12,
  appRegistry: 3,
  userProfile: 7,
  roles: 4,
  permissions: 21,
  pendingSync: 0,
};

describe('TableSidebar', () => {
  it('lists every browsable table in CONFIG_BROWSER_TABLES order', () => {
    render(<TableSidebar selected="appConfig" counts={COUNTS} onSelect={vi.fn()} />);

    const labels = screen.getAllByRole('button').map((b) => within(b).getAllByText(/.+/)[0].textContent);
    expect(labels).toEqual(TABLES.map((t) => t.label));
  });

  it('shows each table its own count, not a neighbour\'s', async () => {
    render(<TableSidebar selected="appConfig" counts={COUNTS} onSelect={vi.fn()} />);

    // Counts are looked up by `t.key` against a differently-ordered object;
    // an off-by-one there would attribute Permissions' 21 rows to Roles.
    for (const table of TABLES) {
      const button = screen.getByRole('button', { name: new RegExp(`^${table.label}`) });
      expect(
        within(button).getByText(String(COUNTS[table.key])),
        `${table.label} should show ${COUNTS[table.key]}`,
      ).toBeTruthy();
    }
  });

  it('emits the table key — not the label — when a row is clicked', async () => {
    const onSelect = vi.fn();
    render(<TableSidebar selected="appConfig" counts={COUNTS} onSelect={onSelect} />);

    await userEvent.click(screen.getByRole('button', { name: /^User Profiles/ }));

    // The hook switches tables on the key; a label here would silently
    // select nothing.
    expect(onSelect).toHaveBeenCalledWith('userProfile');
  });

  it('marks exactly one row as active, and follows `selected`', () => {
    const { rerender } = render(
      <TableSidebar selected="appConfig" counts={COUNTS} onSelect={vi.fn()} />,
    );

    const activeClasses = () =>
      screen.getAllByRole('button')
        .filter((b) => b.className.includes('de-accent-dim'))
        .map((b) => b.textContent);

    expect(activeClasses()).toHaveLength(1);
    expect(activeClasses()[0]).toContain('App Config');

    rerender(<TableSidebar selected="permissions" counts={COUNTS} onSelect={vi.fn()} />);

    expect(activeClasses()).toHaveLength(1);
    expect(activeClasses()[0]).toContain('Permissions');
  });

  it('renders a zero count rather than blanking the badge', () => {
    render(<TableSidebar selected="appConfig" counts={COUNTS} onSelect={vi.fn()} />);

    // `{count}` not `{count || ''}` — an empty Pending Sync queue is
    // information, and a blank badge reads as "not loaded yet".
    const pendingSync = screen.getByRole('button', { name: /^Pending Sync/ });
    expect(within(pendingSync).getByText('0')).toBeTruthy();
  });
});
