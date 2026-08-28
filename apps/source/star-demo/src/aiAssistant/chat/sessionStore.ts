/**
 * Persists a conversation so closing the window doesn't throw the work away.
 *
 * Attachment payloads are STRIPPED before saving: images and files ride as
 * base64 data URIs and a couple of screenshots would blow localStorage's ~5 MB
 * quota, failing the write and losing the whole transcript. The chips stay, so
 * the restored conversation still reads correctly — the model just can't
 * re-examine an image from a previous session.
 *
 * A data-cell result (a query/pivot/summary payload — see `../dataTools`) is
 * the other thing that can get big, and unlike attachments it isn't stripped
 * outright: the side panel derives its entries straight from the LIVE
 * transcript, so a result the user is actually looking at right now must
 * still round-trip through a save. Only OLD ones — outside
 * `RECENT_ITEMS_KEPT_FULL` — have their row data dropped; see
 * `trimOldAnalysisPayloads`.
 */
import type { ChatMessage, ContentPart } from '../llmClient';
import type { TranscriptItem } from './useChatSession';
import { DATA_CELL, type DataCellPayload } from '../dataTools';

const KEY_PREFIX = 'aiAssistant.session';
/** Enough to keep a working session; old turns are the first thing to go. */
const MAX_TURNS = 40;
const PLACEHOLDER = '[attachment not kept in history]';
/**
 * How many of the most recent transcript items keep their data-cell payload
 * at full fidelity on save. A pivot widens a payload by COLUMN count, not
 * row count, so bounding by turn count (via item count, same proxy the
 * message trim above uses) rather than a byte budget keeps this simple and
 * consistent with the rest of the file, at the cost of being approximate.
 */
const RECENT_ITEMS_KEPT_FULL = 30;

export interface StoredSession {
  messages: ChatMessage[];
  transcript: TranscriptItem[];
  savedAt: number;
}

/** Scoped panels keep their own thread — "hide ISIN" means something different per grid. */
export function sessionKey(scopedGridId?: string): string {
  return scopedGridId ? `${KEY_PREFIX}.${scopedGridId}` : KEY_PREFIX;
}

function stripAttachments(content: ChatMessage['content']): ChatMessage['content'] {
  if (typeof content === 'string') return content;
  return content.map((part): ContentPart => {
    if (part.type === 'image_url') return { type: 'text', text: `[image ${PLACEHOLDER}]` };
    if (part.type === 'file') return { type: 'text', text: `[file: ${part.file.filename} ${PLACEHOLDER}]` };
    return part;
  });
}

function isDataCellResult(result: unknown): result is DataCellPayload {
  return typeof result === 'object' && result !== null && (result as { kind?: string }).kind === DATA_CELL;
}

/**
 * Degrades an OLD data-cell result to "here's what ran": `gridName`, `ran`,
 * `rowCount`, and (for a pivot) `table.pivot` all survive — only the row data
 * itself (`table.rows`, `digest.sample`) is dropped. A restored old analysis
 * therefore renders as a smaller, honestly-labelled version of itself rather
 * than vanishing or throwing; only the most recent
 * `RECENT_ITEMS_KEPT_FULL` items are left untouched.
 */
function trimOldAnalysisPayloads(transcript: TranscriptItem[]): TranscriptItem[] {
  const cutoff = transcript.length - RECENT_ITEMS_KEPT_FULL;
  return transcript.map((item, i) => {
    if (i >= cutoff || item.kind !== 'tool' || !isDataCellResult(item.activity.result)) return item;
    const payload = item.activity.result;
    if (!payload.table?.rows.length && !payload.digest?.sample.length) return item;
    return {
      ...item,
      activity: {
        ...item.activity,
        result: {
          ...payload,
          table: payload.table ? { ...payload.table, rows: [] } : undefined,
          digest: payload.digest ? { ...payload.digest, sample: [] } : undefined,
        } satisfies DataCellPayload,
      },
    };
  });
}

export function toStorable(messages: ChatMessage[], transcript: TranscriptItem[]): StoredSession {
  const trimmed = messages.length > MAX_TURNS * 3 ? [messages[0], ...messages.slice(-MAX_TURNS * 3)] : messages;
  return {
    messages: trimmed.map((m) => ({ ...m, content: stripAttachments(m.content) })),
    transcript: trimOldAnalysisPayloads(transcript.slice(-MAX_TURNS * 3)),
    savedAt: Date.now(),
  };
}

export function saveSession(key: string, messages: ChatMessage[], transcript: TranscriptItem[]): void {
  // A conversation is a convenience, never a reason to break the panel:
  // private mode, a full quota and a disabled store all fail silently.
  try {
    if (transcript.length === 0) {
      window.localStorage.removeItem(key);
      return;
    }
    window.localStorage.setItem(key, JSON.stringify(toStorable(messages, transcript)));
  } catch (err) {
    console.debug('[aiAssistant] conversation not saved:', err);
  }
}

export function loadSession(key: string): StoredSession | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (!Array.isArray(parsed.messages) || !Array.isArray(parsed.transcript)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearSession(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* nothing to clear */
  }
}
