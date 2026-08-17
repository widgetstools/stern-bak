/**
 * @vitest-environment jsdom
 *
 * The CSRM reverse gap. `useGridHost`'s generic option sync iterates
 * `Object.entries(gridOptions)`, so a key the pipeline STOPS emitting is
 * never visited and never pushed — and `statusBar` is exactly that shape,
 * because general-settings drops the key when SHOW STATUS BAR is off. The
 * client-side bar therefore stayed visible after being toggled off, while
 * the server-side one, whose surface already owned the option, did not.
 * Both surfaces now own it through this hook.
 */
import { describe, expect, it, vi } from 'vitest';
import * as React from 'react';
import { act, render } from '@testing-library/react';
import {
  EMPTY_STATUS_BAR,
  useStatusBarStrip,
  type StatusBarApiLike,
  type StatusBarValue,
} from './useStatusBarStrip';

function harness() {
  const setGridOption = vi.fn();
  const api: StatusBarApiLike = { setGridOption, isDestroyed: () => false };
  const pushed: Array<() => void> = [];

  function Probe({ statusBar }: { statusBar: StatusBarValue | undefined }) {
    const rootRef = React.useRef<HTMLDivElement | null>(null);
    const { statusBarProp, pushStatusBar } = useStatusBarStrip({
      statusBar,
      rootRef,
      getApi: () => api,
    });
    pushed[0] = pushStatusBar;
    React.useEffect(() => { pushStatusBar(); }, [statusBar, pushStatusBar]);
    return (
      <div ref={rootRef} data-testid="root" data-panels={String(statusBarProp.statusPanels.length)}>
        <div className="ag-status-bar" data-testid="strip" />
      </div>
    );
  }
  return { setGridOption, Probe, push: () => pushed[0]?.() };
}

const ONE_PANEL: StatusBarValue = {
  statusPanels: [{ statusPanel: 'agTotalRowCountComponent' }],
};

describe('useStatusBarStrip', () => {
  // AG Grid creates the status-bar container only when the option is set at
  // INIT, so "off" can never be `undefined` — a grid that booted without one
  // could never gain one.
  it('always hands the grid a container, even when the bar is off', () => {
    const { Probe } = harness();
    const { getByTestId } = render(<Probe statusBar={undefined} />);
    expect(getByTestId('root').getAttribute('data-panels')).toBe('0');
    expect(EMPTY_STATUS_BAR.statusPanels).toEqual([]);
  });

  it('pushes a value once and not again while it is unchanged', () => {
    const { setGridOption, Probe, push } = harness();
    render(<Probe statusBar={ONE_PANEL} />);
    expect(setGridOption).toHaveBeenCalledWith('statusBar', ONE_PANEL);
    setGridOption.mockClear();
    act(() => push());
    expect(setGridOption).not.toHaveBeenCalled();
  });

  // The gap itself: toggling SHOW STATUS BAR off makes the key disappear.
  it('pushes an empty container and hides the strip when the bar is turned off', () => {
    const { setGridOption, Probe } = harness();
    const { rerender, getByTestId } = render(<Probe statusBar={ONE_PANEL} />);
    expect(getByTestId('strip').style.display).toBe('');

    setGridOption.mockClear();
    rerender(<Probe statusBar={undefined} />);
    expect(setGridOption).toHaveBeenCalledWith('statusBar', EMPTY_STATUS_BAR);
    expect(getByTestId('strip').style.display).toBe('none');
  });

  it('shows the strip again when the bar is turned back on', () => {
    const { Probe, setGridOption } = harness();
    const { rerender, getByTestId } = render(<Probe statusBar={undefined} />);
    expect(getByTestId('strip').style.display).toBe('none');

    setGridOption.mockClear();
    rerender(<Probe statusBar={ONE_PANEL} />);
    expect(setGridOption).toHaveBeenCalledWith('statusBar', ONE_PANEL);
    expect(getByTestId('strip').style.display).toBe('');
  });

  // Recording before the api check swallowed changes that landed while the
  // grid was still initialising — profile hydration routinely beats
  // gridReady — which made customizer STATUS BAR edits apply intermittently.
  it('does not record a value that never reached a live api, so the catch-up lands it', () => {
    const setGridOption = vi.fn();
    let live: StatusBarApiLike | null = null;

    function Probe({ statusBar }: { statusBar: StatusBarValue | undefined }) {
      const rootRef = React.useRef<HTMLDivElement | null>(null);
      const { pushStatusBar } = useStatusBarStrip({ statusBar, rootRef, getApi: () => live });
      React.useEffect(() => { pushStatusBar(); }, [statusBar, pushStatusBar]);
      pushRef.current = pushStatusBar;
      return <div ref={rootRef}><div className="ag-status-bar" /></div>;
    }
    const pushRef: { current: (() => void) | null } = { current: null };

    render(<Probe statusBar={ONE_PANEL} />);
    expect(setGridOption).not.toHaveBeenCalled();

    // gridReady: the api exists now, and the catch-up push applies it.
    live = { setGridOption, isDestroyed: () => false };
    act(() => pushRef.current?.());
    expect(setGridOption).toHaveBeenCalledWith('statusBar', ONE_PANEL);
  });

  it('writes nothing to a destroyed grid', () => {
    const setGridOption = vi.fn();
    function Probe() {
      const rootRef = React.useRef<HTMLDivElement | null>(null);
      const { pushStatusBar } = useStatusBarStrip({
        statusBar: ONE_PANEL,
        rootRef,
        getApi: () => ({ setGridOption, isDestroyed: () => true }),
      });
      React.useEffect(() => { pushStatusBar(); }, [pushStatusBar]);
      return <div ref={rootRef} />;
    }
    render(<Probe />);
    expect(setGridOption).not.toHaveBeenCalled();
  });
});
