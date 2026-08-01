import type { ReactNode } from 'react';
import { Button, cn } from '@wellsfargo-starui/ui';
import { TABLES, type TableKey } from '../types';

interface Counts {
  appConfig: number;
  appRegistry: number;
  userProfile: number;
  roles: number;
  permissions: number;
  pendingSync: number;
}

interface TableSidebarProps {
  selected: TableKey;
  counts: Counts;
  onSelect: (key: TableKey) => void;
}

export function TableSidebar({ selected, counts, onSelect }: TableSidebarProps) {
  return (
    <aside className="flex w-[220px] flex-col overflow-hidden border-r border-[var(--de-border)] bg-[var(--de-bg)]">
      <div className="px-4 pb-2 pt-3 text-[10px] font-bold uppercase tracking-[0.8px] text-[var(--de-text-tertiary)]">
        Tables
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-2">
        {TABLES.map((t) => {
          const isActive = t.key === selected;
          const count = counts[t.key];
          return (
            <Button
              key={t.key}
              type="button"
              variant="ghost"
              onClick={() => onSelect(t.key)}
              className={cn(
                'mb-0.5 h-auto w-full justify-between gap-2 px-2.5 py-2 text-left text-xs font-medium font-[var(--de-font)] shadow-none hover:bg-[var(--de-bg-hover)]',
                isActive
                  ? 'bg-[var(--de-accent-dim)] text-[var(--de-accent)] hover:bg-[var(--de-accent-dim)] hover:text-[var(--de-accent)]'
                  : 'text-[var(--de-text-secondary)]',
              )}
            >
              <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                {t.label}
              </span>
              <span
                className={cn(
                  'min-w-[22px] rounded px-1.5 py-px text-center font-[var(--de-mono)] text-[10px]',
                  isActive
                    ? 'bg-[var(--de-accent)] text-[var(--de-accent-foreground)]'
                    : 'bg-[var(--de-bg-surface)] text-[var(--de-text-tertiary)]',
                )}
              >
                {count}
              </span>
            </Button>
          );
        })}
      </nav>
    </aside>
  );
}
