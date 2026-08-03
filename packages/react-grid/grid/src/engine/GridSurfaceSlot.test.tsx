/**
 * The attach invariant, asserted at the seam that enforces it.
 *
 * A stand-in grid mounting during the async Perspective attach fires
 * `onGridReady` (activating every module), then unmounts, and its
 * `onGridPreDestroyed` destroys the platform PERMANENTLY — after which the
 * real grid looks healthy while every platform-driven feature is silently
 * dead. This file's job is to fail loudly if that path ever reappears.
 *
 * The surfaces are mocked, not rendered: what is under test is WHICH one the
 * slot mounts and how many times, which a real AG Grid would only obscure.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import type { AgGridReact } from 'ag-grid-react';

const clientMounts = vi.fn();
const perspectiveMounts = vi.fn();

vi.mock('../widget/MarketsGridSurface.js', () => ({
  MarketsGridSurface: (props: Record<string, unknown>) => {
    clientMounts(props);
    return <div data-testid="client-surface" />;
  },
}));

vi.mock('./PerspectiveMarketsGridSurface.js', () => ({
  PerspectiveMarketsGridSurface: (props: Record<string, unknown>) => {
    perspectiveMounts(props);
    return <div data-testid="perspective-surface" />;
  },
}));

const { GridSurfaceSlot } = await import('./GridSurfaceSlot');

function baseProps() {
  return {
    gridRef: createRef<AgGridReact<unknown>>(),
    gridOptions: {},
    hostOverrideKeys: new Set<string>(),
    theme: undefined,
    rowData: [] as unknown[],
    columnDefs: [] as unknown[],
    onGridReady: vi.fn(),
    onGridPreDestroyed: vi.fn(),
  };
}

beforeEach(() => {
  clientMounts.mockClear();
  perspectiveMounts.mockClear();
});

describe('GridSurfaceSlot', () => {
  it('mounts the client surface by default', () => {
    render(<GridSurfaceSlot {...baseProps()} />);

    expect(screen.getByTestId('client-surface')).toBeTruthy();
    expect(perspectiveMounts).not.toHaveBeenCalled();
  });

  it('mounts NO grid while the Perspective attach is in flight', () => {
    render(<GridSurfaceSlot {...baseProps()} rowModel="perspective" perspectiveTable={null} />);

    expect(screen.getByTestId('grid-surface-pending')).toBeTruthy();
    // The whole point. A client grid here would fire onGridReady, activate
    // every module, then destroy the platform on unmount.
    expect(clientMounts).not.toHaveBeenCalled();
    expect(perspectiveMounts).not.toHaveBeenCalled();
  });

  it('mounts NO grid when the host asked for Perspective and wired no table', () => {
    render(<GridSurfaceSlot {...baseProps()} rowModel="perspective" />);

    expect(screen.getByTestId('grid-surface-pending')).toBeTruthy();
    expect(clientMounts).not.toHaveBeenCalled();
  });

  it('mounts the Perspective surface once the table arrives', () => {
    render(
      <GridSurfaceSlot
        {...baseProps()}
        rowModel="perspective"
        perspectiveTable={{ view: vi.fn() } as never}
        perspectiveKeyColumn="positionId"
      />,
    );

    expect(screen.getByTestId('perspective-surface')).toBeTruthy();
    expect(clientMounts).not.toHaveBeenCalled();
    expect(perspectiveMounts.mock.calls[0][0]).toMatchObject({ keyColumn: 'positionId' });
  });

  it('NEVER mounts a client grid across a delayed attach', () => {
    const props = baseProps();
    // t0: the hook is still attaching.
    const view = render(
      <GridSurfaceSlot {...props} rowModel="perspective" perspectiveTable={null} />,
    );
    expect(clientMounts).not.toHaveBeenCalled();

    // t1: a re-render while STILL attaching (a parent state change, a theme
    // swap — the ordinary churn that used to slip a stand-in grid through).
    view.rerender(
      <GridSurfaceSlot {...props} rowModel="perspective" perspectiveTable={null} />,
    );
    expect(clientMounts).not.toHaveBeenCalled();

    // t2: the table lands.
    view.rerender(
      <GridSurfaceSlot
        {...props}
        rowModel="perspective"
        perspectiveTable={{ view: vi.fn() } as never}
      />,
    );

    expect(screen.getByTestId('perspective-surface')).toBeTruthy();
    // Across the whole sequence, exactly one kind of grid was ever created,
    // and it was not the client one.
    expect(clientMounts).not.toHaveBeenCalled();
    expect(perspectiveMounts).toHaveBeenCalledTimes(1);
  });

  it('falls back to nothing — never to the client — if a table is withdrawn', () => {
    const props = baseProps();
    const view = render(
      <GridSurfaceSlot
        {...props}
        rowModel="perspective"
        perspectiveTable={{ view: vi.fn() } as never}
      />,
    );
    expect(screen.getByTestId('perspective-surface')).toBeTruthy();

    // A provider restart can drop the table before handing over a new one.
    view.rerender(
      <GridSurfaceSlot {...props} rowModel="perspective" perspectiveTable={null} />,
    );

    expect(screen.getByTestId('grid-surface-pending')).toBeTruthy();
    expect(clientMounts).not.toHaveBeenCalled();
  });

  it('forwards the worker query bridge and calc expressions to the surface', () => {
    const queries = { watchCount: vi.fn() } as never;
    render(
      <GridSurfaceSlot
        {...baseProps()}
        rowModel="perspective"
        perspectiveTable={{ view: vi.fn() } as never}
        perspectiveQueries={queries}
        perspectiveCalcExpressions={{ notional: '"price" * "qty"' }}
      />,
    );

    expect(perspectiveMounts.mock.calls[0][0]).toMatchObject({
      queries,
      calcExpressions: { notional: '"price" * "qty"' },
    });
  });
});
