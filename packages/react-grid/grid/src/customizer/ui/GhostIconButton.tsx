import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Button, cn } from '@wellsfargo-starui/react';

export type GhostIconButtonVariant = 'default' | 'accent' | 'destructive';
export type GhostIconButtonSize = 'sm' | 'md';
export type GhostIconButtonReveal = 'always' | 'on-row-hover';

export interface GhostIconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: GhostIconButtonVariant;
  size?: GhostIconButtonSize;
  reveal?: GhostIconButtonReveal;
  revealed?: boolean;
}

const GHOST_ICON_BUTTON_CSS = `
.ds-gib {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--ds-text-primary);
  border-radius: 2px;
  cursor: pointer;
  transition: background-color 120ms, color 120ms, opacity 120ms;
}
.ds-gib:focus-visible {
  outline: 2px solid var(--ds-primary);
  outline-offset: 1px;
}
.ds-gib:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}
.ds-gib[data-variant='default']:not(:disabled):hover,
.ds-gib[data-variant='accent']:not(:disabled):hover {
  background: color-mix(in srgb, var(--ds-primary) 14%, transparent) !important;
  color: var(--ds-primary) !important;
}
.ds-gib[data-variant='destructive']:not(:disabled):hover {
  background: color-mix(in srgb, var(--ds-accent-negative) 14%, transparent) !important;
  color: var(--ds-accent-negative) !important;
}
[data-row-hover-target]:hover .ds-gib[data-reveal='on-row-hover']:not(:disabled),
.ds-gib[data-reveal='on-row-hover'][data-revealed='true']:not(:disabled) {
  color: var(--ds-text-primary) !important;
}
.ds-gib[data-size='md'] {
  width: 28px;
  height: 28px;
  border-radius: 2px;
}
.ds-gib[data-reveal='on-row-hover'] {
  opacity: 0;
}
[data-row-hover-target]:hover .ds-gib[data-reveal='on-row-hover'],
.ds-gib[data-reveal='on-row-hover']:focus-visible,
.ds-gib[data-reveal='on-row-hover'][data-revealed='true'] {
  opacity: 1;
}
`;

const STYLE_TAG_ID = 'ds-ghost-icon-button-styles';

function ensureStylesInjected(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_TAG_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_TAG_ID;
  style.textContent = GHOST_ICON_BUTTON_CSS;
  document.head.appendChild(style);
}

ensureStylesInjected();

export const GhostIconButton = forwardRef<HTMLButtonElement, GhostIconButtonProps>(
  (
    {
      className,
      variant = 'default',
      size = 'sm',
      reveal = 'always',
      revealed,
      type,
      children,
      ...rest
    },
    ref,
  ) => (
    <Button
      ref={ref}
      type={type ?? 'button'}
      variant="chrome"
      size="icon"
      className={cn(
        'ds-gib h-auto min-h-0 w-auto p-0 shadow-none focus-visible:ring-0',
        className,
      )}
      data-variant={variant}
      data-size={size}
      data-reveal={reveal}
      data-revealed={revealed ? 'true' : undefined}
      {...rest}
    >
      {children}
    </Button>
  ),
);
GhostIconButton.displayName = 'GhostIconButton';
