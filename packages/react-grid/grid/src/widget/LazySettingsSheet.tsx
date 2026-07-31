import {
  forwardRef,
  lazy,
  Suspense,
  type ForwardedRef,
  type ReactElement,
} from 'react';
import type { SettingsSheetHandle, SettingsSheetProps } from './SettingsSheet';

const LazySettingsSheetInner = lazy(async () => {
  const mod = await import('./SettingsSheet');
  return { default: mod.SettingsSheet };
});

/**
 * Warm the SettingsSheet chunk ahead of the first open. Hosts call this
 * on idle (MarketsGridHost) and on strong intent signals (the toolbar
 * ⋯ menu opening, hovering the inline settings button) so the first
 * click never pays the chunk load.
 *
 * Lives here — NOT inside the component — because the sheet only mounts
 * at open time, so an in-component preloader could never fire early
 * enough to matter.
 */
export function preloadSettingsSheet(): void {
  void import('./SettingsSheet');
}

export type LazySettingsSheetProps = SettingsSheetProps;

/**
 * Lazy-loaded settings sheet — defers ~475 LOC of JSX plus
 * `grid-chrome.css` until the user first opens settings.
 */
export const LazySettingsSheet = forwardRef<SettingsSheetHandle, LazySettingsSheetProps>(
  function LazySettingsSheet(props, ref) {
    return (
      <Suspense fallback={null}>
        <LazySettingsSheetInner ref={ref} {...props} />
      </Suspense>
    );
  },
) as (props: LazySettingsSheetProps & { ref?: ForwardedRef<SettingsSheetHandle> }) => ReactElement;
