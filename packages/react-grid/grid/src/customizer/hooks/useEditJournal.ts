import { useEffect, useMemo, useState } from 'react';
import type { EditJournal } from '@wellsfargo-starui/core';
import { getEditJournal } from '../editing/editJournalScope';
import { useGridPlatform } from './GridProvider';

/** Reactive shared EditJournal for toolbar + monitor panels. */
export function useEditJournal(): EditJournal {
  const platform = useGridPlatform();
  const journal = useMemo(() => getEditJournal(platform), [platform]);
  const [, setTick] = useState(0);

  useEffect(() => journal.subscribe(() => setTick((t) => t + 1)), [journal]);

  return journal;
}

/** Keep journal suspend in sync when settings.suspended toggles in the panel. */
export function useSyncJournalSuspend(suspended: boolean): void {
  const journal = useEditJournal();
  useEffect(() => {
    if (suspended) journal.suspend();
    else journal.resume();
  }, [journal, suspended]);
}
