import { describe, expect, it } from 'vitest';
import { toAttachment, buildUserContent, AttachmentError, MAX_FILE_BYTES, type Attachment } from './attachments';

/** jsdom's File + FileReader are real, so these exercise the actual decode path. */
function makeFile(name: string, type: string, contents = 'x', size?: number): File {
  const file = new File([contents], name, { type });
  if (size !== undefined) Object.defineProperty(file, 'size', { value: size });
  return file;
}

describe('toAttachment — images', () => {
  it('accepts the server-supported image types as data URIs', async () => {
    for (const type of ['image/png', 'image/jpeg', 'image/gif', 'image/webp']) {
      const att = await toAttachment(makeFile('shot.png', type));
      expect(att.kind).toBe('image');
      expect(att.data.startsWith('data:')).toBe(true);
    }
  });

  it('rejects SVG, which the server does not accept', async () => {
    await expect(toAttachment(makeFile('logo.svg', 'image/svg+xml'))).rejects.toBeInstanceOf(AttachmentError);
  });

  it('does not size-cap images (only text files are capped)', async () => {
    const att = await toAttachment(makeFile('big.png', 'image/png', 'x', MAX_FILE_BYTES * 4));
    expect(att.kind).toBe('image');
  });
});

describe('toAttachment — files', () => {
  it('accepts a text file by MIME', async () => {
    const att = await toAttachment(makeFile('notes.txt', 'text/plain'));
    expect(att.kind).toBe('file');
  });

  it('accepts a source file by extension even with an empty MIME', async () => {
    // Browsers frequently report "" for .ts/.tsx — the extension allowlist
    // is what saves these, matching the server's own fallback.
    const att = await toAttachment(makeFile('config.ts', ''));
    expect(att.kind).toBe('file');
  });

  it('rejects binaries the server cannot decode, naming the file', async () => {
    await expect(toAttachment(makeFile('report.pdf', 'application/pdf'))).rejects.toThrow(/report\.pdf/);
    await expect(toAttachment(makeFile('doc.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')))
      .rejects.toBeInstanceOf(AttachmentError);
  });

  it('rejects text files over the 1 MB decoded cap', async () => {
    await expect(toAttachment(makeFile('huge.json', 'application/json', 'x', MAX_FILE_BYTES + 1)))
      .rejects.toThrow(/1 MB/);
  });
});

describe('buildUserContent', () => {
  const image: Attachment = { id: '1', name: 'a.png', kind: 'image', data: 'data:image/png;base64,AAA', size: 3 };
  const file: Attachment = { id: '2', name: 'b.ts', kind: 'file', data: 'data:text/plain;base64,BBB', size: 3 };

  it('returns a plain string when there are no attachments', () => {
    expect(buildUserContent('hello', [])).toBe('hello');
  });

  it('emits the exact part shapes the server expects, attachments before text', () => {
    expect(buildUserContent('describe these', [image, file])).toEqual([
      { type: 'image_url', image_url: { url: 'data:image/png;base64,AAA' } },
      { type: 'file', file: { filename: 'b.ts', file_data: 'data:text/plain;base64,BBB' } },
      { type: 'text', text: 'describe these' },
    ]);
  });

  it('omits the text part when only attachments were sent', () => {
    expect(buildUserContent('', [image])).toEqual([
      { type: 'image_url', image_url: { url: 'data:image/png;base64,AAA' } },
    ]);
  });
});
