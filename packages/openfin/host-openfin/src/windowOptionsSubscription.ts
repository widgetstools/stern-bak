/* eslint-disable @typescript-eslint/no-explicit-any */
declare const fin: any;

/**
 * Module-private subscription manager for the parent OpenFin window's
 * `options-changed` event. Multiple hooks (`useTabsHidden`,
 * `useColorLinking`, …) read from the same options object; without this
 * manager each one would attach its own `win.on('options-changed', …)`
 * listener and the runtime would fan out N copies of every event for
 * the same window.
 *
 * Outside an OpenFin runtime, `subscribeWindowOptions` is a noop.
 */

type OptionsCallback = (opts: unknown) => void;

const callbacks = new Set<OptionsCallback>();
let active: { win: any; handler: (evt: unknown) => void; lastOpts: unknown } | null = null;
let initPromise: Promise<void> | null = null;
let probedEventShape = false;

function isOpenFinWindowOptions(): boolean {
  return typeof fin !== 'undefined' && fin?.me?.getCurrentWindow;
}

function fireAll(opts: unknown): void {
  for (const cb of Array.from(callbacks)) {
    try {
      cb(opts);
    } catch (err) {
      console.warn('[windowOptionsSubscription] callback threw:', err);
    }
  }
}

function extractOptionsFromEvent(evt: unknown): unknown {
  if (!evt || typeof evt !== 'object') return null;
  const e = evt as any;
  if (e.options && typeof e.options === 'object' && e.options.workspacePlatform) return e.options;
  if (e.newOptions && typeof e.newOptions === 'object' && e.newOptions.workspacePlatform) return e.newOptions;
  if (e.workspacePlatform) return e;
  return null;
}

function ensureListener(): Promise<void> {
  if (active) return Promise.resolve();
  if (initPromise) return initPromise;
  if (!isOpenFinWindowOptions()) return Promise.resolve();

  initPromise = (async () => {
    try {
      const win = await fin.me.getCurrentWindow();
      const handler = (evt: unknown) => {
        if (!probedEventShape) {
          probedEventShape = true;
          const e = evt as any;
          // eslint-disable-next-line no-console
          console.log('[windowOptionsSubscription] options-changed event shape:', {
            keys: e && typeof e === 'object' ? Object.keys(e) : null,
            hasOptions: Boolean(e?.options),
            hasNewOptions: Boolean(e?.newOptions),
            hasDirectWorkspacePlatform: Boolean(e?.workspacePlatform),
          });
        }
        const direct = extractOptionsFromEvent(evt);
        if (direct) {
          if (active) active.lastOpts = direct;
          fireAll(direct);
          return;
        }
        void (async () => {
          try {
            const opts = await win.getOptions();
            if (active) active.lastOpts = opts;
            fireAll(opts);
          } catch (err) {
            console.warn('[windowOptionsSubscription] options re-read failed:', err);
          }
        })();
      };
      try {
        win.on('options-changed', handler);
      } catch (err) {
        console.warn('[windowOptionsSubscription] win.on failed:', err);
      }
      active = { win, handler, lastOpts: undefined };
      try {
        const opts = await win.getOptions();
        active.lastOpts = opts;
        fireAll(opts);
      } catch (err) {
        console.warn('[windowOptionsSubscription] initial getOptions failed:', err);
      }
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
}

export function subscribeWindowOptions(cb: OptionsCallback): () => void {
  if (!isOpenFinWindowOptions()) {
    return () => {
      /* noop — non-OpenFin */
    };
  }

  callbacks.add(cb);

  if (active) {
    if (active.lastOpts !== undefined) {
      try {
        cb(active.lastOpts);
      } catch (err) {
        console.warn('[windowOptionsSubscription] cached fire threw:', err);
      }
    }
  } else {
    void ensureListener();
  }

  return () => {
    if (!callbacks.delete(cb)) return;
    if (callbacks.size === 0 && active) {
      try {
        active.win.removeListener('options-changed', active.handler);
      } catch (err) {
        console.warn('[windowOptionsSubscription] removeListener failed:', err);
      }
      active = null;
    }
  };
}

export function __resetWindowOptionsSubscriptionForTests(): void {
  if (active) {
    try {
      active.win.removeListener('options-changed', active.handler);
    } catch {
      /* swallow */
    }
  }
  callbacks.clear();
  active = null;
  initPromise = null;
  probedEventShape = false;
}
