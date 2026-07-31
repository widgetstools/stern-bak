/* eslint-disable @typescript-eslint/no-explicit-any */
declare const fin: any;

import { useEffect, useRef, useState } from 'react';
import { Button, Input } from '@wellsfargo-starui/grid/customizer';

interface RenameCustomData {
  view: { uuid: string; name: string };
  currentTitle: string;
}

const isOpenFin = typeof (window as unknown as { fin?: unknown }).fin !== 'undefined';

/**
 * RenameViewTab — popout hosted at /rename-view-tab.
 *
 * Mirrors the look-and-feel of the platform's "Save Page As" prompt
 * (header with icon + title, single input, Cancel/Save row). The
 * window itself is opened by the rename-view-tab custom action with
 * `frame: false`, so the card IS the window — no native title bar.
 *
 * Theme-sensitive via the ambient `<ThemeProvider>` (sets
 * `[data-theme]` on `<html>`); shadcn primitives + Tailwind tokens
 * resolve through `--bn-*` so dark and light flip automatically.
 *
 * Runtime rename mechanism: the workspace tabstrip reads `document.title`
 * by default (`titlePriority: 'document'`). `View.updateOptions({title})`
 * is a no-op at runtime — `title` is only present on `ViewOptions` (create
 * time), not `MutableViewOptions`. So we set `document.title` on the target
 * view via `executeJavaScript`, which the platform's tabstrip mirrors
 * immediately via the `view-page-title-updated` event.
 */
export default function RenameViewTab() {
  const [title, setTitle] = useState('');
  const [view, setView] = useState<RenameCustomData['view'] | null>(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpenFin) return;
    (async () => {
      try {
        const opts = await fin.me.getOptions();
        const cd = (opts?.customData ?? {}) as Partial<RenameCustomData>;
        if (cd.view) setView(cd.view);
        if (typeof cd.currentTitle === 'string') setTitle(cd.currentTitle);
      } catch (err) {
        console.warn('[rename-view-tab] failed to read customData', err);
      }
    })();
  }, []);

  useEffect(() => {
    const id = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 50);
    return () => clearTimeout(id);
  }, []);

  async function closeWindow() {
    if (!isOpenFin) return;
    try {
      await fin.Window.getCurrentSync().close();
    } catch { /* ignore — window already closing */ }
  }

  async function handleSave() {
    const next = title.trim();
    if (!next || !view || saving) return;
    setSaving(true);
    try {
      const target = fin.View.wrapSync(view);

      // Drive the tabstrip immediately via document.title (default
      // titlePriority is 'document'). Encoded via JSON.stringify so
      // quotes/backslashes in the user's input don't break out of the
      // JS string literal.
      const safe = JSON.stringify(next);
      await target.executeJavaScript(`document.title = ${safe};`);

      // Persist into the target view's customData so the rename survives
      // a workspace save/restore round-trip. Platform.getSnapshot() reads
      // from these same options, so the chosen title rides through the
      // workspace JSON for free. On the next boot, OpenFinRuntime reads
      // customData.savedTitle and reapplies it to document.title before
      // the page would set its own default.
      try {
        const opts = await target.getOptions();
        const cd = (opts?.customData ?? {}) as Record<string, unknown>;
        if (cd.savedTitle !== next) {
          await target.updateOptions({ customData: { ...cd, savedTitle: next } });
        }
      } catch (err) {
        console.warn('[rename-view-tab] customData persistence failed', err);
      }
    } catch (err) {
      console.error('[rename-view-tab] executeJavaScript failed', err);
    } finally {
      await closeWindow();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      void handleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      void closeWindow();
    }
  }

  const canSave = title.trim().length > 0 && !!view && !saving;

  return (
    <div
      className="fixed inset-0 flex flex-col overflow-hidden rounded-md border border-border bg-popover text-foreground shadow-2xl"
      style={{ fontFamily: 'var(--ds-font-sans)' }}
    >
      {/* Header — small page icon + title, mirrors "Save Page As" */}
      <div
        className="flex items-center gap-2 px-3.5 pt-3 pb-2"
        style={{ ['--webkit-app-region' as any]: 'drag' } as React.CSSProperties}
      >
        <span className="inline-flex h-4 w-4 items-center justify-center text-foreground/80">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
          >
            <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
            <path d="M14 3v5h5" />
          </svg>
        </span>
        <h1 className="m-0 text-[14px] font-semibold leading-none">Save Tab As</h1>
      </div>

      {/* Input row */}
      <div className="px-3.5 py-1">
        <Input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Tab name"
          className="h-9 text-[13px] px-3"
        />
      </div>

      {/* Action row */}
      <div className="mt-auto flex items-center justify-end gap-2 px-3.5 pt-2 pb-3">
        <Button
          type="button"
          variant="ghost"
          size="default"
          onClick={() => void closeWindow()}
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant="default"
          size="default"
          disabled={!canSave}
          onClick={() => void handleSave()}
        >
          Save
        </Button>
      </div>
    </div>
  );
}
