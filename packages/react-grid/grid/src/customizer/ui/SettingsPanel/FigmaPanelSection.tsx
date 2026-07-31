import { useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { SETTINGS_SECTION_TITLE } from './Cockpit';

/**
 * Numbered band section — the settings editor's section heading voice.
 * Replaces the old Figma-panel-section chrome with the trading-terminal
 * numbered-header look: `01 TITLE ────────────`.
 *
 * API is unchanged (the same `title` / `collapsed` / `onToggle` / `actions`
 * slots) so every existing consumer continues to work. The primitive
 * automatically allocates a per-instance numeric prefix based on its
 * creation order inside a single render — callers who want explicit
 * indices can pass `index` to override.
 */

export interface FigmaPanelSectionProps {
  title: string;
  /** Controlled collapsed flag. When omitted, section is uncontrolled. */
  collapsed?: boolean;
  onToggle?: () => void;
  /** Optional default for uncontrolled mode. Defaults to expanded. */
  defaultCollapsed?: boolean;
  /** Right-aligned header actions (GhostIcon buttons, typically). */
  actions?: ReactNode;
  children?: ReactNode;
  /** Optional numeric prefix shown in JetBrains Mono before the title. */
  index?: string;
  'data-testid'?: string;
}

// Cheap auto-index so callers that don't pass `index` still get a
// stable, deterministic "01/02/03" sequence per render tree.
let _autoIndex = 0;
function nextIndex(): string {
  _autoIndex = (_autoIndex % 99) + 1;
  return String(_autoIndex).padStart(2, '0');
}

export function FigmaPanelSection({
  title,
  collapsed,
  onToggle,
  defaultCollapsed = false,
  actions,
  children,
  index,
  ...rest
}: FigmaPanelSectionProps) {
  const [internalCollapsed, setInternalCollapsed] = useState(defaultCollapsed);
  const isControlled = collapsed !== undefined;
  const isCollapsed = isControlled ? collapsed : internalCollapsed;

  // Memoise the auto-generated index per instance lifetime.
  const resolvedIndex = useMemo(() => index ?? nextIndex(), [index]);

  const toggle = () => {
    if (isControlled) onToggle?.();
    else setInternalCollapsed((c) => !c);
  };

  return (
    <section
      className="px-5 pt-3.5 pb-1"
      data-testid={rest['data-testid']}
    >
      <header
        onClick={toggle}
        className="flex items-center gap-3 mb-3 cursor-pointer select-none"
      >
        <span className="inline-flex text-[color:var(--ds-text-muted)]">
          {isCollapsed ? <ChevronRight size={11} strokeWidth={2.25} /> : <ChevronDown size={11} strokeWidth={2.25} />}
        </span>
        <span className="font-mono text-xs tabular-nums tracking-[0.06em] text-[color:var(--ds-text-muted)]">
          {resolvedIndex}
        </span>
        <span className={SETTINGS_SECTION_TITLE}>
          {title}
        </span>
        <span className="flex-1 h-px bg-border" />
        {actions && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1"
          >
            {actions}
          </div>
        )}
      </header>
      {!isCollapsed && children !== undefined && <div>{children}</div>}
    </section>
  );
}
