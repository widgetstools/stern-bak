/**
 * IconTextEditor — authoring UI for `IconTextRendererConfig`.
 *
 * Surfaces an icon picker that resolves an icon id from
 * `@wellsfargo-starui/icons-svg`'s `MARKET_ICON_SVGS` catalogue into the
 * stored `iconSvg` (full SVG markup) at write time. The
 * renderer drops the markup into the cell verbatim.
 */
import { useMemo, useState } from 'react';
import { MARKET_ICON_SVGS } from '@wellsfargo-starui/design-system/icons/all-icons';
import { Button, Input, Popover, PopoverContent, PopoverTrigger, RadioGroup, RadioGroupItem, Label } from '@wellsfargo-starui/ui';
import type { IconTextRendererConfig } from '@wellsfargo-starui/design-system';
import { ChromeButton } from '../../../ui/ChromeButton';
import { Row } from '../editors/Row';
import { ThemeAwareColorRow } from './themeColorRow';

const DEFAULT_ICON_TEXT: IconTextRendererConfig = {
  iconId: '',
  iconSvg: '',
  position: 'left',
};

export function IconTextEditor({
  value,
  onChange,
  testId,
}: {
  value: IconTextRendererConfig | undefined;
  onChange: (next: IconTextRendererConfig) => void;
  testId?: string;
}) {
  const cfg = value ?? DEFAULT_ICON_TEXT;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ids = useMemo(() => Object.keys(MARKET_ICON_SVGS).sort(), []);
  const filtered = useMemo(
    () => (query ? ids.filter((id) => id.includes(query.toLowerCase())) : ids),
    [ids, query],
  );

  const pickIcon = (id: string) => {
    onChange({ ...cfg, iconId: id, iconSvg: MARKET_ICON_SVGS[id] ?? '' });
    setOpen(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Row
        label="ICON"
        control={
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }} data-testid={testId ? `${testId}-icon-trigger` : undefined}>
                {cfg.iconSvg ? (
                  <span
                    style={{ display: 'inline-flex', width: 16, height: 16 }}
                    dangerouslySetInnerHTML={{ __html: cfg.iconSvg }}
                  />
                ) : (
                  <span style={{ opacity: 0.5 }}>—</span>
                )}
                <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{cfg.iconId || 'pick'}</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent style={{ width: 320, padding: 8 }}>
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search icons…"
                style={{ height: 28, marginBottom: 6 }}
                data-testid={testId ? `${testId}-icon-search` : undefined}
              />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4, maxHeight: 240, overflow: 'auto' }}>
                {filtered.map((id) => (
                  <ChromeButton
                    key={id}
                    type="button"
                    onClick={() => pickIcon(id)}
                    title={id}
                    style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: 32, height: 32, padding: 4, border: '1px solid var(--ds-border-primary)',
                      background: cfg.iconId === id ? 'var(--ds-overlay-info-soft)' : 'transparent',
                      borderRadius: 2, cursor: 'pointer',
                    }}
                    data-testid={testId ? `${testId}-icon-${id}` : undefined}
                  >
                    <span
                      style={{ display: 'inline-flex', width: 20, height: 20 }}
                      dangerouslySetInnerHTML={{ __html: MARKET_ICON_SVGS[id] ?? '' }}
                    />
                  </ChromeButton>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        }
      />
      <Row
        label="POSITION"
        control={
          <RadioGroup
            value={cfg.position}
            onValueChange={(v) => onChange({ ...cfg, position: v as 'left' | 'right' })}
            style={{ display: 'flex', gap: 12 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <RadioGroupItem value="left" id="icon-pos-left" data-testid={testId ? `${testId}-pos-left` : undefined} />
              <Label htmlFor="icon-pos-left" style={{ fontSize: 11 }}>Left</Label>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <RadioGroupItem value="right" id="icon-pos-right" data-testid={testId ? `${testId}-pos-right` : undefined} />
              <Label htmlFor="icon-pos-right" style={{ fontSize: 11 }}>Right</Label>
            </div>
          </RadioGroup>
        }
      />
      <Row
        label="ICON COLOUR"
        hint="Optional — defaults to text colour"
        control={
          <ThemeAwareColorRow
            value={cfg.iconColor}
            onChange={(v) => onChange({ ...cfg, iconColor: v })}
            testIdPrefix={testId ? `${testId}-icon-color` : undefined}
          />
        }
      />
    </div>
  );
}
