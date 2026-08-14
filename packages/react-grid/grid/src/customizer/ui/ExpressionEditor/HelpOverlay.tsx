import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useResolvedPortalContainer } from '@wellsfargo-starui/react';
import { getPortalDomContext } from './editorDom';

/**
 * F1 help overlay — DSL cheat sheet.
 *
 * Static content; no input, no filtering. Rendered as a portal modal so it
 * escapes the settings sheet's clipping. Click-outside / Esc dismisses.
 *
 * Content is intentionally dense and code-like — traders authoring rules
 * don't need prose, they need to see the syntax and copy-paste examples.
 */
export function HelpOverlay({ onClose }: { onClose: () => void }) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  // Use the PortalContainer context (popout body when popped out,
  // document.body otherwise) so the overlay renders in the correct
  // window.
  const portalContainer = useResolvedPortalContainer();
  const portalDom = getPortalDomContext(portalContainer);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };
    portalDom.window.addEventListener('keydown', onKey, true);
    return () => portalDom.window.removeEventListener('keydown', onKey, true);
  }, [onClose, portalDom.window]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (shellRef.current && !shellRef.current.contains(e.target as Node)) onClose();
    };
    portalDom.document.addEventListener('mousedown', onDown, true);
    return () => portalDom.document.removeEventListener('mousedown', onDown, true);
  }, [onClose, portalDom.document]);

  return createPortal(
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 10200,
        background: 'color-mix(in srgb, var(--ds-overlay-scrim, var(--ds-text-primary)) 55%, transparent)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '8vh',
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Expression editor help"
    >
      <div
        ref={shellRef}
        style={{
          width: 720, maxWidth: '92vw', maxHeight: '82vh',
          background: 'var(--ds-surface-primary)',
          border: '1px solid var(--ds-border-primary)',
          borderRadius: 2,
          boxShadow: '0 20px 48px color-mix(in srgb, var(--ds-text-primary) 50%, transparent)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          fontFamily: 'var(--ds-font-sans)',
        }}
      >
        <div style={{
          padding: '12px 16px', borderBottom: '1px solid var(--ds-border-primary)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ds-text-primary)' }}>
              Expression Editor — Cheat Sheet
            </div>
            <div style={{ fontSize: 10, color: 'var(--ds-text-muted)', marginTop: 2 }}>
              <kbd style={kbdStyle}>F1</kbd> reopen &middot; <kbd style={kbdStyle}>Esc</kbd> close
            </div>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', fontSize: 11, lineHeight: 1.6, color: 'var(--ds-text-primary)' }}>
          <Section title="Column references">
            <Row code="[price]" note="Reference the `price` column of the current row." />
            <Row code="[settlementDate]" note="Any column id from the grid. Type `[` for autocomplete." />
            <Row code="{price}" note="Legacy syntax, still parses. Prefer `[price]`." muted />
            <Row code="data.price" note="Raw row access. Bypasses column remapping — useful inside functions." />
          </Section>

          <Section title="Comparison">
            <Row code="[price] > 110" />
            <Row code="[yield] &gt;= 5.0 AND [yield] &lt;= 8.0" />
            <Row code="[status] != 'CANCELLED'" />
            <Row code="[side] == 'BUY'" />
          </Section>

          <Section title="Logical & set">
            <Row code="[price] > 110 AND [side] == 'BUY'" />
            <Row code="[status] == 'FILLED' OR [status] == 'PARTIAL'" />
            <Row code="NOT ([price] &lt; 100)" />
            <Row code={"[venue] IN ['Direct', 'ICE', 'Tradeweb']"} note="Membership — matches any in the array." />
            <Row code="[quantity] BETWEEN 1000 AND 50000" note="Inclusive on both sides." />
          </Section>

          <Section title="Arithmetic">
            <Row code="[price] * [quantity]" />
            <Row code="([filled] / [quantity]) * 100" note="% filled" />
          </Section>

          <Section title="Common functions">
            <Row code="IF([price] > 110, 'high', 'normal')" />
            <Row code="AVG([price], [yield], [spread])" />
            <Row code="UPPER([security])" />
            <Row code="CONTAINS([security], 'TBA')" />
            <Row code={'YEAR([settlementDate])'} />
            <Row code="SUM([quantity], [filled])" note="Accepts 1–100 arguments." />
          </Section>

          <Section title="Hotkeys">
            <Row code="Ctrl+Space" note="Show all suggestions (columns + functions + keywords)." kbd />
            <Row code="Ctrl+Shift+C" note="Open Column palette — browse all columns with type info." kbd />
            <Row code="Ctrl+Shift+F" note="Open Function palette — 45+ functions grouped by category." kbd />
            <Row code="F1" note="This cheat sheet." kbd />
          </Section>
        </div>
      </div>
    </div>,
    portalContainer ?? portalDom.document.body,
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        fontSize: 10, fontWeight: 600, letterSpacing: 0.8,
        textTransform: 'uppercase',
        color: 'var(--ds-text-muted)',
        marginBottom: 6,
      }}>{title}</div>
      <div>{children}</div>
    </div>
  );
}

function Row({ code, note, muted, kbd }: { code: string; note?: string; muted?: boolean; kbd?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '3px 0', alignItems: 'baseline' }}>
      <code
        style={{
          fontFamily: "'JetBrains Mono', Menlo, monospace",
          fontSize: 11,
          minWidth: 260,
          color: muted ? 'var(--ds-text-muted)' : 'var(--ds-accent-warning)',
          background: kbd ? 'var(--ds-surface-secondary)' : 'transparent',
          padding: kbd ? '1px 6px' : 0,
          borderRadius: kbd ? 2 : 0,
          border: kbd ? '1px solid var(--ds-border-primary)' : 'none',
        }}
        dangerouslySetInnerHTML={{ __html: code.replace(/</g, '&lt;').replace(/>/g, '&gt;') }}
      />
      {note && <span style={{ fontSize: 10, color: 'var(--ds-text-secondary)', flex: 1 }}>{note}</span>}
    </div>
  );
}

const kbdStyle: React.CSSProperties = {
  padding: '0 4px', borderRadius: 2,
  background: 'var(--ds-surface-secondary)',
  color: 'var(--ds-text-secondary)',
  fontFamily: "'JetBrains Mono', Menlo, monospace",
  fontSize: 10,
  border: '1px solid var(--ds-border-primary)',
};
