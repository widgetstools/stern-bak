import type { PlatformAdapter, ParentIdentity } from '@wellsfargo-starui/widget';

/**
 * BrowserAdapter — default PlatformAdapter for running widgets in a standard browser.
 * Uses window.open(), BroadcastChannel, and crypto.randomUUID().
 */
export class BrowserAdapter implements PlatformAdapter {
  readonly name = 'browser';
  readonly isOpenFin = false;

  private instanceId: string;
  private channel: BroadcastChannel;
  private saveHandlers: Array<() => Promise<void>> = [];
  private destroyHandlers: Array<() => void> = [];
  private settingsResultHandlers: Array<(result: unknown) => void> = [];
  private beforeUnloadHandler: () => void;

  constructor(private baseUrl: string = '') {
    this.instanceId = crypto.randomUUID();
    this.channel = new BroadcastChannel('star-widgets');

    this.channel.onmessage = (event) => {
      if (event.data?.type === 'settings-result' && event.data?.targetId === this.instanceId) {
        for (const handler of this.settingsResultHandlers) {
          handler(event.data.result);
        }
      }
    };

    this.beforeUnloadHandler = () => {
      for (const handler of this.destroyHandlers) {
        handler();
      }
    };
    window.addEventListener('beforeunload', this.beforeUnloadHandler);
  }

  async openWidget(type: string, data?: Record<string, unknown>): Promise<string> {
    const widgetId = crypto.randomUUID();
    const params = new URLSearchParams({ type, id: widgetId });
    if (data) {
      params.set('data', btoa(JSON.stringify(data)));
    }

    const url = `${this.baseUrl}/widget?${params}`;
    const win = window.open(url, `star-widget-${widgetId}`, 'width=1200,height=800');

    if (!win) {
      throw new Error('Failed to open widget window (popup blocked?)');
    }

    return widgetId;
  }

  async closeWidget(instanceId: string): Promise<void> {
    this.broadcast('widget-close', { instanceId });
  }

  broadcast(topic: string, data: unknown): void {
    this.channel.postMessage({ type: 'broadcast', topic, data, senderId: this.instanceId });
  }

  subscribe(topic: string, handler: (data: unknown) => void): () => void {
    const listener = (event: MessageEvent) => {
      if (
        event.data?.type === 'broadcast' &&
        event.data?.topic === topic &&
        event.data?.senderId !== this.instanceId
      ) {
        handler(event.data.data);
      }
    };

    this.channel.addEventListener('message', listener);
    return () => this.channel.removeEventListener('message', listener);
  }

  onPlatformSave(handler: () => Promise<void>): () => void {
    this.saveHandlers.push(handler);
    return () => {
      this.saveHandlers = this.saveHandlers.filter((h) => h !== handler);
    };
  }

  onPlatformDestroy(handler: () => void): () => void {
    this.destroyHandlers.push(handler);
    return () => {
      this.destroyHandlers = this.destroyHandlers.filter((h) => h !== handler);
    };
  }

  async openSettingsScreen(
    screenId: string,
    parentIdentity: ParentIdentity,
    data?: Record<string, unknown>,
  ): Promise<void> {
    const params = new URLSearchParams({
      screen: screenId,
      parentConfigId: parentIdentity.configId,
      parentInstanceId: parentIdentity.instanceId,
      parentViewId: parentIdentity.viewId,
    });
    if (data) {
      params.set('data', btoa(JSON.stringify(data)));
    }

    const url = `${this.baseUrl}/settings?${params}`;
    window.open(url, `star-settings-${screenId}`, 'width=800,height=600');
  }

  onSettingsResult(handler: (result: unknown) => void): () => void {
    this.settingsResultHandlers.push(handler);
    return () => {
      this.settingsResultHandlers = this.settingsResultHandlers.filter((h) => h !== handler);
    };
  }

  getInstanceId(): string {
    return this.instanceId;
  }

  getLaunchData(): Record<string, unknown> | null {
    try {
      const params = new URLSearchParams(window.location.search);
      const dataParam = params.get('data');
      if (dataParam) {
        return JSON.parse(atob(dataParam));
      }
    } catch {
      // Invalid data param
    }
    return null;
  }

  /** Trigger save handlers (called by useWidget during save) */
  async triggerSave(): Promise<void> {
    for (const handler of this.saveHandlers) {
      await handler();
    }
  }

  dispose(): void {
    this.channel.close();
    window.removeEventListener('beforeunload', this.beforeUnloadHandler);
  }
}
