/**
 * Wraps @testing-library/react `render` with Radix providers required by
 * @wellsfargo-starui/react primitives (Tooltip, etc.) used across customizer tests.
 */
import * as React from 'react';
import { TooltipProvider } from '@wellsfargo-starui/react';
import { vi } from 'vitest';

vi.mock('@testing-library/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@testing-library/react')>();

  function UiProviders({ children }: { children: React.ReactNode }) {
    return <TooltipProvider delayDuration={0}>{children}</TooltipProvider>;
  }

  return {
    ...actual,
    render: (ui: React.ReactElement, options?: Parameters<typeof actual.render>[1]) => {
      const Wrapper = options?.wrapper;
      return actual.render(ui, {
        ...options,
        wrapper: Wrapper
          ? ({ children }) => (
              <UiProviders>
                <Wrapper>{children}</Wrapper>
              </UiProviders>
            )
          : UiProviders,
      });
    },
  };
});
