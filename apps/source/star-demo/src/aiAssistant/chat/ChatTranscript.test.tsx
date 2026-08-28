import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

/**
 * `ScrollArea` (Radix) is reached via `@wellsfargo-starui/react`, resolved
 * from the repo root — a different React instance than `apps/`' own
 * react-dom, which throws "Invalid hook call" the moment it renders. Same
 * root cause `DataResultCell.test.tsx` documents for the chart wrapper; here
 * only `ScrollArea` needs stubbing, so everything else comes through real.
 */
vi.mock('@wellsfargo-starui/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@wellsfargo-starui/react')>();
  return {
    ...actual,
    ScrollArea: React.forwardRef<HTMLDivElement, React.PropsWithChildren<{ className?: string }>>(
      ({ className, children }, ref) => React.createElement('div', { ref, className }, children),
    ),
  };
});

import { ChatTranscript } from './ChatTranscript';
import type { TranscriptItem } from './useChatSession';
import { DATA_CELL, type DataCellPayload } from '../dataTools';

// jsdom doesn't implement scrollIntoView; ChatTranscript's auto-scroll effect
// calls it unconditionally on every render.
Element.prototype.scrollIntoView = vi.fn();

const PAYLOAD: DataCellPayload = {
  kind: DATA_CELL,
  gridName: 'TestGrid',
  source: 'live',
  provenance: 'live from "Positions Feed"',
  rowCount: 3,
  ran: '3 rows',
};

const ITEM: TranscriptItem = {
  kind: 'tool',
  // Deliberately different from the tool activity's own id below — this is
  // the exact distinction the currying exists to enforce: the panel must be
  // told the TRANSCRIPT item's id, never the LLM backend's tool-call id.
  id: 'it-transcript-item-id',
  activity: { id: 'call_backend_id', name: 'summarize_grid_data', args: {}, status: 'ok', result: PAYLOAD },
};

describe('ChatTranscript — opening an analysis result', () => {
  it('curries the TRANSCRIPT item id into the panel callback, not the backend tool-call id', async () => {
    const user = userEvent.setup();
    const onOpenAnalysis = vi.fn();
    render(<ChatTranscript items={[ITEM]} isBusy={false} error={null} onOpenAnalysis={onOpenAnalysis} />);

    await user.click(screen.getByRole('button', { name: /View in the analysis panel/ }));

    expect(onOpenAnalysis).toHaveBeenCalledTimes(1);
    expect(onOpenAnalysis).toHaveBeenCalledWith('it-transcript-item-id');
    expect(onOpenAnalysis).not.toHaveBeenCalledWith('call_backend_id');
  });

  it('is not clickable when the transcript has no panel to open into', () => {
    render(<ChatTranscript items={[ITEM]} isBusy={false} error={null} />);
    expect(screen.getByRole('button', { name: /View in the analysis panel/ }).hasAttribute('disabled')).toBe(true);
  });
});
