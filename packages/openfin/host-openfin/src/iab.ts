/**
 * InterApplicationBus seam — the only sanctioned way for framework packages
 * outside `packages/openfin` to publish/subscribe IAB topics or connect to a
 * Channel provider. Everything degrades to a noop outside OpenFin, so
 * callers need no environment branching of their own.
 */
import { isOpenFin } from './identity.js';

interface IabLike {
  publish?: (topic: string, payload: unknown) => Promise<void>;
  subscribe?: (
    source: { uuid: string },
    topic: string,
    handler: (data: unknown) => void,
  ) => Promise<void> | void;
  unsubscribe?: (
    source: { uuid: string },
    topic: string,
    handler: (data: unknown) => void,
  ) => Promise<void> | void;
  Channel?: {
    connect?: (channelName: string) => Promise<IabChannelClient>;
  };
}

function getIab(): IabLike | undefined {
  if (!isOpenFin()) return undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const iab = (globalThis as any).fin?.InterApplicationBus;
  return iab && typeof iab === 'object' ? (iab as IabLike) : undefined;
}

/**
 * Publish an IAB topic. Resolves as a noop outside OpenFin; inside OpenFin
 * rejections propagate so callers keep their own diagnostics.
 */
export function publishIabTopic(topic: string, payload: unknown): Promise<void> {
  const iab = getIab();
  if (!iab?.publish) return Promise.resolve();
  return Promise.resolve(iab.publish(topic, payload));
}

/**
 * Subscribe to an IAB topic from any sender (`{ uuid: '*' }` — the platform
 * provider's uuid differs from a tool window's own, so wildcard is the only
 * safe source filter). Returns an unsubscribe disposer; both legs are
 * best-effort and the whole call is a noop outside OpenFin.
 */
export function subscribeIabTopic(topic: string, handler: (data: unknown) => void): () => void {
  const iab = getIab();
  if (!iab?.subscribe) {
    return () => {
      /* noop — non-OpenFin */
    };
  }
  try {
    void iab.subscribe({ uuid: '*' }, topic, handler);
  } catch (err) {
    console.warn(`[iab] subscribe(${topic}) failed:`, err);
    return () => {
      /* nothing attached */
    };
  }
  return () => {
    try {
      void iab.unsubscribe?.({ uuid: '*' }, topic, handler);
    } catch {
      /* best-effort cleanup */
    }
  };
}

/** Structural subset of an IAB Channel client connection. */
export interface IabChannelClient {
  register(topic: string, handler: (payload?: unknown) => unknown): unknown;
  disconnect(): Promise<void>;
}

/**
 * Connect to an IAB Channel provider. Resolves `null` outside OpenFin or on
 * runtimes without the Channel API; connection errors propagate.
 */
export async function connectIabChannel(channelName: string): Promise<IabChannelClient | null> {
  const connect = getIab()?.Channel?.connect;
  if (typeof connect !== 'function') return null;
  return connect(channelName);
}
