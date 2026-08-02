import { useCallback, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from '@wellsfargo-starui/react';

export interface FloatingWindowProps {
  title: string;
  onClose: () => void;
  initial?: { x: number; y: number; width: number; height: number };
  children: ReactNode;
  testid?: string;
}

interface Pos { x: number; y: number }

export function FloatingWindow({ title, onClose, initial, children, testid }: FloatingWindowProps) {
  const [pos, setPos] = useState<Pos>({ x: initial?.x ?? 120, y: initial?.y ?? 80 });
  const dragOrigin = useRef<{ mx: number; my: number; px: number; py: number } | null>(null);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragOrigin.current = { mx: e.clientX, my: e.clientY, px: pos.x, py: pos.y };
  }, [pos]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragOrigin.current) return;
    const { mx, my, px, py } = dragOrigin.current;
    const w = initial?.width ?? 380;
    const h = initial?.height ?? 560;
    const nx = Math.max(0, Math.min(window.innerWidth - w, px + e.clientX - mx));
    const ny = Math.max(0, Math.min(window.innerHeight - h, py + e.clientY - my));
    setPos({ x: nx, y: ny });
  }, [initial]);

  const onPointerUp = useCallback(() => { dragOrigin.current = null; }, []);

  const w = initial?.width ?? 380;
  const h = initial?.height ?? 560;

  return (
    <div
      data-testid={testid}
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        width: w,
        height: h,
        zIndex: 9000,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--ds-surface-primary)',
        border: '1px solid var(--ds-border-primary)',
        borderRadius: 'var(--ds-radius-lg)',
        boxShadow: 'var(--ds-elevation-overlay)',
        overflow: 'hidden',
      }}
    >
      {/* Draggable header */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          background: 'var(--ds-surface-secondary)',
          borderBottom: '1px solid var(--ds-border-primary)',
          cursor: 'grab',
          userSelect: 'none',
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 'var(--ds-font-size-xs)', fontWeight: 600, color: 'var(--ds-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {title}
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          onPointerDown={(e) => e.stopPropagation()}
          style={{ width: 22, height: 22, color: 'var(--ds-text-muted)' }}
          aria-label="Close"
        >
          <X size={12} />
        </Button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {children}
      </div>
    </div>
  );
}
