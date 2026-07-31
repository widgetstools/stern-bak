import { useMemo, useState } from 'react';
import { ChevronRight, Search } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger, Input } from '@wellsfargo-starui/ui';
import { LAB_CATEGORIES } from '../guides/categories';

export interface LabSidebarNavItem {
  id: string;
  label: string;
}

export interface LabSidebarNavProps {
  items: LabSidebarNavItem[];
  activeId: string;
  onSelect: (id: string) => void;
  query: string;
  onQueryChange: (q: string) => void;
}

export function LabSidebarNav({ items, activeId, onSelect, query, onQueryChange }: LabSidebarNavProps) {
  const labelById = useMemo(() => new Map(items.map((i) => [i.id, i.label])), [items]);
  const known = useMemo(() => new Set(items.map((i) => i.id)), [items]);
  const q = query.trim().toLowerCase();

  return (
    <nav
      className="flex w-56 shrink-0 flex-col overflow-hidden border-r border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)]"
      data-testid="lab-sidebar"
    >
      <div className="relative shrink-0 px-2 py-2">
        <Search
          size={13}
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[color:var(--ds-text-secondary)]"
        />
        <Input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Filter features…"
          className="h-8 border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-secondary)] pl-7 text-[12px]"
          data-testid="lab-sidebar-filter"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {LAB_CATEGORIES.map((cat) => {
          const tabIds = cat.tabIds.filter((id) => known.has(id));
          const matches = q
            ? tabIds.filter((id) => (labelById.get(id) ?? id).toLowerCase().includes(q))
            : tabIds;
          if (matches.length === 0) return null;
          return (
            <NavGroup
              key={cat.id}
              groupId={cat.id}
              label={cat.label}
              tabIds={matches}
              labelById={labelById}
              activeId={activeId}
              onSelect={onSelect}
              forceOpen={q.length > 0}
            />
          );
        })}
      </div>
    </nav>
  );
}

function NavGroup({
  groupId,
  label,
  tabIds,
  labelById,
  activeId,
  onSelect,
  forceOpen,
}: {
  groupId: string;
  label: string;
  tabIds: string[];
  labelById: Map<string, string>;
  activeId: string;
  onSelect: (id: string) => void;
  forceOpen: boolean;
}) {
  const [open, setOpen] = useState(true);
  const isOpen = forceOpen || open;
  return (
    <Collapsible open={isOpen} onOpenChange={setOpen} className="mt-1">
      <CollapsibleTrigger
        className="flex w-full items-center gap-1 rounded px-1.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--ds-text-secondary)] hover:text-[color:var(--ds-text-primary)]"
        data-testid={`lab-nav-group-${groupId}`}
      >
        <ChevronRight size={12} className={`transition-transform ${isOpen ? 'rotate-90' : ''}`} />
        {label}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="mt-0.5 flex flex-col">
          {tabIds.map((id) => {
            const active = id === activeId;
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => onSelect(id)}
                  aria-current={active ? 'page' : undefined}
                  data-testid={`lab-tab-${id}`}
                  className={`flex w-full items-center rounded px-2 py-1.5 text-left text-[12px] transition-colors ${
                    active
                      ? 'bg-[color:var(--ds-surface-secondary)] font-medium text-[color:var(--ds-text-primary)] shadow-[var(--ds-elevation-card)]'
                      : 'text-[color:var(--ds-text-secondary)] hover:bg-[color:var(--ds-surface-secondary)] hover:text-[color:var(--ds-text-primary)]'
                  }`}
                >
                  {labelById.get(id) ?? id}
                </button>
              </li>
            );
          })}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}
