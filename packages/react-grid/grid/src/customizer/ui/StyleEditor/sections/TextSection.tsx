import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  Strikethrough,
  Underline,
} from 'lucide-react';
import { radius, spacing } from '@wellsfargo-starui/design-system/tokens';
import {
  Band,
  Caps,
  PillToggleBtn,
  PillToggleGroup,
  Stepper,
  TDivider,
  TGroup,
} from '../../SettingsPanel';
import type { StyleEditorValue } from '../types';

/**
 * TYPE band — Cockpit Terminal.
 *
 * One horizontal toolbar:
 *   [B I U S]  [L C R J]  │  SZ [13] PX  WT [600]
 *
 * Fits at popout widths (~680px editor column). If the consumer renders
 * us in a narrow context the flex-wrap lets the toolbar fold onto a
 * second row automatically.
 */

export interface TextSectionProps {
  value: StyleEditorValue;
  onChange: (patch: Partial<StyleEditorValue>) => void;
  inlineBody?: boolean;
  index?: string;
}

export function TextSection({ value, onChange, inlineBody, index = '02' }: TextSectionProps) {
  const body = (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: spacing[1.5],
        flexWrap: 'wrap',
        padding: `${spacing[1.5]}px ${spacing[2]}px`,
        background: 'var(--ds-surface-secondary)',
        border: '1px solid var(--ds-border-primary)',
        borderRadius: radius.md,
      }}
    >
      <PillToggleGroup>
        <PillToggleBtn active={Boolean(value.bold)} onClick={() => onChange({ bold: !value.bold })} title="Bold">
          <Bold size={12} strokeWidth={2.25} />
        </PillToggleBtn>
        <PillToggleBtn
          active={Boolean(value.italic)}
          onClick={() => onChange({ italic: !value.italic })}
          title="Italic"
        >
          <Italic size={12} strokeWidth={2.25} />
        </PillToggleBtn>
        <PillToggleBtn
          active={Boolean(value.underline)}
          onClick={() => onChange({ underline: !value.underline })}
          title="Underline"
        >
          <Underline size={12} strokeWidth={2.25} />
        </PillToggleBtn>
        <PillToggleBtn
          active={Boolean(value.strikethrough)}
          onClick={() => onChange({ strikethrough: !value.strikethrough })}
          title="Strikethrough"
        >
          <Strikethrough size={12} strokeWidth={2.25} />
        </PillToggleBtn>
      </PillToggleGroup>

      <PillToggleGroup>
        <PillToggleBtn
          active={value.align === 'left'}
          onClick={() => onChange({ align: value.align === 'left' ? undefined : 'left' })}
          title="Align left"
        >
          <AlignLeft size={12} strokeWidth={2.25} />
        </PillToggleBtn>
        <PillToggleBtn
          active={value.align === 'center'}
          onClick={() => onChange({ align: value.align === 'center' ? undefined : 'center' })}
          title="Center"
        >
          <AlignCenter size={12} strokeWidth={2.25} />
        </PillToggleBtn>
        <PillToggleBtn
          active={value.align === 'right'}
          onClick={() => onChange({ align: value.align === 'right' ? undefined : 'right' })}
          title="Align right"
        >
          <AlignRight size={12} strokeWidth={2.25} />
        </PillToggleBtn>
        <PillToggleBtn
          active={value.align === 'justify'}
          onClick={() => onChange({ align: value.align === 'justify' ? undefined : 'justify' })}
          title="Justify"
        >
          <AlignJustify size={12} strokeWidth={2.25} />
        </PillToggleBtn>
      </PillToggleGroup>

      <TDivider />

      <TGroup>
        <Caps size="xs" style={{ paddingLeft: 4 }}>
          SZ
        </Caps>
        <Stepper
          value={value.fontSize !== undefined ? String(value.fontSize) : ''}
          onChange={(v) => {
            const t = v.trim();
            if (!t) return onChange({ fontSize: undefined });
            const n = Number(t);
            onChange({ fontSize: Number.isFinite(n) && n > 0 ? n : undefined });
          }}
        />
        <Caps size="xs" color="var(--ds-text-faint)" style={{ paddingRight: 4 }}>
          PX
        </Caps>
      </TGroup>

      <TGroup>
        <Caps size="xs" style={{ paddingLeft: 4 }}>
          WT
        </Caps>
        <Stepper
          value={value.fontWeight !== undefined ? String(value.fontWeight) : ''}
          onChange={(v) => {
            const t = v.trim();
            if (!t) return onChange({ fontWeight: undefined });
            const n = Number(t);
            const allowed: Array<400 | 500 | 600 | 700> = [400, 500, 600, 700];
            const next = (allowed as number[]).includes(n) ? (n as 400 | 500 | 600 | 700) : undefined;
            onChange({ fontWeight: next });
          }}
        />
      </TGroup>
    </div>
  );

  if (inlineBody) return body;
  return (
    <Band index={index} title="TYPE">
      {body}
    </Band>
  );
}
