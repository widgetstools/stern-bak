/**
 * EmojiGrid — emoji tile grid with click-to-copy. Each tile flashes a
 * "copied!" label for 900ms after a successful clipboard write. The
 * timer is held in a ref and cleared on unmount so StrictMode doesn't
 * fire the "setState on unmounted component" warning when the help
 * panel is dismissed while a flash is still in-flight.
 */

import { useEffect, useRef, useState } from 'react';
import { ChromeButton } from '../../customizer/internal.js'; // relative on purpose (self-reference breaks the dist build + risks barrel cycles)
import '../HelpPanel.css';

export function EmojiGrid({ items }: { items: Array<{ emoji: string; label: string }> }) {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);
  const copy = async (emoji: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(emoji);
      setCopiedIdx(idx);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(
        () => setCopiedIdx((cur) => (cur === idx ? null : cur)),
        900,
      );
    } catch {
      /* clipboard unavailable — no-op */
    }
  };
  return (
    <div className="ds-help-emoji-grid">
      {items.map((it, i) => {
        const copied = copiedIdx === i;
        return (
          <ChromeButton
            key={`${it.emoji}-${i}`}
            type="button"
            onClick={() => copy(it.emoji, i)}
            title={`Copy ${it.emoji}  ·  ${it.label}`}
            data-copied={copied ? 'true' : 'false'}
            className="ds-help-emoji-tile"
          >
            <span className="ds-help-emoji-glyph">{it.emoji}</span>
            <span className="ds-help-emoji-label">
              {copied ? 'copied!' : it.label}
            </span>
          </ChromeButton>
        );
      })}
    </div>
  );
}
