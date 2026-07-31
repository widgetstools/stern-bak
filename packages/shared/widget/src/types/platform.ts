/**
 * ParentIdentity — identifies a parent widget when opening settings screens.
 */
export interface ParentIdentity {
  configId: string;
  instanceId: string;
  viewId: string;
}

/**
 * PlatformAdapter — abstracts browser vs OpenFin (or other platforms).
 * BrowserAdapter lives in `@wellsfargo-starui/widget-browser`; OpenFin adapters in platform shells.
 */
export interface PlatformAdapter {
  readonly name: string;
  readonly isOpenFin: boolean;

  openWidget(type: string, data?: Record<string, unknown>): Promise<string>;
  closeWidget(instanceId: string): Promise<void>;

  broadcast(topic: string, data: unknown): void;
  subscribe(topic: string, handler: (data: unknown) => void): () => void;

  onPlatformSave(handler: () => Promise<void>): () => void;
  onPlatformDestroy(handler: () => void): () => void;

  openSettingsScreen(
    screenId: string,
    parentIdentity: ParentIdentity,
    data?: Record<string, unknown>,
  ): Promise<void>;
  onSettingsResult(handler: (result: unknown) => void): () => void;

  getInstanceId(): string;
  getLaunchData(): Record<string, unknown> | null;
}
