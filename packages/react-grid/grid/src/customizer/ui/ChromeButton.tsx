import { forwardRef, type ComponentProps } from 'react';
import { Button, cn } from '@wellsfargo-starui/ui';

/**
 * shadcn `Button` (`variant="chrome"` / `size="chrome"`) with Tailwind resets so
 * legacy `.ds-*` / `.fx-*` cockpit CSS keeps full control of dimensions,
 * padding, colors, hover fills, and disabled opacity.
 */
export type ChromeButtonProps = ComponentProps<typeof Button>;

export const CHROME_BUTTON_RESET =
  'inline-flex items-center justify-center min-h-0 max-h-full h-auto leading-none p-0 m-0 shadow-none ring-0 ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0';

export const ChromeButton = forwardRef<HTMLButtonElement, ChromeButtonProps>(
  function ChromeButton({ className, variant = 'chrome', size = 'chrome', ...rest }, ref) {
    return (
      <Button
        ref={ref}
        variant={variant}
        size={size}
        className={cn(CHROME_BUTTON_RESET, className)}
        {...rest}
      />
    );
  },
);
