import { Badge, Tabs, TabsContent, TabsList, TabsTrigger } from '@wellsfargo-starui/react';
import { CodeBlock } from '../components/CodeBlock';
import type { ShowcaseEntry } from './types';

export interface ComponentDemoProps {
  entry: ShowcaseEntry;
}

/** Renders one showcase entry: live preview + import line + copyable code. */
export function ComponentDemo({ entry }: ComponentDemoProps) {
  const { Demo } = entry;
  return (
    <div
      className="rounded-md border border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)]"
      data-testid={`ds-demo-${entry.id}`}
    >
      <div className="flex items-center gap-2 border-b border-[color:var(--ds-border-primary)] px-3 py-2">
        <h3 className="text-[13px] font-semibold text-[color:var(--ds-text-primary)]">{entry.name}</h3>
        <Badge
          variant="outline"
          className="border-[color:var(--ds-border-primary)] font-[var(--ds-font-mono)] text-[10px] text-[color:var(--ds-text-secondary)]"
        >
          {entry.id}
        </Badge>
      </div>
      <Tabs defaultValue="preview" className="w-full">
        <TabsList className="mx-3 mt-2 h-7 w-[200px] bg-[color:var(--ds-surface-secondary)] p-0.5">
          <TabsTrigger value="preview" className="h-6 flex-1 text-[11px]">Preview</TabsTrigger>
          <TabsTrigger value="code" className="h-6 flex-1 text-[11px]">Code</TabsTrigger>
        </TabsList>
        <TabsContent value="preview" className="m-0 p-4">
          <div className="flex min-h-[64px] flex-wrap items-center gap-3 rounded border border-dashed border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-ground)] p-4">
            <Demo />
          </div>
        </TabsContent>
        <TabsContent value="code" className="m-0 flex flex-col gap-2 p-3">
          <CodeBlock code={entry.importLine} label="Import" />
          <CodeBlock code={entry.code} label="Usage" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
