import { useEffect, useRef, useState } from 'react';
import { Input, Textarea, cn } from '@wellsfargo-starui/react';
import type { ExpressionEditorProps, ExpressionEditorHandle } from './types';

/**
 * Fallback expression input — shown in three situations:
 *   1. While the editor chunk is lazy-loading on first use (< 1s on a warm cache).
 *   2. If the editor chunk fails to load (bad network, extension blocking, bundler bug).
 *   3. When the rich editor is intentionally not used (e.g. a host app that wants the
 *      smallest possible bundle).
 *
 * Preserves the existing commit-on-blur + commit-on-Enter UX that every
 * current call site relies on so the editor is functional before Monaco
 * arrives — no dead fields, ever, which matters for a trading terminal.
 */
export function FallbackInput({
  value,
  onCommit,
  onChange,
  placeholder,
  multiline,
  lines = 4,
  fontSize = 11,
  readOnly,
  className,
  style: hostStyle,
  validate: _validate,
  warnDeprecated: _warnDeprecated,
  columnsProvider: _columnsProvider,
  functionsProvider: _functionsProvider,
  'data-testid': dataTestId,
  handleRef,
}: ExpressionEditorProps & { handleRef?: React.Ref<ExpressionEditorHandle> }) {
  const [text, setText] = useState(value);
  const ref = useRef(value);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  // Keep in sync when the caller swaps `value` from outside (switching rules).
  useEffect(() => {
    if (value !== ref.current) {
      setText(value);
      ref.current = value;
    }
  }, [value]);

  const commit = () => {
    if (text !== ref.current) {
      ref.current = text;
      onCommit(text);
    }
  };

  // Expose the imperative handle even in fallback mode — the formula bar
  // shouldn't care whether Monaco is up yet.
  useEffect(() => {
    if (!handleRef) return;
    const h: ExpressionEditorHandle = {
      focus: () => inputRef.current?.focus(),
      getValue: () => text,
    };
    if (typeof handleRef === 'function') handleRef(h);
    else (handleRef as { current: ExpressionEditorHandle | null }).current = h;
    return () => {
      if (typeof handleRef === 'function') handleRef(null as unknown as ExpressionEditorHandle);
      else (handleRef as { current: ExpressionEditorHandle | null }).current = null;
    };
  }, [handleRef, text]);

  const commonProps = {
    value: text,
    placeholder,
    readOnly,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setText(e.target.value);
      onChange?.(e.target.value);
    },
    onBlur: commit,
    style: { fontSize, ...hostStyle },
    'data-testid': dataTestId,
  };

  if (multiline) {
    return (
      <Textarea
        ref={(el) => { inputRef.current = el; }}
        {...commonProps}
        rows={lines}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            commit();
          }
        }}
        className={cn('font-mono', className)}
      />
    );
  }

  return (
    <Input
      ref={(el) => { inputRef.current = el; }}
      {...commonProps}
      onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
      className={cn('font-mono', className)}
    />
  );
}
