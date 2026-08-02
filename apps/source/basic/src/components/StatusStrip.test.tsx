import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { buildBondInventory } from '../mockBonds';
import { StatusStrip } from './StatusStrip';

describe('StatusStrip', () => {
  const rows = buildBondInventory(5, 42);
  const storageKey = 'bundle:bond-blotter-v1';

  it('renders aggregate metrics from rows', () => {
    render(
      <StatusStrip
        rows={rows}
        activeProfileName="Default"
        profileCount={2}
        storageKey={storageKey}
      />,
    );

    expect(screen.getByText('Lines')).toBeInTheDocument();
    expect(screen.getByText('Notional')).toBeInTheDocument();
    expect(screen.getByText('DV01')).toBeInTheDocument();
    expect(screen.getByText('P&L (D)')).toBeInTheDocument();
    expect(screen.getByText('IG')).toBeInTheDocument();
    expect(screen.getByText('HY')).toBeInTheDocument();
  });

  it('shows active profile name with accent tone', () => {
    render(
      <StatusStrip
        rows={rows}
        activeProfileName="Trader View"
        profileCount={3}
        storageKey={storageKey}
      />,
    );
    expect(screen.getByText('Trader View')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('shows em dash when no active profile', () => {
    render(
      <StatusStrip
        rows={rows}
        activeProfileName={null}
        profileCount={0}
        storageKey={storageKey}
      />,
    );
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('displays the storage key', () => {
    render(
      <StatusStrip
        rows={rows}
        activeProfileName={null}
        profileCount={0}
        storageKey={storageKey}
      />,
    );
    expect(screen.getAllByText(storageKey)[0]).toBeInTheDocument();
  });

  it('applies negative tone for losing P&L day', () => {
    const losingRows = rows.map((r, i) =>
      i === 0 ? { ...r, pnlDay: -100_000 } : { ...r, pnlDay: 0 },
    );
    const { container } = render(
      <StatusStrip
        rows={losingRows}
        activeProfileName={null}
        profileCount={0}
        storageKey={storageKey}
      />,
    );
    expect(container.querySelector('.text-\\[color\\:var\\(--ds-accent-negative\\)\\]')).toBeTruthy();
  });
});
