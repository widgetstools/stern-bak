import { Copy, Info } from 'lucide-react';
import { FormatPopover } from '../format-editor';
import { EXCEL_EXAMPLES } from './excelExamples';
import { ChromeButton } from '../ChromeButton';

/**
 * Info popover with categorised Excel format examples. Clicking any
 * row populates the FormatterPicker's custom-format input via the
 * supplied callback AND closes this reference popover so the picker's
 * input gets immediate focus.
 *
 * Clipboard write happens too — a few users had complained that the
 * "click row" UX wasn't paste-elsewhere-friendly, and the cost is one
 * `navigator.clipboard.writeText()` call per click.
 *
 * Width is deliberately 420px — wide enough that long formats like
 * `[>0][Green]▲0.00;[<0][Red]▼0.00;0.00` don't wrap mid-token.
 */
export function ExcelReferencePopover({
  onPick,
  'data-testid': testId,
}: {
  onPick: (format: string) => void;
  'data-testid'?: string;
}) {
  return (
    <FormatPopover
      width={420}
      trigger={
        <ChromeButton
          type="button"
          title="Excel format reference"
          data-testid={testId}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 24,
            height: 24,
            padding: 0,
            background: 'var(--ds-surface-ground)',
            border: '1px solid var(--ds-border-secondary)',
            borderRadius: 2,
            color: 'var(--ds-text-muted)',
            cursor: 'pointer',
          }}
        >
          <Info size={12} strokeWidth={1.75} />
        </ChromeButton>
      }
    >
      {({ close }) => {
        const handleCopy = (format: string) => {
          // Swallow rejections — clipboard can fail on http:// origins, etc.
          void navigator.clipboard?.writeText(format).catch(() => {});
          onPick(format);
          close();
        };
        return (
      <div
        style={{
          padding: 8,
          maxHeight: 420,
          overflowY: 'auto',
          background: 'var(--ds-surface-primary)',
          fontFamily: 'var(--ds-font-sans)',
          scrollbarColor: 'var(--ds-border-primary) transparent',
          scrollbarWidth: 'thin',
        }}
      >
        {EXCEL_EXAMPLES.map((cat) => (
          <section key={cat.title} style={{ marginBottom: 10 }}>
            <h4
              style={{
                margin: '6px 4px 4px',
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'var(--ds-text-muted)',
              }}
            >
              {cat.title}
            </h4>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 2 }}>
              {cat.examples.map((ex) => {
                const id = `${cat.title}:${ex.format}`;
                const copyable = !ex.format.startsWith('—');
                return (
                  <li key={id}>
                    <ChromeButton
                      type="button"
                      onClick={() => copyable && handleCopy(ex.format)}
                      disabled={!copyable}
                      style={{
                        width: '100%',
                        display: 'grid',
                        gridTemplateColumns: '150px 1fr auto',
                        alignItems: 'center',
                        gap: 8,
                        padding: '4px 6px',
                        background: 'transparent',
                        border: '1px solid transparent',
                        borderRadius: 2,
                        cursor: copyable ? 'pointer' : 'default',
                        textAlign: 'left',
                        color: 'var(--ds-text-primary)',
                        fontFamily: 'inherit',
                        fontSize: 11,
                        transition: 'background 100ms, border-color 100ms',
                      }}
                      onMouseEnter={(e) => {
                        if (copyable) {
                          (e.currentTarget as HTMLButtonElement).style.background =
                            'var(--ds-surface-tertiary)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                      }}
                    >
                      <span style={{ color: 'var(--ds-text-secondary)' }}>{ex.label}</span>
                      <code
                        style={{
                          fontFamily: 'var(--ds-font-mono)',
                          fontSize: 11,
                          color: 'var(--ds-primary)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {ex.format}
                      </code>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: 10,
                          color: 'var(--ds-text-muted)',
                        }}
                      >
                        <span style={{ fontFamily: 'var(--ds-font-mono)' }}>{ex.sample}</span>
                        {copyable ? (
                          <Copy size={11} strokeWidth={1.75} style={{ opacity: 0.5 }} />
                        ) : null}
                      </span>
                    </ChromeButton>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
        );
      }}
    </FormatPopover>
  );
}
