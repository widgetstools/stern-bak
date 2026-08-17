/**
 * Toolbar-caption persistence, shared by both grid containers.
 *
 * The grid renders an `EditableCaption` unconditionally, so a container that
 * passes a static caption and no `onCaptionChange` lets the user edit a
 * label that dies on the next remount. This hook is the other half:
 *
 *   - the PERSISTED caption (grid-level data, via `useGridLevelPersistence`)
 *     wins over the `caption` prop, which is the initial / fallback value;
 *   - a commit writes back to grid-level data and chains the host's own
 *     `onCaptionChange`;
 *   - under OpenFin, a genuine POST-MOUNT change to the `caption` prop means
 *     the view tab was renamed externally ("Save Tab As…") — adopt it so the
 *     toolbar follows the tab and the new name is saved. The initial value is
 *     never adopted, so a caption stored before tab-name binding existed
 *     survives until the tab is actually renamed.
 *
 * Extracted from {@link MarketsGridContainer} when the SSRM container
 * adopted the same surface — the adoption rule is subtle enough that two
 * hand-written copies would drift.
 */
import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { isOpenFin } from '@wellsfargo-starui/openfin/host';

export interface UseContainerCaptionParams {
  /** The host's `caption` prop — initial value and external-rename source. */
  propCaption: string | undefined;
  persistedCaption: string | undefined;
  setPersistedCaption: Dispatch<SetStateAction<string | undefined>>;
  /** The host's own `onCaptionChange`, chained after the persist. */
  onCaptionChange?: (next: string) => void;
}

export interface ContainerCaption {
  /** Pass to MarketsGrid's `caption`. */
  caption: string | undefined;
  /** Pass to MarketsGrid's `onCaptionChange`. */
  onCaptionChange: (next: string) => void;
}

export function useContainerCaption(params: UseContainerCaptionParams): ContainerCaption {
  const { propCaption, persistedCaption, setPersistedCaption, onCaptionChange } = params;

  const handleCaptionChange = useCallback((next: string) => {
    setPersistedCaption(next);
    onCaptionChange?.(next);
  }, [setPersistedCaption, onCaptionChange]);

  const lastPropCaptionRef = useRef(propCaption);
  useEffect(() => {
    if (lastPropCaptionRef.current === propCaption) return;
    lastPropCaptionRef.current = propCaption;
    if (!isOpenFin()) return;
    if (propCaption && propCaption !== persistedCaption) {
      setPersistedCaption(propCaption);
    }
  }, [propCaption, persistedCaption, setPersistedCaption]);

  return { caption: persistedCaption ?? propCaption, onCaptionChange: handleCaptionChange };
}
