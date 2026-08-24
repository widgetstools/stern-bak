/**
 * Attachment handling — turning dropped/pasted/picked files into the
 * multimodal content parts `copilotLLMServer` accepts.
 *
 * Every rule here mirrors the server's own validation
 * (`copilotLLMServer/src/messages.ts`) so a rejected file produces an
 * immediate, specific inline message instead of an opaque HTTP 400 after a
 * round trip. Keep the two in sync if the server changes.
 */
import type { ContentPart } from '../llmClient';

/** Server allowlist — note `image/svg+xml` is NOT supported. */
const IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

/** Decoded-byte cap the server enforces on `file` parts (images are exempt). */
export const MAX_FILE_BYTES = 1024 * 1024;

/**
 * Extensions the server treats as text documents. Mirrors TEXT_EXTENSIONS in
 * messages.ts — a file passes on either an allowed MIME or an allowed extension.
 */
const TEXT_EXTENSIONS = [
  'txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'jsonl', 'yaml', 'yml', 'xml', 'html', 'htm',
  'css', 'scss', 'js', 'jsx', 'ts', 'tsx', 'py', 'rb', 'go', 'rs', 'java', 'kt', 'c', 'h',
  'cpp', 'hpp', 'cs', 'php', 'sh', 'bash', 'ps1', 'sql', 'ini', 'toml', 'cfg', 'conf', 'log', 'env',
];

export interface Attachment {
  id: string;
  name: string;
  kind: 'image' | 'file';
  /** Data URI (image) or base64 payload (file). */
  data: string;
  size: number;
  /** Object URL for image thumbnails; revoke on removal. */
  previewUrl?: string;
}

export class AttachmentError extends Error {}

function extensionOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i === -1 ? '' : name.slice(i + 1).toLowerCase();
}

function isTextFile(file: File): boolean {
  const mime = file.type.toLowerCase();
  if (mime.startsWith('text/') || mime === 'application/json' || mime === 'application/xml') return true;
  return TEXT_EXTENSIONS.includes(extensionOf(file.name));
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new AttachmentError(`Couldn't read "${file.name}".`));
    reader.readAsDataURL(file);
  });
}

/**
 * Validates and converts one File. Throws `AttachmentError` with a message
 * worth showing the user verbatim.
 */
export async function toAttachment(file: File): Promise<Attachment> {
  const id = `att-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const mime = file.type.toLowerCase();

  if (mime.startsWith('image/')) {
    if (!IMAGE_MIMES.includes(mime)) {
      throw new AttachmentError(
        `${file.name}: ${mime || 'this image type'} isn't supported. Use PNG, JPEG, GIF or WebP.`,
      );
    }
    const data = await readAsDataUrl(file);
    return { id, name: file.name || 'screenshot.png', kind: 'image', data, size: file.size, previewUrl: URL.createObjectURL(file) };
  }

  if (!isTextFile(file)) {
    throw new AttachmentError(
      `${file.name}: only text documents can be attached — PDF, DOCX and other binaries aren't decoded. Paste the text instead.`,
    );
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new AttachmentError(
      `${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is 1 MB. Attach a smaller excerpt.`,
    );
  }
  const data = await readAsDataUrl(file);
  return { id, name: file.name, kind: 'file', data, size: file.size };
}

/** Builds the user turn's content: attachments first, then the typed text. */
export function buildUserContent(text: string, attachments: Attachment[]): string | ContentPart[] {
  if (attachments.length === 0) return text;
  const parts: ContentPart[] = attachments.map((a) =>
    a.kind === 'image'
      ? { type: 'image_url' as const, image_url: { url: a.data } }
      : { type: 'file' as const, file: { filename: a.name, file_data: a.data } },
  );
  if (text) parts.push({ type: 'text', text });
  return parts;
}

/** Extracts image/text files from a paste or drop, ignoring anything else. */
export function filesFromDataTransfer(dt: DataTransfer | null): File[] {
  if (!dt) return [];
  const out: File[] = [];
  for (const item of Array.from(dt.items ?? [])) {
    if (item.kind !== 'file') continue;
    const file = item.getAsFile();
    if (file) out.push(file);
  }
  if (out.length === 0 && dt.files?.length) out.push(...Array.from(dt.files));
  return out;
}
