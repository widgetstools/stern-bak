/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from 'react';
import { subscribeWindowOptions } from './windowOptionsSubscription.js';

/**
 * Source-of-truth field path for color linking (live OpenFin
 * investigation pending — record the exact path here once verified
 * inside the reference workspace browser by toggling the *Link* button
 * and diffing `getOptions()` output).
 *
 * Two shapes are checked across OpenFin Workspace versions:
 *   - opts.workspacePlatform.colorLinking?.{ color, enabled }
 *   - opts.workspacePlatform.windowOptions?.{ color, linked }
 *
 * Whichever the runtime exposes wins. If neither is present we report
 * `{ color: null, linked: false }` so consumers in non-OpenFin or
 * pre-link-feature environments render unlinked.
 */
export interface ColorLinkingState {
  /** Hex string (e.g. `'#ff6e1b'` — an OpenFin color group value) or `null` when unlinked / unsupported. */
  color: string | null;
  /** True when the parent window is currently joined to a color link group. */
  linked: boolean;
}

export function deriveColorLinking(opts: unknown): ColorLinkingState {
  const fallback: ColorLinkingState = { color: null, linked: false };
  if (!opts || typeof opts !== 'object') return fallback;
  const wp = (opts as any).workspacePlatform;
  if (!wp || typeof wp !== 'object') return fallback;

  const cl = wp.colorLinking;
  if (cl && typeof cl === 'object') {
    const color = typeof cl.color === 'string' ? cl.color : null;
    const enabled = typeof cl.enabled === 'boolean' ? cl.enabled : color !== null;
    return { color, linked: enabled };
  }

  const winOpts = wp.windowOptions;
  if (winOpts && typeof winOpts === 'object') {
    const color = typeof winOpts.color === 'string' ? winOpts.color : null;
    const linked =
      typeof winOpts.linked === 'boolean' ? winOpts.linked : color !== null;
    return { color, linked };
  }

  return fallback;
}

/**
 * React state mirror of the parent OpenFin window's color-link state.
 * Reads from the same shared `options-changed` subscription as
 * `useTabsHidden`, so mounting both hooks in the same view costs a
 * single runtime listener.
 *
 * Outside an OpenFin runtime returns `{ color: null, linked: false }`
 * and attaches no listeners.
 */
export function useColorLinking(): ColorLinkingState {
  const [state, setState] = useState<ColorLinkingState>({ color: null, linked: false });

  useEffect(() => {
    const unsubscribe = subscribeWindowOptions((opts) => {
      const next = deriveColorLinking(opts);
      setState((prev) =>
        prev.color === next.color && prev.linked === next.linked ? prev : next,
      );
    });
    return unsubscribe;
  }, []);

  return state;
}
