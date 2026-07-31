import { useMemo, useState, type ReactNode } from 'react';
import { ScrollArea } from '@wellsfargo-starui/ui';
import { SHOWCASE_CATEGORIES } from '../showcase/types';
import { entriesByCategory } from '../showcase/registry';
import { ComponentDemo } from '../showcase/ComponentDemo';
import { OverviewSection } from '../showcase/sections/OverviewSection';
import { PaletteSection } from '../showcase/sections/PaletteSection';
import { TypographySection } from '../showcase/sections/TypographySection';
import { FoundationsSection } from '../showcase/sections/FoundationsSection';

type SectionId = 'overview' | 'palette' | 'typography' | 'foundations';

const SECTIONS: { id: SectionId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'palette', label: 'Palette' },
  { id: 'typography', label: 'Typography' },
  { id: 'foundations', label: 'Foundations' },
];

const SECTION_NODES: Record<SectionId, () => ReactNode> = {
  overview: OverviewSection,
  palette: PaletteSection,
  typography: TypographySection,
  foundations: FoundationsSection,
};

export function DesignSystemTab() {
  const [active, setActive] = useState<string>('overview');
  const byCategory = useMemo(() => entriesByCategory(), []);

  const sectionIds = new Set<string>(SECTIONS.map((s) => s.id));
  const ActiveSection = sectionIds.has(active)
    ? SECTION_NODES[active as SectionId]
    : null;
  const activeCategory = SHOWCASE_CATEGORIES.find((c) => c.id === active);

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden rounded-md border border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)]" data-testid="ds-designsystem">
      <nav className="flex w-52 shrink-0 flex-col gap-3 overflow-y-auto border-r border-[color:var(--ds-border-primary)] p-3">
        <NavGroup title="Foundations">
          {SECTIONS.map((s) => (
            <NavButton key={s.id} id={s.id} label={s.label} active={active === s.id} onSelect={setActive} />
          ))}
        </NavGroup>
        <NavGroup title="Components">
          {SHOWCASE_CATEGORIES.map((c) => (
            <NavButton key={c.id} id={c.id} label={c.label} active={active === c.id} onSelect={setActive} />
          ))}
        </NavGroup>
      </nav>

      <ScrollArea className="min-h-0 flex-1">
        <div className="p-6">
          {ActiveSection ? (
            <ActiveSection />
          ) : activeCategory ? (
            <div className="flex flex-col gap-4">
              <h2 className="text-[18px] font-semibold tracking-tight text-[color:var(--ds-text-primary)]">
                {activeCategory.label}
              </h2>
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                {(byCategory[activeCategory.id] ?? []).map((e) => (
                  <ComponentDemo key={e.id} entry={e} />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  );
}

function NavGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="px-1.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--ds-text-secondary)]">{title}</span>
      {children}
    </div>
  );
}

function NavButton({ id, label, active, onSelect }: { id: string; label: string; active: boolean; onSelect: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      aria-current={active ? 'page' : undefined}
      data-testid={`ds-section-${id}`}
      className={`rounded px-2 py-1.5 text-left text-[12px] transition-colors ${
        active
          ? 'bg-[color:var(--ds-surface-secondary)] font-medium text-[color:var(--ds-text-primary)]'
          : 'text-[color:var(--ds-text-secondary)] hover:bg-[color:var(--ds-surface-secondary)] hover:text-[color:var(--ds-text-primary)]'
      }`}
    >
      {label}
    </button>
  );
}
