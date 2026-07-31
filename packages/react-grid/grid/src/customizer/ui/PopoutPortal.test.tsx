import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { PopoutPortal, __resetPopoutPortalState } from './PopoutPortal';

/**
 * Unit tests for PopoutPortal. `window.open` is stubbed per test so we
 * can assert the portal's behavior without relying on a real browser
 * popup (blocked by jsdom). The stub returns a fake window wrapping a
 * detached Document — enough for React's portal to mount into.
 */

interface FakePopout {
  win: Window & { __fireUnload: () => void; __fireLoad: () => void };
  close: ReturnType<typeof vi.fn>;
  closed: boolean;
  document: Document;
}

function createFakePopout(): FakePopout {
  // A fresh document keyed off the current window's implementation.
  // Force readyState='complete' via defineProperty so PopoutPortal's
  // `waitForReady` resolves immediately without depending on a
  // `load` event our fake never fires.
  const doc = document.implementation.createHTMLDocument('popout');
  try {
    Object.defineProperty(doc, 'readyState', { value: 'complete', configurable: true });
  } catch { /* jsdom locks readyState on some builds — harmless */ }
  const close = vi.fn();
  const beforeunload = new Set<EventListener>();
  const loadListeners = new Set<EventListener>();
  const state = { closed: false };
  const win: Window & { __fireUnload: () => void; __fireLoad: () => void } = {
    document: doc,
    get closed() { return state.closed; },
    close: () => { state.closed = true; close(); },
    addEventListener: (event: string, fn: EventListener) => {
      if (event === 'beforeunload') beforeunload.add(fn);
      else if (event === 'load') loadListeners.add(fn);
    },
    removeEventListener: (event: string, fn: EventListener) => {
      if (event === 'beforeunload') beforeunload.delete(fn);
      else if (event === 'load') loadListeners.delete(fn);
    },
    // Helpers exposed for tests:
    //   - __fireUnload: drives the beforeunload → onClose path
    //   - __fireLoad: resolves all pending waitForReady + attachUnload
    //     chains the portal has queued (prepareDocument waits for it,
    //     and so does the close-detection effect when readyState !=
    //     'complete')
    __fireUnload: () => {
      for (const fn of beforeunload) fn(new Event('beforeunload'));
    },
    __fireLoad: () => {
      // Snapshot before invoking — handlers may re-subscribe.
      for (const fn of [...loadListeners]) fn(new Event('load'));
    },
  } as unknown as Window & { __fireUnload: () => void; __fireLoad: () => void };
  return { win, close, closed: state.closed, document: doc };
}

describe('PopoutPortal', () => {
  // Silence the [PopoutPortal] diagnostic logs the portal emits on
  // mount (added for OpenFin troubleshooting) — tests assert
  // behavior, not console traffic.
  let consoleInfoSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    __resetPopoutPortalState();
  });

  afterEach(() => {
    cleanup();
    consoleInfoSpy.mockRestore();
    vi.restoreAllMocks();
    __resetPopoutPortalState();
  });

  it('opens a window with the name + features passed via props', async () => {
    const fake = createFakePopout();
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => fake.win);

    render(
      <PopoutPortal name="ds-popout-test" title="Test" width={800} height={600} onClose={() => {}}>
        <div data-testid="child">hi</div>
      </PopoutPortal>,
    );
    await act(async () => { /* flush microtask queue */ });

    expect(openSpy).toHaveBeenCalledWith(
      '',
      'ds-popout-test',
      expect.stringContaining('width=800'),
    );
    expect(openSpy).toHaveBeenCalledWith(
      '',
      'ds-popout-test',
      expect.stringContaining('height=600'),
    );
  });

  it('renders children inside the popout document via createPortal', async () => {
    const fake = createFakePopout();
    vi.spyOn(window, 'open').mockImplementation(() => fake.win);

    render(
      <PopoutPortal name="t" title="T" onClose={() => {}}>
        <div data-testid="portalled-child">hello</div>
      </PopoutPortal>,
    );
    await act(async () => {});

    // The child should NOT be in the main document (we rendered into
    // the popout instead).
    expect(document.querySelector('[data-testid="portalled-child"]')).toBeNull();
    // But it SHOULD be inside the popout's document.
    expect(fake.document.querySelector('[data-testid="portalled-child"]')).not.toBeNull();
    // And inside the data-popout-root mount node.
    expect(fake.document.querySelector('[data-popout-root] [data-testid="portalled-child"]')).not.toBeNull();
    // Regression: there must be EXACTLY ONE mount node. An earlier
    // `useMemo` + appendChild pattern was a render-phase side
    // effect; React 19 StrictMode double-invokes useMemo so two
    // divs ended up in the body, and the empty first one overlaid
    // the second under OpenFin — the symptom was "popout opens but
    // shows no content". The mountNode is now a useEffect with
    // clean teardown, so only one is present.
    expect(fake.document.querySelectorAll('[data-popout-root]').length).toBe(1);
  });

  it('clones stylesheets from the main document into the popout head', async () => {
    // Seed a stylesheet on the main doc.
    const seed = document.createElement('style');
    seed.id = 'popout-test-seed';
    seed.textContent = '.marker-class { color: red; }';
    document.head.appendChild(seed);
    const fake = createFakePopout();
    vi.spyOn(window, 'open').mockImplementation(() => fake.win);

    render(
      <PopoutPortal name="t2" onClose={() => {}}>
        <div />
      </PopoutPortal>,
    );
    await act(async () => {});

    // The cloned stylesheet should be present in the popout's head.
    const seededClone = fake.document.getElementById('popout-test-seed');
    expect(seededClone).not.toBeNull();
    expect(seededClone?.textContent).toContain('.marker-class');

    document.head.removeChild(seed);
  });

  it('fires onClose when the popout emits beforeunload', async () => {
    const fake = createFakePopout();
    vi.spyOn(window, 'open').mockImplementation(() => fake.win);
    const onClose = vi.fn();

    render(
      <PopoutPortal name="t3" onClose={onClose}>
        <div />
      </PopoutPortal>,
    );
    await act(async () => {});

    // Simulate the user closing the popout window.
    (fake.win as unknown as { __fireUnload: () => void }).__fireUnload();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes the popout window when the portal unmounts', async () => {
    const fake = createFakePopout();
    vi.spyOn(window, 'open').mockImplementation(() => fake.win);

    const { unmount } = render(
      <PopoutPortal name="t4" onClose={() => {}}>
        <div />
      </PopoutPortal>,
    );
    await act(async () => {});

    expect(fake.close).not.toHaveBeenCalled();
    unmount();
    expect(fake.close).toHaveBeenCalled();
  });

  it('falls back to onClose when window.open returns null (popup blocker)', async () => {
    vi.spyOn(window, 'open').mockImplementation(() => null);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const onClose = vi.fn();

    render(
      <PopoutPortal name="t5" onClose={onClose}>
        <div />
      </PopoutPortal>,
    );
    await act(async () => {});

    expect(onClose).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });

  it('sets the popout document.title and syncs it when the title prop changes', async () => {
    const fake = createFakePopout();
    vi.spyOn(window, 'open').mockImplementation(() => fake.win);

    const { rerender } = render(
      <PopoutPortal name="title-a" title="Grid Customizer — grid-A" onClose={() => {}}>
        <div />
      </PopoutPortal>,
    );
    await act(async () => {});
    expect(fake.document.title).toBe('Grid Customizer — grid-A');

    // Prop change should update the popout's doc title (e.g. caller
    // swapped the active gridId or appended a profile name).
    rerender(
      <PopoutPortal name="title-a" title="Grid Customizer — grid-B" onClose={() => {}}>
        <div />
      </PopoutPortal>,
    );
    await act(async () => {});
    expect(fake.document.title).toBe('Grid Customizer — grid-B');
  });

  it('fires onWindowOpened exactly once with the opened Window reference', async () => {
    const fake = createFakePopout();
    vi.spyOn(window, 'open').mockImplementation(() => fake.win);
    const onWindowOpened = vi.fn();

    render(
      <PopoutPortal name="onopen" onClose={() => {}} onWindowOpened={onWindowOpened}>
        <div />
      </PopoutPortal>,
    );
    await act(async () => {});

    expect(onWindowOpened).toHaveBeenCalledTimes(1);
    expect(onWindowOpened).toHaveBeenCalledWith(fake.win);
  });

  it('uses a custom openWindow callback when provided (OpenFin path)', async () => {
    const fake = createFakePopout();
    const customOpen = vi.fn(async () => fake.win);

    render(
      <PopoutPortal name="t6" onClose={() => {}} openWindow={customOpen}>
        <div data-testid="openfin-child">via openfin</div>
      </PopoutPortal>,
    );
    await act(async () => {});

    expect(customOpen).toHaveBeenCalledWith({ name: 't6', width: 900, height: 700, alwaysOnTop: false, frame: true });
    // Child still lands in the fake-OpenFin document.
    expect(fake.document.querySelector('[data-testid="openfin-child"]')).not.toBeNull();
  });

  it('auto-resizes the popout when a Radix popover mounts, and shrinks back when it unmounts', async () => {
    const fake = createFakePopout();
    const resizeTo = vi.fn();
    (fake.win as unknown as { resizeTo: typeof resizeTo }).resizeTo = resizeTo;
    vi.spyOn(window, 'open').mockImplementation(() => fake.win);

    render(
      <PopoutPortal name="auto-r" onClose={() => {}} width={900} height={120} expandedHeight={600}>
        <div />
      </PopoutPortal>,
    );
    await act(async () => {});

    // Simulate a Radix popover mounting inside the popout body by
    // inserting a node with the standard wrapper attribute. The
    // MutationObserver should trigger a grow call.
    await act(async () => {
      const wrapper = fake.document.createElement('div');
      wrapper.setAttribute('data-radix-popper-content-wrapper', '');
      fake.document.body.appendChild(wrapper);
      // MutationObserver fires microtask-queued; flush.
      await Promise.resolve();
    });
    expect(resizeTo).toHaveBeenCalledWith(900, 600);

    // Remove the popover — shrink back to the base height.
    await act(async () => {
      const wrapper = fake.document.querySelector('[data-radix-popper-content-wrapper]');
      wrapper?.remove();
      await Promise.resolve();
    });
    expect(resizeTo).toHaveBeenCalledWith(900, 120);
  });

  it('ignores early beforeunload before the popout document is ready (OpenFin about:blank race)', async () => {
    // Regression for "opens and immediately closes" under OpenFin:
    // the initial about:blank navigation could fire a synthetic
    // beforeunload, which we'd misinterpret as "user closed" and
    // tear the window down. Fix: only attach the beforeunload
    // listener once `document.readyState === 'complete'` OR the
    // `load` event has fired.
    //
    // This test verifies the NEGATIVE path: with readyState !=
    // 'complete', an early beforeunload is a no-op. The positive
    // "beforeunload works once ready" path is covered by the
    // existing `fires onClose when the popout emits beforeunload`
    // test (which runs against a ready doc).
    const fake = createFakePopout();
    Object.defineProperty(fake.document, 'readyState', { value: 'loading', configurable: true });

    vi.spyOn(window, 'open').mockImplementation(() => fake.win);
    const onClose = vi.fn();

    render(
      <PopoutPortal name="early-unload" onClose={onClose}>
        <div />
      </PopoutPortal>,
    );
    await act(async () => {});

    // Fire beforeunload BEFORE the load event has fired. The close-
    // detection effect has only registered a `load` listener at
    // this point, not a `beforeunload` listener — so __fireUnload
    // is a no-op and onClose isn't invoked.
    fake.win.__fireUnload();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('passes alwaysOnTop=true through to the openWindow callback when set', async () => {
    // The browser `window.open` path ignores `alwaysOnTop` (web
    // platform has no always-on-top), but the custom openWindow
    // path forwards it — this is how OpenFin's `fin.Window.create`
    // receives the flag.
    const fake = createFakePopout();
    const customOpen = vi.fn(async () => fake.win);

    render(
      <PopoutPortal name="t7" onClose={() => {}} alwaysOnTop openWindow={customOpen}>
        <div />
      </PopoutPortal>,
    );
    await act(async () => {});

    expect(customOpen).toHaveBeenCalledWith(
      expect.objectContaining({ alwaysOnTop: true }),
    );
  });
});
