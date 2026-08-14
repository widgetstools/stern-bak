import { memo, useState } from 'react';
import { ChromeButton } from '../../ui/ChromeButton';
import { SmartEditPanel } from '../smart-edit/SmartEditPanel.js';
import { BulkUpdatePanel } from '../bulk-update/BulkUpdatePanel';
import { PlusMinusPanel } from '../plus-minus/PlusMinusPanel.js';
import { ShortcutsPanel } from '../shortcuts/ShortcutsPanel.js';

/**
 * Merged Editing settings panel — one customizer entry for the former
 * smart-edit / bulk-update / plus-minus / shortcuts modules. Each section
 * is the pre-merge panel component unchanged (their root testids
 * included), behind a section strip.
 */

const SECTIONS = [
  { id: 'smart-edit', label: 'Smart Edit', Panel: SmartEditPanel },
  { id: 'bulk-update', label: 'Bulk Update', Panel: BulkUpdatePanel },
  { id: 'plus-minus', label: 'Plus / Minus', Panel: PlusMinusPanel },
  { id: 'shortcuts', label: 'Shortcuts', Panel: ShortcutsPanel },
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];

function EditingPanelInner() {
  const [active, setActive] = useState<SectionId>('smart-edit');
  const section = SECTIONS.find((s) => s.id === active) ?? SECTIONS[0];
  const Panel = section.Panel;

  return (
    <div className="ds-sheet-v2 flex h-full min-h-0 flex-col" data-testid="editing-panel">
      <div
        role="tablist"
        aria-label="Editing sections"
        className="flex shrink-0 items-center gap-1 border-b border-[color:var(--ds-border-primary)] px-3 py-1.5"
      >
        {SECTIONS.map((s) => (
          <ChromeButton
            key={s.id}
            type="button"
            role="tab"
            aria-selected={s.id === active}
            onClick={() => setActive(s.id)}
            data-testid={`editing-section-tab-${s.id}`}
            className="px-2 py-1 text-[11px]"
            style={
              s.id === active
                ? { color: 'var(--ds-accent-positive)', borderBottom: '1px solid var(--ds-accent-positive)' }
                : { color: 'var(--ds-text-secondary)' }
            }
          >
            {s.label}
          </ChromeButton>
        ))}
      </div>
      {/* The pre-merge sheet emitted `plus-minus-panel` / `shortcuts-panel`
          wrappers for the master-detail panes; keep those anchors here. */}
      <div
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
        data-testid={
          section.id === 'plus-minus'
            ? 'plus-minus-panel'
            : section.id === 'shortcuts'
              ? 'shortcuts-panel'
              : undefined
        }
      >
        <Panel />
      </div>
    </div>
  );
}

export const EditingPanel = memo(EditingPanelInner);
