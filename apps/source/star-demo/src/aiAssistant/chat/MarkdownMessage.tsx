/**
 * Renders assistant text as markdown.
 *
 * Code blocks are plain `<pre>` with a copy button — deliberately no syntax
 * highlighter, to avoid pulling shiki/prism into the bundle. Mirrors the
 * pattern in `apps/source/design-system/src/components/CodeBlock.tsx`.
 */
import { memo, useCallback, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Check, Copy } from 'lucide-react';
import { Button } from '@wellsfargo-starui/react';

function CodeBlock({ children }: { children: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const text = String(children ?? '');

  const copy = useCallback(() => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [text]);

  return (
    <div className="relative group my-2">
      <pre className="overflow-x-auto rounded-md border border-border bg-background p-2 text-[11px] leading-relaxed">
        <code>{text}</code>
      </pre>
      <Button
        size="icon"
        variant="ghost"
        onClick={copy}
        aria-label="Copy code"
        className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      </Button>
    </div>
  );
}

export const MarkdownMessage = memo(function MarkdownMessage({ text }: { text: string }) {
  return (
    <div className="text-xs leading-relaxed [&_p]:my-1 [&_ul]:my-1 [&_ul]:pl-4 [&_ol]:my-1 [&_ol]:pl-4 [&_ul]:list-disc [&_ol]:list-decimal [&_a]:underline [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_table]:block [&_table]:overflow-x-auto">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // `pre > code` is the fenced-block shape; unwrap so CodeBlock owns
          // the <pre> and the copy affordance sits outside the scroll area.
          pre: ({ children }) => {
            const child = children as { props?: { children?: ReactNode } } | undefined;
            return <CodeBlock>{child?.props?.children ?? children}</CodeBlock>;
          },
          code: ({ children }) => (
            <code className="rounded bg-muted px-1 py-0.5 text-[11px] font-mono">{children}</code>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
});
