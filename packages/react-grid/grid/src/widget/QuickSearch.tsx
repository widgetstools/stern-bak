/**
 * QuickSearch — a search icon in the primary toolbar that expands into a
 * compact search field on hover / focus and drives AG-Grid's quick filter
 * (`gridOption.quickFilterText`), searching every column at once.
 *
 * Self-contained like {@link AlertsBadge}: it reaches the live `GridApi`
 * through the platform context rather than receiving it as a prop, so the
 * view-only `PrimaryToolbar` stays free of AG-Grid wiring. It uses the
 * *optional* platform accessor so it renders a harmless no-op when mounted
 * outside a `<GridProvider>` (e.g. characterisation tests that mount the
 * toolbar without a real platform) instead of throwing.
 *
 * Expansion is driven by CSS (`:hover` / `:focus-within`) plus two data
 * attributes so it also works without a pointer:
 *  - `data-open`     — clicking the icon pins it open and focuses the field
 *                      (keyboard / touch path).
 *  - `data-has-text` — a live filter keeps the field open and lights the
 *                      icon so an applied search never hides itself.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { GridApi } from 'ag-grid-community';
import { Search, X } from 'lucide-react';
import { Button, Input } from '@wellsfargo-starui/ui';
import { useOptionalGridPlatform } from '../customizer/hooks/GridProvider';

/**
 * Null-safe sibling of `useGridApi`: returns the live `GridApi` once
 * ready, or `null` both while AG-Grid is warming up AND when no
 * `<GridProvider>` is present at all.
 */
function useOptionalGridApi(): GridApi | null {
  const platform = useOptionalGridPlatform();
  const [api, setApi] = useState<GridApi | null>(platform?.api.api ?? null);
  useEffect(() => {
    if (!platform) return;
    return platform.api.onReady((a) => setApi(a));
  }, [platform]);
  return api;
}

export function QuickSearch() {
  const api = useOptionalGridApi();
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Quick filter re-runs a full pass over every row on each
  // `setGridOption('quickFilterText')`. Debounce that push so fast typing on a
  // large grid stays smooth — the input value updates immediately (responsive
  // caret) while the expensive filter pass coalesces to the latest term.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pushToGrid = useCallback(
    (next: string) => {
      api?.setGridOption('quickFilterText', next);
    },
    [api],
  );

  const apply = useCallback(
    (next: string) => {
      setText(next);
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      // Clearing should feel instant — never delay removing the filter.
      if (next === '') {
        pushToGrid('');
        return;
      }
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        pushToGrid(next);
      }, 140);
    },
    [pushToGrid],
  );

  // Cancel any pending push on unmount.
  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  // The grid API arrives asynchronously (after `onGridReady`). If the user
  // somehow typed before it was ready, replay the current term once it lands.
  useEffect(() => {
    if (api && text) api.setGridOption('quickFilterText', text);
    // Only re-run when the api reference changes — `text` is intentionally
    // omitted so this doesn't double-apply on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  const focusSoon = () => {
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleToggle = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      if (next) focusSoon();
      return next;
    });
  }, []);

  const handleBlur = useCallback(() => {
    // Collapse only when there's nothing to keep visible.
    if (!text) setOpen(false);
  }, [text]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        apply('');
        setOpen(false);
        inputRef.current?.blur();
      }
    },
    [apply],
  );

  const handleClear = useCallback(() => {
    apply('');
    focusSoon();
  }, [apply]);

  const hasText = text.length > 0;

  return (
    <div
      className="ds-quick-search"
      data-open={open ? 'true' : 'false'}
      data-has-text={hasText ? 'true' : 'false'}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="ds-primary-action ds-quick-search-toggle"
        onClick={handleToggle}
        title="Search grid"
        data-testid="quick-search-toggle"
        aria-label="Search grid"
        aria-expanded={open || hasText}
      >
        <Search size={14} strokeWidth={2} />
      </Button>

      <Input
        ref={inputRef}
        type="text"
        value={text}
        onChange={(e) => apply(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder="Search grid…"
        className="ds-quick-search-field"
        data-testid="quick-search-input"
        aria-label="Search grid"
      />

      {hasText && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="ds-primary-action ds-quick-search-clear"
          onClick={handleClear}
          title="Clear search"
          data-testid="quick-search-clear"
          aria-label="Clear search"
        >
          <X size={13} strokeWidth={2} />
        </Button>
      )}
    </div>
  );
}
