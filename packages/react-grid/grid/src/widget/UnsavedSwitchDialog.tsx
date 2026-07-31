/**
 * UnsavedSwitchDialog — the AlertDialog fired by the profile switcher
 * when the user picks a different profile while the active one is
 * dirty. Three explicit actions — we never silently drop edits.
 *
 * View-only. The controller hook owns `pendingSwitch` state and the
 * Save/Discard handlers; this component is a thin shadcn AlertDialog
 * wrapper that maps `pendingSwitch !== null` to `open` and bridges
 * the action buttons to controller callbacks.
 */

import type { ReactElement } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../customizer/index.js'; // relative on purpose (self-reference breaks the dist build + risks barrel cycles)

export interface UnsavedSwitchDialogProps {
  readonly open: boolean;
  readonly onCancel: () => void;
  readonly onDiscard: () => void | Promise<void>;
  readonly onSave: () => void | Promise<void>;
}

export function UnsavedSwitchDialog({
  open,
  onCancel,
  onDiscard,
  onSave,
}: UnsavedSwitchDialogProps): ReactElement {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <AlertDialogContent data-testid="profile-switch-confirm">
        <AlertDialogHeader>
          <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
          <AlertDialogDescription>
            You have unsaved changes in the current profile. What do you want to
            do before switching?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="profile-switch-cancel">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            data-testid="profile-switch-discard"
            onClick={(e) => {
              e.preventDefault();
              void onDiscard();
            }}
          >
            Discard changes
          </AlertDialogAction>
          <AlertDialogAction
            data-testid="profile-switch-save"
            onClick={(e) => {
              e.preventDefault();
              void onSave();
            }}
          >
            Save &amp; switch
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
