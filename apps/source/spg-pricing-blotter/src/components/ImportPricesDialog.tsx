/**
 * Bulk price import — the trader's `cusip,price` CSV, validated against
 * the SERVER before anything touches the grid:
 *
 *   parse (per-line errors surfaced) → `/api/lookup` (unknown cusips can
 *   never upsert phantom rows into the engine) → preview old → new →
 *   Apply = STAGE ONLY: amber cells in the grid, nothing committed until
 *   the toolbar's Save.
 */
import { useCallback, useRef, useState } from 'react';
import { FileUp, Upload } from 'lucide-react';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@wellsfargo-starui/react';
import { parsePriceCsv, type CsvParseResult } from '../trading/csv';
import { lookupPositions, type ServerPosition } from '../trading/api';

interface PreviewRow {
  cusip: string;
  oldPrice: number;
  newPrice: number;
}

interface Preview {
  matched: PreviewRow[];
  unchanged: number;
  missing: string[];
  errors: CsvParseResult['errors'];
}

export interface ImportPricesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStage: (rows: Array<{ cusip: string; fields: Record<string, unknown> }>) => Promise<void>;
}

export function ImportPricesDialog({ open, onOpenChange, onStage }: ImportPricesDialogProps) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const reset = useCallback(() => {
    setFileName(null);
    setPreview(null);
    setProblem(null);
    setBusy(false);
    if (fileRef.current) fileRef.current.value = '';
  }, []);

  const onFile = useCallback(async (file: File) => {
    setBusy(true);
    setProblem(null);
    try {
      const parsed = parsePriceCsv(await file.text());
      if (parsed.rows.length === 0) {
        setPreview({ matched: [], unchanged: 0, missing: [], errors: parsed.errors });
        setFileName(file.name);
        return;
      }
      const { found, missing } = await lookupPositions(parsed.rows.map((r) => r.cusip));
      const byCusip = new Map<string, ServerPosition>(found.map((r) => [r.cusip, r]));
      const matched: PreviewRow[] = [];
      let unchanged = 0;
      for (const row of parsed.rows) {
        const server = byCusip.get(row.cusip);
        if (!server) continue;
        if (server.price === row.price) unchanged += 1;
        else matched.push({ cusip: row.cusip, oldPrice: server.price, newPrice: row.price });
      }
      setPreview({ matched, unchanged, missing, errors: parsed.errors });
      setFileName(file.name);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  const apply = useCallback(async () => {
    if (!preview || preview.matched.length === 0) return;
    setBusy(true);
    try {
      await onStage(preview.matched.map((m) => ({ cusip: m.cusip, fields: { price: m.newPrice } })));
      onOpenChange(false);
      reset();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [preview, onStage, onOpenChange, reset]);

  return (
    <Dialog open={open} onOpenChange={(next) => { onOpenChange(next); if (!next) reset(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Import prices from CSV</DialogTitle>
          <DialogDescription>
            One <code className="font-mono">cusip,price</code> pair per line. Rows are validated
            against the server, applied to the grid as <span className="text-[color:var(--ds-accent-warning)]">staged</span> cells,
            and committed only when you press Save.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            data-testid="spg-import-file"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onFile(file);
            }}
          />
          <Button
            variant="outline"
            className="justify-start gap-2"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            data-testid="spg-import-pick"
          >
            <FileUp size={15} />
            {fileName ?? 'Choose price file…'}
          </Button>

          {problem ? (
            <p className="text-[13px] text-[color:var(--ds-accent-negative)]">{problem}</p>
          ) : null}

          {preview ? (
            <div className="flex flex-col gap-2" data-testid="spg-import-preview">
              <div className="flex flex-wrap items-center gap-2 text-[13px]">
                <Badge variant="outline" className="border-[color:var(--ds-accent-warning)] text-[color:var(--ds-accent-warning)]">
                  {preview.matched.length} to stage
                </Badge>
                {preview.unchanged > 0 ? <Badge variant="outline">{preview.unchanged} unchanged</Badge> : null}
                {preview.missing.length > 0 ? (
                  <Badge variant="outline" className="border-[color:var(--ds-accent-negative)] text-[color:var(--ds-accent-negative)]">
                    {preview.missing.length} unknown cusip{preview.missing.length === 1 ? '' : 's'}
                  </Badge>
                ) : null}
                {preview.errors.length > 0 ? (
                  <Badge variant="outline" className="border-[color:var(--ds-accent-negative)] text-[color:var(--ds-accent-negative)]">
                    {preview.errors.length} bad line{preview.errors.length === 1 ? '' : 's'}
                  </Badge>
                ) : null}
              </div>

              {preview.matched.length > 0 ? (
                <div className="max-h-44 overflow-y-auto rounded-md border border-[color:var(--ds-border-primary)]">
                  <table className="w-full text-[12px]">
                    <thead className="sticky top-0 bg-[color:var(--ds-surface-secondary)] text-left text-[color:var(--ds-text-secondary)]">
                      <tr>
                        <th className="px-2 py-1 font-medium">CUSIP</th>
                        <th className="px-2 py-1 text-right font-medium">Current</th>
                        <th className="px-2 py-1 text-right font-medium">Import</th>
                      </tr>
                    </thead>
                    <tbody className="font-mono">
                      {preview.matched.slice(0, 200).map((m) => (
                        <tr key={m.cusip} className="border-t border-[color:var(--ds-border-primary)]">
                          <td className="px-2 py-0.5">{m.cusip}</td>
                          <td className="px-2 py-0.5 text-right text-[color:var(--ds-text-secondary)]">{m.oldPrice.toFixed(3)}</td>
                          <td className="px-2 py-0.5 text-right text-[color:var(--ds-accent-warning)]">{m.newPrice.toFixed(3)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {preview.matched.length > 200 ? (
                    <p className="px-2 py-1 text-[11px] text-[color:var(--ds-text-faint)]">
                      …and {preview.matched.length - 200} more.
                    </p>
                  ) : null}
                </div>
              ) : null}

              {preview.missing.length > 0 ? (
                <p className="text-[12px] leading-snug text-[color:var(--ds-text-secondary)]">
                  Not on the server (skipped): <span className="font-mono">{preview.missing.slice(0, 8).join(', ')}</span>
                  {preview.missing.length > 8 ? ` +${preview.missing.length - 8} more` : ''}
                </p>
              ) : null}
              {preview.errors.slice(0, 3).map((err) => (
                <p key={err.line} className="text-[12px] text-[color:var(--ds-text-faint)]">
                  line {err.line}: {err.reason}
                </p>
              ))}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => { onOpenChange(false); reset(); }}>Cancel</Button>
          <Button
            className="gap-2"
            disabled={busy || !preview || preview.matched.length === 0}
            onClick={() => void apply()}
            data-testid="spg-import-apply"
          >
            <Upload size={15} />
            Stage {preview?.matched.length ?? 0} price{(preview?.matched.length ?? 0) === 1 ? '' : 's'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
