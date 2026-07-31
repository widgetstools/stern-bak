/**
 * DraggableFloat — a lightweight, position-fixed container that can be dragged
 * around the viewport. Used to host the FormattingToolbar as a floating panel
 * that the user can reposition or close at will.
 *
 * Two modes:
 *   1. Built-in header (default) — renders a title bar with a grip icon,
 *      optional title, and an X close button. Drag by the header.
 *   2. Headless (`headless` prop) — no header strip. Children use the
 *      `<DragHandle>` sub-component to mark draggable regions and
 *      `<CloseButton>` to render the dismiss control wherever they like.
 *      Ideal for toolbars that want an inline grip + close on the same row.
 *
 * Intentionally self-contained (no DnD library). A single pointerdown on the
 * handle starts a drag tracked on `pointermove` + `pointerup` on the window.
 * Position is clamped to the viewport so the handle never escapes where the
 * user can click it.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ChromeButton } from '../customizer/index.js'; // relative on purpose (self-reference breaks the dist build + risks barrel cycles)
import { GripVertical, X as XIcon } from 'lucide-react';
import './grid-chrome.css';

interface DragContext {
  onPointerDownDrag: (e: React.PointerEvent) => void;
  onClose: () => void;
}

const DraggableFloatCtx = createContext<DragContext | null>(null);

export interface DraggableFloatProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** Skip the built-in header; children provide their own <DragHandle>/<CloseButton>. */
  headless?: boolean;
  /** Initial position if none has been remembered yet. Default: top-center-ish. */
  defaultPosition?: { x: number; y: number };
  /** Optional controlled position — omit to let the component manage its own. */
  position?: { x: number; y: number };
  onPositionChange?: (pos: { x: number; y: number }) => void;
  children: React.ReactNode;
  /** z-index for the floating panel. Default 9999 so it sits above the grid. */
  zIndex?: number;
  'data-testid'?: string;
}

export function DraggableFloat({
  open,
  onClose,
  title,
  headless = false,
  defaultPosition,
  position: controlledPosition,
  onPositionChange,
  children,
  zIndex = 9999,
  'data-testid': testId,
}: DraggableFloatProps) {
  const [internalPos, setInternalPos] = useState<{ x: number; y: number }>(() => {
    if (defaultPosition) return defaultPosition;
    // Default: anchored at the top edge of the viewport, centered
    // horizontally. `y: 0` puts the panel flush with the top of the page
    // on first open — matches the expectation that a floating toolbar
    // "drops down from the top." Users who want a different resting
    // position can drag it once; subsequent opens resume from wherever
    // they last left it.
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1200;
    return { x: Math.max(16, Math.floor(vw / 2) - 450), y: 0 };
  });

  const pos = controlledPosition ?? internalPos;
  const setPos = useCallback(
    (next: { x: number; y: number }) => {
      if (onPositionChange) onPositionChange(next);
      if (!controlledPosition) setInternalPos(next);
    },
    [controlledPosition, onPositionChange],
  );

  const dragStateRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const panelRef = useRef<HTMLDivElement>(null);

  // Bridge setPos through a ref so the pointer handlers can be truly
  // stable (deps []). Without this, parent re-renders during an active
  // drag would refresh setPos → onPointerMove identity → tear down the
  // ambient unmount-cleanup effect's listener bindings mid-drag (the
  // attached window listener is the OLD identity, so removeEventListener
  // with the NEW identity is a no-op, leaving the listener attached;
  // the next drag start adds a second listener on top — stack of stale
  // handlers).
  const setPosRef = useRef(setPos);
  useEffect(() => { setPosRef.current = setPos; }, [setPos]);

  const onPointerMove = useCallback((e: PointerEvent) => {
    const s = dragStateRef.current;
    if (!s) return;
    const dx = e.clientX - s.startX;
    const dy = e.clientY - s.startY;
    const panel = panelRef.current;
    const w = panel?.offsetWidth ?? 800;
    const h = panel?.offsetHeight ?? 60;
    const maxX = Math.max(0, window.innerWidth - w);
    const maxY = Math.max(0, window.innerHeight - h);
    const nextX = Math.min(Math.max(0, s.originX + dx), maxX);
    const nextY = Math.min(Math.max(0, s.originY + dy), maxY);
    setPosRef.current({ x: nextX, y: nextY });
  }, []);

  const onPointerUp = useCallback(() => {
    dragStateRef.current = null;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, [onPointerMove]);

  const onPointerDownDrag = useCallback(
    (e: React.PointerEvent) => {
      // Only left mouse button initiates a drag.
      if (e.button !== 0) return;
      e.preventDefault();
      dragStateRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        originX: pos.x,
        originY: pos.y,
      };
      document.body.style.cursor = 'grabbing';
      document.body.style.userSelect = 'none';
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    },
    [pos.x, pos.y, onPointerMove, onPointerUp],
  );

  // Clamp position on window resize so the panel can't get stranded offscreen
  // after e.g. a browser window shrink.
  useEffect(() => {
    const onResize = () => {
      const panel = panelRef.current;
      if (!panel) return;
      const w = panel.offsetWidth;
      const h = panel.offsetHeight;
      const maxX = Math.max(0, window.innerWidth - w);
      const maxY = Math.max(0, window.innerHeight - h);
      if (pos.x > maxX || pos.y > maxY) {
        setPos({ x: Math.min(pos.x, maxX), y: Math.min(pos.y, maxY) });
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [pos.x, pos.y, setPos]);

  // Cleanup dangling listeners on unmount. Deps are intentionally empty
  // because onPointerMove/onPointerUp above are now stable (`[]` deps)
  // — the captured identities here always match what onPointerDownDrag
  // attached. If we listed them, the effect would re-fire on every
  // render and the cleanup would run unnecessarily often.
  useEffect(() => {
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
    // Reason: pointer handlers are stable refs; cleanup is unmount-only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ctxValue = useMemo<DragContext>(
    () => ({ onPointerDownDrag, onClose }),
    [onPointerDownDrag, onClose],
  );

  if (!open) return null;

  return (
    <DraggableFloatCtx.Provider value={ctxValue}>
      <div
        ref={panelRef}
        data-testid={testId}
        style={{
          position: 'fixed',
          top: pos.y,
          left: pos.x,
          zIndex,
          background: 'var(--ds-surface-primary)',
          border: '1px solid var(--ds-border-primary)',
          borderRadius: 2,
          boxShadow:
            '0 12px 32px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(255, 255, 255, 0.02) inset',
          maxWidth: 'calc(100vw - 16px)',
        }}
      >
        {/* Built-in header — omitted in headless mode. */}
        {!headless && (
          <div
            onPointerDown={onPointerDownDrag}
            style={{
              height: 22,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '0 6px 0 4px',
              cursor: 'grab',
              borderBottom: '1px solid var(--ds-border-primary)',
              background: 'var(--ds-surface-primary)',
              borderTopLeftRadius: 8,
              borderTopRightRadius: 8,
              userSelect: 'none',
              touchAction: 'none',
            }}
            title="Drag to move"
          >
            <GripVertical
              size={11}
              strokeWidth={1.75}
              style={{ color: 'var(--ds-text-muted)', opacity: 0.7 }}
            />
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                color: 'var(--ds-text-muted)',
                flex: 1,
              }}
            >
              {title ?? 'Floating Panel'}
            </span>
            <CloseButton data-testid={testId ? `${testId}-close` : undefined} size={12} />
          </div>
        )}

        {/* Panel body */}
        <div>{children}</div>
      </div>
    </DraggableFloatCtx.Provider>
  );
}

// ─── Sub-components for headless mode ─────────────────────────────────────

/**
 * `<DraggableFloat.DragHandle>` — marks a region inside a headless
 * DraggableFloat as a drag initiator. Renders a vertical grip icon by
 * default; pass children to render custom content.
 */
function DragHandle({
  children,
  className,
  style,
  title = 'Drag to move',
  'data-testid': testId,
}: {
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
  'data-testid'?: string;
}) {
  const ctx = useContext(DraggableFloatCtx);
  if (!ctx) return null;
  return (
    <div
      className={className}
      data-testid={testId}
      onPointerDown={ctx.onPointerDownDrag}
      title={title}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'grab',
        userSelect: 'none',
        touchAction: 'none',
        color: 'var(--ds-text-muted)',
        ...style,
      }}
    >
      {children ?? <GripVertical size={13} strokeWidth={1.75} />}
    </div>
  );
}

/**
 * `<DraggableFloat.CloseButton>` — dismisses the panel. Consumes the
 * same `onClose` the DraggableFloat was given.
 */
function CloseButton({
  size = 14,
  className,
  style,
  title = 'Close',
  'data-testid': testId,
}: {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
  'data-testid'?: string;
}) {
  const ctx = useContext(DraggableFloatCtx);
  if (!ctx) return null;
  return (
    <ChromeButton
      type="button"
      className={className ?? 'ds-float-close-btn'}
      data-testid={testId}
      onClick={ctx.onClose}
      onPointerDown={(e) => e.stopPropagation()}
      title={title}
      style={style}
    >
      <XIcon size={size} strokeWidth={2.25} />
    </ChromeButton>
  );
}

DraggableFloat.DragHandle = DragHandle;
DraggableFloat.CloseButton = CloseButton;
