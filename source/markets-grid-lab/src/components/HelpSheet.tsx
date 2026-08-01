import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@wellsfargo-starui/react';
import { Markdown } from './Markdown';

export interface HelpSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  source: string;
}

export function HelpSheet({ open, onOpenChange, title, subtitle, source }: HelpSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full max-w-[640px] overflow-y-auto bg-[color:var(--ds-surface-primary)] p-0 sm:max-w-[640px]"
      >
        <SheetHeader className="sticky top-0 z-10 border-b border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] px-5 py-4">
          <SheetTitle className="text-[color:var(--ds-text-primary)]">{title}</SheetTitle>
          {subtitle && (
            <SheetDescription className="text-[color:var(--ds-text-secondary)]">
              {subtitle}
            </SheetDescription>
          )}
        </SheetHeader>
        <div className="px-5 py-5">
          <Markdown source={source} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
