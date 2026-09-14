const LOADED_ONLY =
  '[ssrm] Clipboard copy is the loaded cache, not the filtered book. Use Export to Excel for the full result set.';

/** AG Grid `sendToClipboard` — we still copy the text, but do not pretend it is the book. */
export function sendSsrmClipboard(params: { data?: string }): void {
  console.info(LOADED_ONLY);
  const text = params.data ?? '';
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    void navigator.clipboard.writeText(text);
    return;
  }
  if (typeof document === 'undefined') return;
  try {
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.style.cssText = 'position:fixed;left:-9999px';
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    el.remove();
  } catch {
    /* host has no clipboard */
  }
}
