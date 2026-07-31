/**
 * GridDensityPill — center-top toolbar chip for AG Grid compactness presets.
 */

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  GRID_DENSITY_LABELS,
  GRID_DENSITY_ORDER,
  inferGridDensity,
  resolveGridDensity,
  type GridDensity,
} from '@wellsfargo-starui/design-system/adapters/ag-grid';
import type { GeneralSettingsState } from '@wellsfargo-starui/engine';
import { useOptionalGridPlatform } from '../customizer/hooks/GridProvider';
import { applyGridDensityLive } from './applyGridDensityLive';

export interface GridDensityPillProps {
  readonly density: GridDensity;
}

function GridDensityPillInner({ density }: GridDensityPillProps): ReactElement | null {
  const platform = useOptionalGridPlatform();
  const [open, setOpen] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);

  const applyDensity = useCallback(
    (next: GridDensity) => {
      if (!platform) return;
      applyGridDensityLive(platform, next);
      setOpen(false);
    },
    [platform],
  );

  useEffect(() => {
    if (!open) return;
    const onDocPointer = (e: PointerEvent) => {
      if (!hostRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDocPointer);
    return () => document.removeEventListener('pointerdown', onDocPointer);
  }, [open]);

  if (!platform) return null;

  return (
    <div ref={hostRef} className="ds-density-pill-host">
      <div className="ds-density-pill" data-open={open ? 'true' : 'false'}>
        <button
          type="button"
          className="ds-density-pill-chip"
          title="Grid spacing"
          aria-label={`Grid spacing: ${GRID_DENSITY_LABELS[density]}`}
          aria-expanded={open}
          aria-haspopup="true"
          data-testid="grid-density-pill-chip"
          onClick={() => setOpen((p) => !p)}
        >
          <span>{GRID_DENSITY_LABELS[density]}</span>
          <ChevronDown size={10} strokeWidth={2.5} aria-hidden />
        </button>
        <div
          className="ds-density-pill-menu"
          role="radiogroup"
          aria-label="Grid spacing"
          data-testid="grid-density-pill-menu"
        >
          {GRID_DENSITY_ORDER.map((option) => {
            const active = option === density;
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={active}
                className="ds-density-pill-option"
                data-active={active ? 'true' : 'false'}
                data-testid={`grid-density-option-${option}`}
                onPointerDown={(e) => {
                  e.preventDefault();
                  applyDensity(option);
                }}
              >
                {GRID_DENSITY_LABELS[option]}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export const GridDensityPill = memo(GridDensityPillInner);

/** @internal test helper */
export function resolveDensityForTest(settings: Partial<GeneralSettingsState> | null): GridDensity {
  return resolveGridDensity(settings);
}

/** @internal test helper */
export function inferDensityForTest(rowHeight: number, headerHeight: number): GridDensity {
  return inferGridDensity(rowHeight, headerHeight);
}
