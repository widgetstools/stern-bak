/**
 * EditableCaption — inline caption rendered at the left edge of the
 * primary toolbar row. Always visible; under OpenFin its value is kept
 * in lockstep with the view's tab name (see useViewTabTitle).
 *
 * View-only. Local UI state for the input draft (held until commit) is
 * the only state — no ProfileManager, no AG-Grid API, no storage.
 * Click the (hover-revealed) pencil to edit; Enter or blur commits,
 * Escape cancels. Commits propagate via `onCaptionChange`.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import { Input, ChromeButton } from '../customizer/internal.js'; // relative on purpose (self-reference breaks the dist build + risks barrel cycles)
import { Pencil } from 'lucide-react';

export interface EditableCaptionProps {
  readonly caption: string;
  readonly onCaptionChange: ((next: string) => void) | undefined;
}

export function EditableCaption({
  caption,
  onCaptionChange,
}: EditableCaptionProps): ReactElement {
  // `value` seeds from the prop on mount and every time the prop
  // changes (e.g. host swaps `componentName`). User edits update the
  // local state and fire `onCaptionChange` on commit; if the host
  // doesn't echo the new value back via the prop, the local state
  // still wins on subsequent renders thanks to the second-arg gate.
  const [value, setValue] = useState(caption);
  const lastPropRef = useRef(caption);
  useEffect(() => {
    if (lastPropRef.current !== caption) {
      lastPropRef.current = caption;
      setValue(caption);
    }
  }, [caption]);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(caption);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const startEdit = useCallback(() => {
    setDraft(value);
    setEditing(true);
  }, [value]);

  const commit = useCallback(() => {
    const next = draft.trim();
    setEditing(false);
    if (!next || next === value) return;
    setValue(next);
    onCaptionChange?.(next);
  }, [draft, value, onCaptionChange]);

  const cancel = useCallback(() => {
    setDraft(value);
    setEditing(false);
  }, [value]);

  // Auto-focus + select-all when entering edit mode so the user can
  // either overwrite immediately or click to position the caret.
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  if (editing) {
    return (
      <div
        data-grid-caption
        data-editing="true"
        style={{
          display: 'flex',
          alignItems: 'center',
          marginLeft: 8,
          marginRight: 8,
        }}
      >
        <Input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              cancel();
            }
          }}
          style={{ width: 160, height: 22, fontSize: 12, fontWeight: 600 }}
          data-testid="grid-caption-input"
        />
      </div>
    );
  }

  return (
    <div
      data-grid-caption
      className="group"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        marginLeft: 8,
        marginRight: 8,
        fontSize: 12,
        fontWeight: 600,
        color: 'var(--ds-text-primary)',
      }}
    >
      <span data-testid="grid-caption-text">{value}</span>
      <ChromeButton
        type="button"
        onClick={startEdit}
        title="Rename"
        aria-label="Rename caption"
        data-testid="grid-caption-edit-btn"
        className="ds-caption-edit-btn opacity-0 group-hover:opacity-100 focus:opacity-100"
      >
        <Pencil size={12} strokeWidth={2} />
      </ChromeButton>
    </div>
  );
}
