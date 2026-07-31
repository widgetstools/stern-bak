import { useState, type ReactNode } from 'react';
import { CircleHelp } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@wellsfargo-starui/ui';
import { HelpSheet } from './HelpSheet';

export interface TabVariant {
  id: string;
  label: string;
}

export interface TabContainerProps {
  title: string;
  subtitle?: string;
  /** Markdown help loaded via Vite `?raw` import. */
  help: string;
  /** Optional variant picker — rendered between title and grid. */
  variants?: TabVariant[];
  activeVariant?: string;
  onVariantChange?: (id: string) => void;
  /** Free-form actions slot (e.g. tick-rate slider) shown on the toolbar right side. */
  actions?: ReactNode;
  /** The grid (or any feature content) — fills remaining vertical space. */
  children: ReactNode;
}

export function TabContainer({
  title,
  subtitle,
  help,
  variants,
  activeVariant,
  onVariantChange,
  actions,
  children,
}: TabContainerProps) {
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <Card className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] p-0 shadow-[var(--ds-elevation-card)]">
      <div className="flex shrink-0 items-center gap-2 border-b border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] px-3 py-2">
        <div className="flex flex-col">
          <h2 className="text-[13px] font-semibold tracking-tight text-[color:var(--ds-text-primary)]">
            {title}
          </h2>
          {subtitle && (
            <p className="text-[11px] text-[color:var(--ds-text-secondary)]">{subtitle}</p>
          )}
        </div>

        {variants && variants.length > 0 && (
          <div className="ml-4">
            <Select value={activeVariant} onValueChange={onVariantChange}>
              <SelectTrigger className="h-8 w-[220px] border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-secondary)] text-[12px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {variants.map((v) => (
                  <SelectItem key={v.id} value={v.id} className="text-[12px]">
                    {v.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          {actions}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setHelpOpen(true)}
                aria-label="Open help"
                className="h-8 w-8 border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] text-[color:var(--ds-text-secondary)] hover:bg-[color:var(--ds-surface-secondary)] hover:text-[color:var(--ds-text-primary)]"
                data-testid="tab-help"
              >
                <CircleHelp size={14} strokeWidth={1.75} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Help · how this tab works</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">{children}</CardContent>

      <HelpSheet
        open={helpOpen}
        onOpenChange={setHelpOpen}
        title={title}
        subtitle={subtitle}
        source={help}
      />
    </Card>
  );
}
