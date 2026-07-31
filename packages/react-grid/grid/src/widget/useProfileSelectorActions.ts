import { useCallback, useMemo, type ChangeEvent } from 'react';
import type { UseProfileManagerResult } from '../customizer/index.js'; // relative on purpose (self-reference breaks the dist build + risks barrel cycles)
import type { ProfileMeta } from '@wellsfargo-starui/engine';

export interface ProfileSelectorActions {
  readonly onCreate: (name: string) => void | Promise<unknown>;
  readonly onLoad: (id: string) => void;
  readonly onDelete: (id: string) => void | Promise<unknown>;
  readonly onClone: (id: string) => void | Promise<ProfileMeta | void>;
  readonly onRename: (id: string, name: string) => void | Promise<unknown>;
  readonly onExport: (id: string) => void | Promise<unknown>;
  readonly onImport: (file: File) => void | Promise<unknown>;
}

/**
 * Stable profile action callbacks for {@link PrimaryToolbar}. Presentation
 * glue (clone naming, export filename, import parse) lives here so memo'd
 * toolbar children don't receive fresh lambdas every render.
 */
export function useProfileSelectorActions(
  profiles: UseProfileManagerResult,
  onRequestLoadProfile: (id: string) => void,
): ProfileSelectorActions {
  const onCreate = useCallback(
    (name: string) => profiles.createProfile(name),
    [profiles],
  );

  const onLoad = useCallback(
    (id: string) => onRequestLoadProfile(id),
    [onRequestLoadProfile],
  );

  const onDelete = useCallback(
    (id: string) => profiles.deleteProfile(id),
    [profiles],
  );

  const onClone = useCallback(async (id: string) => {
    try {
      const src = profiles.profiles.find((p) => p.id === id);
      if (!src) return;
      const existingNames = new Set(profiles.profiles.map((p) => p.name));
      let candidate = `${src.name} (copy)`;
      let n = 2;
      while (existingNames.has(candidate)) {
        candidate = `${src.name} (copy ${n})`;
        n++;
      }
      return await profiles.cloneProfile(id, candidate);
    } catch (err) {
      console.warn('[markets-grid] profile clone failed:', err);
      window.alert(`Could not clone profile: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [profiles]);

  const onRename = useCallback(async (id: string, name: string) => {
    try {
      await profiles.renameProfile(id, name);
    } catch (err) {
      console.warn('[markets-grid] profile rename failed:', err);
      window.alert(`Could not rename profile: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [profiles]);

  const onExport = useCallback(async (id: string) => {
    try {
      const payload = await profiles.exportProfile(id);
      const fileStem = (payload.profile.name || id)
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60) || 'profile';
      const json = JSON.stringify(payload, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ds-profile-${fileStem}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      console.warn('[markets-grid] profile export failed:', err);
      window.alert(`Could not export profile: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [profiles]);

  const onImport = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      await profiles.importProfile(payload);
    } catch (err) {
      console.warn('[markets-grid] profile import failed:', err);
      window.alert(`Could not import profile: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [profiles]);

  return useMemo(
    () => ({
      onCreate,
      onLoad,
      onDelete,
      onClone,
      onRename,
      onExport,
      onImport,
    }),
    [onCreate, onLoad, onDelete, onClone, onRename, onExport, onImport],
  );
}

/** Stable handler for hidden file-input change events. */
export function useProfileImportInputHandler(
  onImport: (file: File) => void | Promise<void>,
): (event: ChangeEvent<HTMLInputElement>) => void {
  return useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) void onImport(file);
      event.target.value = '';
    },
    [onImport],
  );
}
