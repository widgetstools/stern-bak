/**
 * STOMP snapshot path contract — mirrors `apps/demos/stomp-view-server` wire rules
 * so the worker rejects misconfigured historical triggers before publish.
 */

/** Client-specific live trigger: /snapshot/{positions|trades}/{clientId}/{rate}[/{batchSize}] */
export const TRIGGER_CLIENT_SPECIFIC =
  /^\/snapshot\/(positions|trades)\/([^/]+)\/(\d+)(?:\/(\d+))?$/;

/** Historical positions: /snapshot/positions/{clientId}/{asOfDate}[/{batchSize}] */
export const TRIGGER_AS_OF_DATE_POSITIONS =
  /^\/snapshot\/positions\/([^/]+)\/([^/]+)(?:\/(\d+))?$/;

/** Live subscription: /snapshot/{positions|trades}/{clientId} */
export const CLIENT_TOPIC_REGEX = /^\/snapshot\/(positions|trades)\/[^/]+$/;

/** Historical subscription: /snapshot/positions/{clientId}/{asOfDate} */
export const AS_OF_DATE_TOPIC_REGEX =
  /^\/snapshot\/positions\/([^/]+)\/([^/]+)$/;

export function parseAsOfDateSegment(segment: string): string | null {
  const isoDate = /^(\d{4})-(\d{2})-(\d{2})$/;
  const isoMatch = segment.match(isoDate);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (
      parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() === month - 1 &&
      parsed.getUTCDate() === day
    ) {
      return parsed.toISOString();
    }
    return null;
  }

  if (/^\d{8}$/.test(segment)) {
    const year = Number(segment.slice(0, 4));
    const month = Number(segment.slice(4, 6));
    const day = Number(segment.slice(6, 8));
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (
      parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() === month - 1 &&
      parsed.getUTCDate() === day
    ) {
      return parsed.toISOString();
    }
  }

  return null;
}

export type StompSnapshotMode = 'live' | 'historical' | 'unknown';

/** Classify a listener topic as live client, historical as-of-date, or unknown. */
export function classifyStompListenerTopic(listenerTopic: string): StompSnapshotMode {
  const historical = listenerTopic.match(AS_OF_DATE_TOPIC_REGEX);
  if (historical && parseAsOfDateSegment(historical[2] ?? '')) {
    return 'historical';
  }
  if (CLIENT_TOPIC_REGEX.test(listenerTopic)) {
    return 'live';
  }
  return 'unknown';
}

/**
 * Validate subscribe + publish destinations against the server contract.
 * Returns a human-readable error or null when wire-ready.
 */
export function validateStompPathContract(
  listenerTopic: string,
  requestMessage: string | undefined,
): string | null {
  const mode = classifyStompListenerTopic(listenerTopic);

  if (mode === 'historical') {
    if (!requestMessage) {
      return 'Historical STOMP snapshot requires requestMessage (trigger destination).';
    }

    const liveStyleAfterDate = requestMessage.match(
      /^\/snapshot\/positions\/([^/]+)\/([^/]+)\/(\d+)\/(\d+)$/,
    );
    if (liveStyleAfterDate && parseAsOfDateSegment(liveStyleAfterDate[2] ?? '')) {
      return (
        'Historical STOMP listener uses an as-of-date path but trigger looks like a live ' +
        'rate/batch path (expected /snapshot/positions/{clientId}/{asOfDate}[/{batchSize}]): ' +
        requestMessage
      );
    }

    const historical = requestMessage.match(TRIGGER_AS_OF_DATE_POSITIONS);
    if (historical && parseAsOfDateSegment(historical[2] ?? '')) {
      const listenerMatch = listenerTopic.match(AS_OF_DATE_TOPIC_REGEX);
      if (
        listenerMatch
        && historical[1] === listenerMatch[1]
        && historical[2] === listenerMatch[2]
      ) {
        return null;
      }
      return (
        'Historical STOMP trigger clientId/asOfDate must match listenerTopic: ' +
        `listener=${listenerTopic} trigger=${requestMessage}`
      );
    }
    if (TRIGGER_CLIENT_SPECIFIC.test(requestMessage)) {
      return (
        'Historical STOMP listener uses an as-of-date path but trigger looks like a live ' +
        'rate/batch path (expected /snapshot/positions/{clientId}/{asOfDate}[/{batchSize}]): ' +
        requestMessage
      );
    }
    return (
      'Invalid historical STOMP trigger (expected /snapshot/positions/{clientId}/{asOfDate}[/{batchSize}]): ' +
      requestMessage
    );
  }

  if (mode === 'live' && requestMessage) {
    if (TRIGGER_CLIENT_SPECIFIC.test(requestMessage)) {
      return null;
    }
    return (
      'Invalid live STOMP trigger (expected /snapshot/{positions|trades}/{clientId}/{rate}[/{batchSize}]): ' +
      requestMessage
    );
  }

  return null;
}
