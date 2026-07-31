import { ArrowRight, Layers, Settings2, Save, SlidersHorizontal } from 'lucide-react';
import { Badge, Card, CardContent, ScrollArea } from '@wellsfargo-starui/ui';
import { LAB_CATEGORIES } from '../guides/categories';
import { getFeatureGuide } from '../guides/featureGuides';

export interface HomeTabItem {
  id: string;
  label: string;
}

export interface HomeTabProps {
  items: HomeTabItem[];
  onNavigate: (id: string) => void;
}

const MOUNT_SNIPPET = `import { MarketsGrid, createMarketsGridLocalStorageStorage } from '@wellsfargo-starui/grid';

const storage = createMarketsGridLocalStorageStorage();

<MarketsGrid
  gridId="positions"
  rowData={rows}
  columnDefs={columns}
  rowIdField="id"
  storage={storage}
  showProfileSelector
  showSettingsButton
/>;`;

const MENTAL_MODEL = [
  {
    icon: Layers,
    title: 'Profiles',
    body: 'A saved snapshot of every setting under a gridId. Clone, export, import.',
    tabId: 'profiles',
  },
  {
    icon: SlidersHorizontal,
    title: 'Modules',
    body: 'Feature units — conditional styling, alerts, calculated columns…',
    tabId: 'conditional',
  },
  {
    icon: Settings2,
    title: 'Settings sheet',
    body: 'The gear button — where you configure modules without code.',
    tabId: 'overview',
  },
  {
    icon: Save,
    title: 'Toolbars',
    body: 'Filters, formatting and editing surfaces for live, in-grid config.',
    tabId: 'toolbar',
  },
];

const RECOMMENDED_PATH = ['overview', 'formatting', 'conditional', 'editing', 'profiles'];

// ── Sub-components ────────────────────────────────────────────────────────────

function HeroSection() {
  return (
    <header className="flex flex-col gap-2">
      <Badge
        variant="outline"
        className="w-fit border-[color:var(--ds-border-primary)] text-[10px] uppercase tracking-wide text-[color:var(--ds-text-secondary)]"
      >
        Developer onboarding
      </Badge>
      <h1 className="text-[24px] font-semibold tracking-tight text-[color:var(--ds-text-primary)]">
        MarketsGrid: a config-driven enterprise data grid
      </h1>
      <p className="max-w-[70ch] text-[14px] text-[color:var(--ds-text-secondary)]">
        Mount one component, then configure everything — formatting, styling, grouping,
        editing, alerts — through the grid&apos;s own UI. Settings are saved as
        <strong className="text-[color:var(--ds-text-primary)]"> profiles</strong>, so you
        ship behaviour as data, not bespoke React. This lab walks each capability with a live
        grid, steps to try, and the config behind it.
      </p>
    </header>
  );
}

function MountSnippetSection() {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[color:var(--ds-text-secondary)]">
        Mount in 30 seconds
      </h2>
      <pre className="overflow-x-auto rounded-md border border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] p-3 text-[12px] leading-relaxed text-[color:var(--ds-text-primary)]">
        <code>{MOUNT_SNIPPET}</code>
      </pre>
      <p className="text-[12px] text-[color:var(--ds-text-secondary)]">
        That is the only code you write. Everything else is configured in the UI and persisted
        to the profile under <code>gridId</code>.
      </p>
    </section>
  );
}

interface MentalModelSectionProps {
  known: Set<string>;
  onNavigate: (id: string) => void;
}

function MentalModelSection({ known, onNavigate }: MentalModelSectionProps) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[color:var(--ds-text-secondary)]">
        The mental model
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {MENTAL_MODEL.map((m) => {
          const Icon = m.icon;
          const can = known.has(m.tabId);
          return (
            <button
              key={m.title}
              type="button"
              disabled={!can}
              onClick={() => onNavigate(m.tabId)}
              className={`w-full text-left ${can ? 'cursor-pointer' : 'cursor-default'}`}
            >
              <Card className="border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] transition-colors hover:border-[color:var(--ds-text-secondary)]">
                <CardContent className="flex flex-col gap-2 p-4">
                  <Icon size={18} className="text-[color:var(--ds-text-secondary)]" />
                  <h3 className="text-[13px] font-semibold text-[color:var(--ds-text-primary)]">{m.title}</h3>
                  <p className="text-[12px] text-[color:var(--ds-text-secondary)]">{m.body}</p>
                </CardContent>
              </Card>
            </button>
          );
        })}
      </div>
    </section>
  );
}

interface RecommendedPathSectionProps {
  labelById: Map<string, string>;
  known: Set<string>;
  onNavigate: (id: string) => void;
}

function RecommendedPathSection({ labelById, known, onNavigate }: RecommendedPathSectionProps) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[color:var(--ds-text-secondary)]">
        Recommended path
      </h2>
      <ol className="flex flex-wrap items-center gap-2 text-[12px]">
        {RECOMMENDED_PATH.filter((id) => known.has(id)).map((id, i, arr) => (
          <li key={id} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onNavigate(id)}
              className="rounded border border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] px-2 py-1 text-[color:var(--ds-text-primary)] hover:bg-[color:var(--ds-surface-secondary)]"
            >
              {i + 1}. {labelById.get(id) ?? id}
            </button>
            {i < arr.length - 1 && <ArrowRight size={13} className="text-[color:var(--ds-text-secondary)]" />}
          </li>
        ))}
      </ol>
    </section>
  );
}

interface FeatureMapSectionProps {
  labelById: Map<string, string>;
  known: Set<string>;
  onNavigate: (id: string) => void;
}

function FeatureMapSection({ labelById, known, onNavigate }: FeatureMapSectionProps) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[color:var(--ds-text-secondary)]">
        Feature map
      </h2>
      {LAB_CATEGORIES.map((cat) => {
        const tabIds = cat.tabIds.filter((id) => id !== 'home' && known.has(id));
        if (tabIds.length === 0) return null;
        return (
          <div key={cat.id} className="flex flex-col gap-2">
            <h3 className="text-[12px] font-medium text-[color:var(--ds-text-secondary)]">{cat.label}</h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {tabIds.map((id) => {
                const guide = getFeatureGuide(id);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onNavigate(id)}
                    data-testid={`lab-home-card-${id}`}
                    className="group flex flex-col gap-1 rounded-md border border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] p-3 text-left transition-colors hover:border-[color:var(--ds-text-secondary)]"
                  >
                    <span className="flex items-center justify-between text-[13px] font-semibold text-[color:var(--ds-text-primary)]">
                      {labelById.get(id) ?? id}
                      <ArrowRight
                        size={13}
                        className="text-[color:var(--ds-text-secondary)] opacity-0 transition-opacity group-hover:opacity-100"
                      />
                    </span>
                    <span className="text-[12px] text-[color:var(--ds-text-secondary)]">
                      {guide?.summary ?? ''}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </section>
  );
}

// ── Root component ────────────────────────────────────────────────────────────

export function HomeTab({ items, onNavigate }: HomeTabProps) {
  const labelById = new Map(items.map((i) => [i.id, i.label]));
  const known = new Set(items.map((i) => i.id));

  return (
    <ScrollArea className="min-h-0 flex-1" data-testid="lab-home">
      <div className="mx-auto flex max-w-[1100px] flex-col gap-8 px-6 py-8">
        <HeroSection />
        <MountSnippetSection />
        <MentalModelSection known={known} onNavigate={onNavigate} />
        <RecommendedPathSection labelById={labelById} known={known} onNavigate={onNavigate} />
        <FeatureMapSection labelById={labelById} known={known} onNavigate={onNavigate} />
      </div>
    </ScrollArea>
  );
}
