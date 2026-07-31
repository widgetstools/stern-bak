import { useCallback } from 'react';
import { applyTheme, getTheme } from '@wellsfargo-starui/design-system';
import { Button, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@wellsfargo-starui/ui';
import { Sun, Moon } from 'lucide-react';

/** Theme toggle — shadcn Button + design-system applyTheme. */
export function ThemeToggle() {
  const theme = getTheme().theme as 'dark' | 'light';
  const isDark = theme === 'dark';

  const handleToggle = useCallback(() => {
    applyTheme({ theme: isDark ? 'light' : 'dark' });
  }, [isDark]);

  return (
    <TooltipProvider delayDuration={250}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline" size="icon" onClick={handleToggle} className="h-7 w-7">
            {isDark ? <Sun size={13} /> : <Moon size={13} />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>Toggle theme</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
