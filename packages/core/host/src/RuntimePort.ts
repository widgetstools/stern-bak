import type {
  AppDataSnapshot,
  IdentitySnapshot,
  SurfaceHandle,
  SurfaceSpec,
  Theme,
  Unsubscribe,
} from '@wellsfargo-starui/types';

/**
 * RuntimePort — abstracts browser vs OpenFin host capabilities.
 * Grid and engine code depend on this interface, never on `@openfin/core`.
 */
export interface RuntimePort {
  readonly name: 'browser' | 'openfin' | string;
  resolveIdentity(): IdentitySnapshot;
  openSurface(spec: SurfaceSpec): Promise<SurfaceHandle>;
  getTheme(): Theme;
  setTheme(theme: Theme): void;
  onThemeChanged(fn: (theme: Theme) => void): Unsubscribe;
  onWindowShown(fn: () => void): Unsubscribe;
  onWindowClosing(fn: () => void): Unsubscribe;
  onCustomDataChanged(fn: (customData: Readonly<Record<string, unknown>>) => void): Unsubscribe;
  onWorkspaceSave(fn: () => void | Promise<void>): Unsubscribe;
  dispose(): void;
}
