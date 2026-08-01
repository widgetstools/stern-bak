import { useCallback, useState } from 'react';
import { Sun, Moon } from 'lucide-react';
import { applyTheme, getTheme } from '@wellsfargo-starui/design-system';
import { Button } from '@wellsfargo-starui/react';

export function ThemeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light'>(
    () => getTheme().theme as 'dark' | 'light',
  );
  const isDark = theme === 'dark';

  const toggle = useCallback(() => {
    const next: 'dark' | 'light' = isDark ? 'light' : 'dark';
    applyTheme({ theme: next });
    setTheme(next);
  }, [isDark]);

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={toggle}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="h-8 w-8 border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] text-[color:var(--ds-text-secondary)] hover:bg-[color:var(--ds-surface-secondary)] hover:text-[color:var(--ds-text-primary)]"
      data-testid="theme-toggle"
    >
      {isDark ? <Sun size={14} strokeWidth={1.75} /> : <Moon size={14} strokeWidth={1.75} />}
    </Button>
  );
}
