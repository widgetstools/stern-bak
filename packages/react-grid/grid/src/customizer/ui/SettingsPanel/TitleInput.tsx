import { forwardRef } from 'react';
import { Input, cn } from '@wellsfargo-starui/ui';
import type { ComponentProps } from 'react';

/**
 * Editable title field for settings panel identity rows.
 * Wraps shadcn `Input` with title-weight typography.
 */

export type TitleInputProps = ComponentProps<typeof Input>;

export const TitleInput = forwardRef<HTMLInputElement, TitleInputProps>(function TitleInput(
  { className, ...rest },
  ref,
) {
  return (
    <Input
      ref={ref}
      className={cn(
        'flex-1 min-w-0 h-control-sm min-h-control-sm px-2.5 font-sans font-semibold text-[length:var(--ds-font-size-sm)] tracking-tight',
        className,
      )}
      {...rest}
    />
  );
});
