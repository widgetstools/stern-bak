import { forwardRef, useEffect, useRef, useState, type ReactNode } from 'react';
import { Input, cn } from '@wellsfargo-starui/ui';

/**
 * Input pill — sharp 2px corners, bg-background inset, design-system focus
 * ring, sans/mono font option.
 *
 * Commit model: local draft + commit on blur / Enter. Consumers hook
 * the commit to their `useModuleDraft().setDraft` so keystroke thrash
 * is bounded to this field.
 */

export interface IconInputProps {
  value?: string;
  /** Fires on blur OR when the user presses Enter. */
  onCommit?: (value: string) => void;
  /** Live text stream — wire only when the caller needs real-time reactions. */
  onChange?: (value: string) => void;
  icon?: ReactNode;
  /** Small right-side unit label — e.g. "PX", "%", "°". Rendered as tracked caps. */
  suffix?: string;
  placeholder?: string;
  monospace?: boolean;
  disabled?: boolean;
  error?: boolean;
  /** Marks the input inputMode="decimal" — still a normal text input. */
  numeric?: boolean;
  'data-testid'?: string;
  'aria-label'?: string;
  className?: string;
}

export const IconInput = forwardRef<HTMLInputElement, IconInputProps>(function IconInput(
  {
    value = '',
    onCommit,
    onChange,
    icon,
    suffix,
    placeholder,
    monospace,
    disabled,
    error,
    numeric,
    className,
    ...rest
  },
  ref,
) {
  const [draft, setDraft] = useState(value);
  const lastExternal = useRef(value);
  useEffect(() => {
    if (value !== lastExternal.current) {
      setDraft(value);
      lastExternal.current = value;
    }
  }, [value]);

  const commit = () => {
    if (draft !== lastExternal.current) {
      lastExternal.current = draft;
      onCommit?.(draft);
    }
  };

  return (
    <div
      data-error={error ? 'true' : 'false'}
      className={cn(
        'inline-flex items-center flex-1 min-w-0 h-7 rounded-sm bg-background border px-2 gap-1.5 transition-colors [transition-duration:120ms]',
        error ? 'border-destructive' : 'border-border',
        disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-text',
        'focus-within:border-primary',
        className,
      )}
    >
      {icon && (
        <span className="text-muted-foreground inline-flex flex-shrink-0 text-xs">
          {icon}
        </span>
      )}
      <Input
        ref={ref}
        value={draft}
        disabled={disabled}
        placeholder={placeholder}
        inputMode={numeric ? 'decimal' : undefined}
        onChange={(e) => {
          setDraft(e.target.value);
          onChange?.(e.target.value);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commit();
            e.currentTarget.blur();
          }
        }}
        data-testid={rest['data-testid']}
        aria-label={rest['aria-label']}
        className={cn(
          'flex-1 min-w-0 h-auto border-none bg-transparent p-0 text-xs text-foreground shadow-none focus-visible:ring-0',
          monospace || numeric ? 'font-mono tabular-nums' : 'font-sans',
        )}
      />
      {suffix && (
        <span className="font-semibold uppercase text-muted-foreground flex-shrink-0 tracking-[0.08em] text-[9px]">
          {suffix}
        </span>
      )}
    </div>
  );
});
