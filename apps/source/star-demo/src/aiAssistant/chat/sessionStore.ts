/**
 * Persists a conversation so closing the window doesn't throw the work away.
 *
 * Attachment payloads are STRIPPED before saving: images and files ride as
 * base64 data URIs and a couple of screenshots would blow localStorage's ~5 MB
 * quota, failing the write and losing the whole transcript. The chips stay, so
 * the restored conversation still reads correctly — the model just can't
 * re-examine an image from a previous session.
 */
import type { ChatMessage, ContentPart } from '../llmClient';
import type { TranscriptItem } from './useChatSession';

const KEY_PREFIX = 'aiAssistant.session';
/** Enough to keep a working session; old turns are the first thing to go. */
const MAX_TURNS = 40;
const PLACEHOLDER = '[attachment not kept in history]';

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

export function toStorable(messages: ChatMessage[], transcript: TranscriptItem[]): StoredSession {
  const trimmed = messages.length > MAX_TURNS * 3 ? [messages[0], ...messages.slice(-MAX_TURNS * 3)] : messages;
  return {
    messages: trimmed.map((m) => ({ ...m, content: stripAttachments(m.content) })),
    transcript: transcript.slice(-MAX_TURNS * 3),
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
