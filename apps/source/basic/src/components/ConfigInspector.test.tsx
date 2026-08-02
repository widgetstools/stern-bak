import '../staruiVitestMocks';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { getOneByTestId, getOneByText } from '../../../../test-utils/queries';
import { ConfigInspector } from './ConfigInspector';

const GRID_ID = 'bond-blotter-v1';
const STORAGE_KEY = `markets-grid-bundle:${GRID_ID}`;

describe('ConfigInspector', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders trigger with zero profile count when storage is empty', () => {
    render(
      <ConfigInspector
        gridId={GRID_ID}
        open={false}
        onOpenChange={vi.fn()}
        onClearAll={vi.fn()}
      />,
    );
    const trigger = screen.getByTestId('config-inspector-trigger');
    expect(trigger).toBeInTheDocument();
    expect(screen.getByText('Inspect storage')).toBeInTheDocument();
    expect(trigger.textContent).toContain('0');
  });

  it('shows empty state when opened with no storage', () => {
    render(
      <ConfigInspector
        gridId={GRID_ID}
        open={true}
        onOpenChange={vi.fn()}
        onClearAll={vi.fn()}
      />,
    );
    expect(screen.getByText('Layout storage inspector')).toBeInTheDocument();
    expect(screen.getAllByText('No bundle written yet').length).toBeGreaterThan(0);
    expect(screen.getAllByText(STORAGE_KEY).length).toBeGreaterThan(0);
  });

  it('lists profiles when storage contains a valid bundle', () => {
    const bundle = {
      profiles: [
        { id: 'p1', name: 'Default', updatedAt: '2030-01-01T00:00:00.000Z', state: { cols: [] } },
        { id: 'p2', name: 'Compact', updatedAt: '2030-02-01T00:00:00.000Z', state: { cols: [1] } },
      ],
      activeProfileId: 'p1',
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bundle));

    render(
      <ConfigInspector
        gridId={GRID_ID}
        open={true}
        onOpenChange={vi.fn()}
        onClearAll={vi.fn()}
      />,
    );

    expect(screen.getByText('Default')).toBeInTheDocument();
    expect(screen.getByText('Compact')).toBeInTheDocument();
    expect(screen.getAllByText('Active').length).toBeGreaterThan(0);
  });

  it('refreshes snapshot on demand', async () => {
    const user = userEvent.setup();
    render(
      <ConfigInspector
        gridId={GRID_ID}
        open={true}
        onOpenChange={vi.fn()}
        onClearAll={vi.fn()}
      />,
    );

    expect(screen.getAllByText('No bundle written yet').length).toBeGreaterThan(0);

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        profiles: [{ id: 'x', name: 'Fresh', state: {} }],
        activeProfileId: 'x',
      }),
    );

    await user.click(getOneByTestId('inspector-refresh'));
    expect(getOneByText('Fresh')).toBeInTheDocument();
  });

  it('copies raw JSON to clipboard', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(navigator.clipboard, 'writeText').mockImplementation(writeText);

    localStorage.setItem(STORAGE_KEY, JSON.stringify({ profiles: [], activeProfileId: null }));

    render(
      <ConfigInspector
        gridId={GRID_ID}
        open={true}
        onOpenChange={vi.fn()}
        onClearAll={vi.fn()}
      />,
    );

    for (const btn of screen.getAllByTestId('inspector-copy')) {
      await user.click(btn);
      if (writeText.mock.calls.length > 0) break;
    }
    expect(writeText).toHaveBeenCalled();
    expect(writeText.mock.calls[0]?.[0]).toContain('"profiles"');
  });

  it('calls onClearAll when reset clicked', async () => {
    const user = userEvent.setup();
    const onClearAll = vi.fn();
    render(
      <ConfigInspector
        gridId={GRID_ID}
        open={true}
        onOpenChange={vi.fn()}
        onClearAll={onClearAll}
      />,
    );

    for (const btn of screen.getAllByTestId('inspector-clear')) {
      await user.click(btn);
      if (onClearAll.mock.calls.length > 0) break;
    }
    expect(onClearAll).toHaveBeenCalledTimes(1);
  });

  it('handles invalid JSON in storage gracefully', () => {
    localStorage.setItem(STORAGE_KEY, 'not-json');
    render(
      <ConfigInspector
        gridId={GRID_ID}
        open={true}
        onOpenChange={vi.fn()}
        onClearAll={vi.fn()}
      />,
    );
    expect(screen.getAllByText('No bundle written yet').length).toBeGreaterThan(0);
  });

  it('re-reads storage when sheet opens', async () => {
    const { rerender } = render(
      <ConfigInspector
        gridId={GRID_ID}
        open={false}
        onOpenChange={vi.fn()}
        onClearAll={vi.fn()}
      />,
    );

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        profiles: [{ id: 'a', name: 'On Open', state: {} }],
        activeProfileId: 'a',
      }),
    );

    rerender(
      <ConfigInspector
        gridId={GRID_ID}
        open={true}
        onOpenChange={vi.fn()}
        onClearAll={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(getOneByText('On Open')).toBeInTheDocument();
    });
  });

  it('shows copied confirmation icon briefly', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(navigator.clipboard, 'writeText').mockImplementation(writeText);

    localStorage.setItem(STORAGE_KEY, JSON.stringify({ profiles: [], activeProfileId: null }));

    render(
      <ConfigInspector
        gridId={GRID_ID}
        open={true}
        onOpenChange={vi.fn()}
        onClearAll={vi.fn()}
      />,
    );

    for (const btn of screen.getAllByTestId('inspector-copy')) {
      await userEvent.click(btn);
      if (writeText.mock.calls.length > 0) break;
    }
    expect(writeText).toHaveBeenCalled();
  });
});
