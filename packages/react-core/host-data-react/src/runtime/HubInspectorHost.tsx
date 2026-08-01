/**
 * HubInspectorHost — mounts the inspector drawer and Alt+Shift+S chord.
 */

import { useState } from 'react';
import { HubInspectorDrawer } from './HubInspectorDrawer.js';
import { useChordHotkey } from './useChordHotkey.js';

const HUB_INSPECTOR_CHORDS = ['Alt+Shift+S'] as const;

export function HubInspectorHost(): React.ReactNode {
  const [open, setOpen] = useState(false);

  useChordHotkey(HUB_INSPECTOR_CHORDS, () => {
    setOpen((prev) => !prev);
  });

  return <HubInspectorDrawer open={open} onOpenChange={setOpen} />;
}
