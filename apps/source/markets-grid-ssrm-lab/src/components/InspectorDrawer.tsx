import { useEffect, useState } from 'react';
import { ChevronDown, Copy, Check } from 'lucide-react';
import {
  Badge,
  Button,
  ScrollArea,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@wellsfargo-starui/react';
import { Markdown } from './Markdown';
import { BASE_PROPS } from '../guides/featureGuides';
import type {
  FeatureGuide,
  FeatureGuideConfigBlock,
  FeatureGuidePropRow,
} from '../guides/types';

const OPEN_KEY = 'lab-inspector-open';
const TAB_KEY = 'lab-inspector-tab';

export interface InspectorDrawerProps {
  guide: FeatureGuide;
  configBlocks: FeatureGuideConfigBlock[];
  /** Optional full markdown docs for the "Full docs" disclosure. */
  fullDocs?: string;
}

function readBool(key: string, fallback: boolean): boolean {
  if (typeof window === 'undefined') return fallback;
  const v = window.localStorage.getItem(key);
  return v == null ? fallback : v === '1';
}

export function InspectorDrawer({ guide, configBlocks, fullDocs }: InspectorDrawerProps) {
  const [open, setOpen] = useState(() => readBool(OPEN_KEY, true));
  const [tab, setTab] = useState(
    () => (typeof window === 'undefined' ? 'what' : window.localStorage.getItem(TAB_KEY) ?? 'what'),
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(OPEN_KEY, open ? '1' : '0');
  }, [open]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(TAB_KEY, tab);
  }, [tab]);

  const props = [...BASE_PROPS, ...guide.props];

  return (
    <div
      className="shrink-0 border-t border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)]"
      data-testid="lab-inspector"
    >
      <div className="flex items-center gap-2 px-3 py-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--ds-text-secondary)]">
          Inspector
        </span>
        <Badge
          variant="outline"
          className="border-[color:var(--ds-border-primary)] text-[10px] text-[color:var(--ds-text-secondary)]"
        >
          {guide.id}
        </Badge>
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto h-7 w-7 text-[color:var(--ds-text-secondary)]"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? 'Collapse inspector' : 'Expand inspector'}
          aria-expanded={open}
          data-testid="lab-inspector-toggle"
        >
          <ChevronDown
            size={16}
            className={`transition-transform ${open ? '' : '-rotate-180'}`}
          />
        </Button>
      </div>

      {open && (
        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="mx-3 mb-2 grid h-8 w-[min(560px,100%)] grid-cols-4 bg-[color:var(--ds-surface-secondary)] p-0.5">
            <TabsTrigger value="what" className="text-[12px]" data-testid="lab-inspector-tab-what">
              What &amp; Why
            </TabsTrigger>
            <TabsTrigger value="try" className="text-[12px]" data-testid="lab-inspector-tab-try">
              Try this
            </TabsTrigger>
            <TabsTrigger value="config" className="text-[12px]" data-testid="lab-inspector-tab-config">
              Config
            </TabsTrigger>
            <TabsTrigger value="props" className="text-[12px]" data-testid="lab-inspector-tab-props">
              Props
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="h-[230px] px-3 pb-3">
            <TabsContent value="what" className="m-0">
              <div className="prose-sm max-w-[72ch] text-[13px] text-[color:var(--ds-text-primary)]">
                <Markdown source={guide.whatWhy} />
              </div>
              {fullDocs && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-[12px] text-[color:var(--ds-text-secondary)]">
                    Full docs
                  </summary>
                  <div className="mt-2 max-w-[72ch]">
                    <Markdown source={fullDocs} />
                  </div>
                </details>
              )}
            </TabsContent>

            <TabsContent value="try" className="m-0">
              <ol className="flex flex-col gap-2">
                {guide.trySteps.map((step, i) => (
                  <li key={i} className="flex gap-2 text-[13px] text-[color:var(--ds-text-primary)]">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[color:var(--ds-surface-secondary)] text-[11px] font-semibold text-[color:var(--ds-text-secondary)]">
                      {i + 1}
                    </span>
                    <span>
                      {step.text}
                      {step.hint && (
                        <span className="mt-0.5 block text-[11px] text-[color:var(--ds-text-secondary)]">
                          {step.hint}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            </TabsContent>

            <TabsContent value="config" className="m-0 flex flex-col gap-3">
              {configBlocks.map((block, i) => (
                <ConfigBlock key={`${i}-${block.label}`} block={block} />
              ))}
            </TabsContent>

            <TabsContent value="props" className="m-0">
              <PropsTable rows={props} />
            </TabsContent>
          </ScrollArea>
        </Tabs>
      )}
    </div>
  );
}

function ConfigBlock({ block }: { block: FeatureGuideConfigBlock }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(block.code).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    });
  };
  return (
    <div className="overflow-hidden rounded-md border border-[color:var(--ds-border-primary)]">
      <div className="flex items-center justify-between bg-[color:var(--ds-surface-secondary)] px-2 py-1">
        <span className="text-[11px] font-medium text-[color:var(--ds-text-secondary)]">
          {block.label}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-[color:var(--ds-text-secondary)]"
          onClick={copy}
          aria-label="Copy config"
          data-testid="lab-inspector-copy"
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
        </Button>
      </div>
      <pre className="overflow-x-auto bg-[color:var(--ds-surface-ground)] p-2 text-[11px] leading-relaxed text-[color:var(--ds-text-primary)]">
        <code>{block.code}</code>
      </pre>
    </div>
  );
}

function PropsTable({ rows }: { rows: FeatureGuidePropRow[] }) {
  return (
    <table className="w-full border-collapse text-left text-[12px]">
      <thead>
        <tr className="border-b border-[color:var(--ds-border-primary)] text-[color:var(--ds-text-secondary)]">
          <th className="py-1 pr-3 font-medium">Prop</th>
          <th className="py-1 pr-3 font-medium">Type</th>
          <th className="py-1 pr-3 font-medium">Default</th>
          <th className="py-1 font-medium">Note</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.name} className="border-b border-[color:var(--ds-border-primary)]/50 align-top">
            <td className="py-1 pr-3 font-mono text-[11px] text-[color:var(--ds-text-primary)]">{r.name}</td>
            <td className="py-1 pr-3 font-mono text-[11px] text-[color:var(--ds-text-secondary)]">{r.type}</td>
            <td className="py-1 pr-3 font-mono text-[11px] text-[color:var(--ds-text-secondary)]">{r.default ?? '—'}</td>
            <td className="py-1 text-[color:var(--ds-text-secondary)]">{r.note}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
