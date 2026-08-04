import { useMemo, useState } from 'react';
import {
  Button,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@wellsfargo-starui/react';
import { ExternalLink } from 'lucide-react';
import { buildStressColumns, STRESS_ROW_COUNTS } from '../data/stressColumns';
import { LabFeatureTab } from './LabFeatureTab';
import { STRESS_FEATURE } from './labFeatureConfigs';

/**
 * The tab the other sixteen cannot be: a big, wide book, and a second window
 * onto the same one.
 *
 * Every other tab runs 500 rows over 20-40 columns, where both row engines are
 * comfortable and therefore indistinguishable. The multi-window story is the
 * entire reason the Perspective engine exists — N blotters sharing ONE copy of
 * the book instead of N copies — and it cannot be seen at all until there is
 * enough data for the copies to matter and more than one window to hold them.
 *
 * So this tab adds exactly two controls the shared shell has no reason to
 * carry: how many rows to ask the provider for, and a second window on the
 * same tab. Everything else — the row-engine picker, the profiles, the demo
 * console — is the same shell every other tab uses.
 *
 * What to look for: switch the engine to Perspective, open a second window,
 * and watch that the second one paints without re-sending the book. Under the
 * client model each window pays for its own full copy; under Perspective the
 * worker already has it and the new window opens a View.
 */
export function StressTestTab() {
  const [rowCount, setRowCount] = useState<number>(10_000);

  // Rebuilt only when the count changes, which is also when the grid remounts —
  // building 120 column defs on every render of a tab this heavy is exactly the
  // cost this tab exists to measure, and it should not be measuring itself.
  const config = useMemo(
    () => ({ ...STRESS_FEATURE, getColumnDefs: () => buildStressColumns() }),
    [],
  );

  const openSecondWindow = () => {
    window.open(
      `${window.location.origin}${window.location.pathname}?tab=stress`,
      '_blank',
      'noopener,width=1400,height=900',
    );
  };

  return (
    <LabFeatureTab
      config={config}
      rowCount={rowCount}
      actions={
        <div className="flex items-center gap-2">
          <Label htmlFor="stress-row-count" className="text-[11px] text-[color:var(--ds-text-secondary)]">
            Rows
          </Label>
          <Select
            value={String(rowCount)}
            onValueChange={(v) => setRowCount(Number(v))}
          >
            <SelectTrigger
              id="stress-row-count"
              className="h-8 w-[110px] border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-secondary)] text-[12px]"
              data-testid="stress-row-count"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STRESS_ROW_COUNTS.map((n) => (
                <SelectItem key={n} value={String(n)} className="text-[12px]">
                  {n.toLocaleString()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={openSecondWindow}
            className="h-8 gap-1.5 border-[color:var(--ds-border-primary)] text-[12px]"
            data-testid="stress-open-window"
            title="Open a second window on this tab — under Perspective both read one Table"
          >
            <ExternalLink size={13} />
            Second window
          </Button>
        </div>
      }
    />
  );
}
