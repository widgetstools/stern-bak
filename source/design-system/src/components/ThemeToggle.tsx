import { Sun, Moon } from 'lucide-react';
import { Button } from '@wellsfargo-starui/react';
import { useThemeMode } from '../lib/useThemeMode';

export function ThemeToggle() {
  const { mode, toggle } = useThemeMode();
  const isDark = mode === 'dark';
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
