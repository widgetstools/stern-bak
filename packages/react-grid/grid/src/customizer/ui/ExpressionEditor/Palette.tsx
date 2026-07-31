import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Input } from '@wellsfargo-starui/ui';
import { useResolvedPortalContainer } from '../PortalContainer';
import { getPortalDomContext } from './editorDom';

/**
 * Generic keyboard-navigable palette modal.
 *
 * Used by both the Column palette (Ctrl+Shift+C) and Function palette
 * (Ctrl+Shift+F). Same contract, different data:
 *   - Opens centered over the viewport with a filter input auto-focused.
 *   - Live-filters items by substring match on `label` and any `keywords`.
 *   - Arrow keys move selection, Enter invokes `onPick`, Esc invokes `onClose`.
 *   - Click outside dismisses.
 *
 * Rendered via React portal into `document.body` so it escapes the settings
 * sheet's overflow clipping (same reason `PortalPopover` exists in the
 * conditional-styling panel).
 */
export interface PaletteItem {
  /** Stable identifier — used for React key AND passed back to `onPick`. */
  id: string;
  /** Primary label (bold line). */
  label: string;
  /** Secondary detail (dim, one line). */
  detail?: string;
  /** Optional third line — tooltip / description. Renders on the selected row. */
  description?: string;
  /** Optional group header shown above the row when it differs from the
   *  previous item's group (e.g. "Math", "String"). */
  group?: string;
  /** Extra searchable text (lowercased, matched against filter input). */
  keywords?: string[];
}

export interface PaletteProps {
  title: string;
  placeholder: string;
  items: PaletteItem[];
  onPick: (item: PaletteItem) => void;
  onClose: () => void;
  /** Optional subtitle under the title. */
  subtitle?: string;
}

export function Palette({ title, placeholder, items, onPick, onClose, subtitle }: PaletteProps) {
  const portalContainer = useResolvedPortalContainer();
  const portalDom = getPortalDomContext(portalContainer);
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return items;
    return items.filter((it) => {
      const hay = (it.label + ' ' + (it.detail ?? '') + ' ' + (it.keywords?.join(' ') ?? '')).toLowerCase();
      return hay.includes(q);
    });
  }, [items, filter]);

  // Reset selection when the filtered list collapses/expands.
  useEffect(() => {
    setSelected((s) => Math.min(s, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  // Keyboard navigation. Bound to window during lifetime so arrow keys work
  // even if focus drifts off the filter input.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelected((s) => Math.min(filtered.length - 1, s + 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSelected((s) => Math.max(0, s - 1)); return; }
      if (e.key === 'Enter') {
        e.preventDefault();
        const pick = filtered[selected];
        if (pick) onPick(pick);
        return;
      }
    };
    portalDom.window.addEventListener('keydown', onKey, true);
    return () => portalDom.window.removeEventListener('keydown', onKey, true);
  }, [filtered, selected, onPick, onClose, portalDom.window]);

  // Autofocus input on mount.
  useLayoutEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Scroll selected item into view as it changes.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${selected}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  // Click-outside dismiss.
  const shellRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (shellRef.current && !shellRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    portalDom.document.addEventListener('mousedown', onDown, true);
    return () => portalDom.document.removeEventListener('mousedown', onDown, true);
  }, [onClose, portalDom.document]);

  return createPortal(
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 10200,
        background: 'color-mix(in srgb, var(--ds-overlay-scrim, var(--ds-text-primary)) 55%, transparent)',
        backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '15vh',
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        ref={shellRef}
        style={{
          width: 560, maxWidth: '92vw', maxHeight: '70vh',
          background: 'var(--ds-surface-primary)',
          border: '1px solid var(--ds-border-primary)',
          borderRadius: 2,
          boxShadow: '0 20px 48px color-mix(in srgb, var(--ds-text-primary) 50%, transparent)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          fontFamily: 'var(--ds-font-sans)',
        }}
      >
        <div style={{ padding: '12px 14px 8px', borderBottom: '1px solid var(--ds-border-primary)' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ds-text-primary)', letterSpacing: 0.3 }}>{title}</div>
          {subtitle && <div style={{ fontSize: 10, color: 'var(--ds-text-muted)', marginTop: 2 }}>{subtitle}</div>}
          <Input
            ref={inputRef}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={placeholder}
            className="mt-2 h-7 w-full font-[family-name:var(--ds-font-mono)] text-xs"
          />
        </div>
        <div
          ref={listRef}
          style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}
        >
          {filtered.length === 0 && (
            <div style={{ padding: '12px 14px', fontSize: 11, color: 'var(--ds-text-muted)' }}>
              No matches for <code>{filter}</code>.
            </div>
          )}
          {filtered.map((it, idx) => {
            const prev = filtered[idx - 1];
            const showGroup = it.group && (!prev || prev.group !== it.group);
            const isSelected = idx === selected;
            return (
              <div key={it.id} data-idx={idx}>
                {showGroup && (
                  <div style={{
                    padding: '8px 14px 4px', fontSize: 10, fontWeight: 600,
                    textTransform: 'uppercase', letterSpacing: 0.8,
                    color: 'var(--ds-text-muted)',
                  }}>{it.group}</div>
                )}
                <div
                  onMouseEnter={() => setSelected(idx)}
                  onClick={() => onPick(it)}
                  style={{
                    padding: '6px 14px',
                    cursor: 'pointer',
                    background: isSelected ? 'var(--ds-primary-soft)' : 'transparent',
                    borderLeft: isSelected ? '2px solid var(--ds-primary)' : '2px solid transparent',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                    <span style={{
                      fontFamily: "'JetBrains Mono', Menlo, monospace",
                      fontSize: 12,
                      color: isSelected ? 'var(--ds-primary)' : 'var(--ds-text-primary)',
                      fontWeight: 500,
                    }}>{it.label}</span>
                    {it.detail && (
                      <span style={{ fontSize: 10, color: 'var(--ds-text-muted)' }}>{it.detail}</span>
                    )}
                  </div>
                  {isSelected && it.description && (
                    <div style={{
                      marginTop: 4, fontSize: 10, lineHeight: 1.5,
                      color: 'var(--ds-text-secondary)',
                    }}>{it.description}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{
          padding: '6px 14px', borderTop: '1px solid var(--ds-border-primary)',
          fontSize: 10, color: 'var(--ds-text-faint)',
          display: 'flex', gap: 14,
        }}>
          <span><kbd style={kbdStyle}>↑↓</kbd> navigate</span>
          <span><kbd style={kbdStyle}>↵</kbd> insert</span>
          <span><kbd style={kbdStyle}>Esc</kbd> close</span>
        </div>
      </div>
    </div>,
    portalContainer ?? portalDom.document.body,
  );
}

const kbdStyle: React.CSSProperties = {
  padding: '0 4px',
  borderRadius: 2,
  background: 'var(--ds-surface-secondary)',
  color: 'var(--ds-text-secondary)',
  fontFamily: "'JetBrains Mono', Menlo, monospace",
  fontSize: 10,
  border: '1px solid var(--ds-border-primary)',
};
