import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { StompSsrmProviderConfig } from '@wellsfargo-starui/types/shared';
import { StompSsrmFields } from './StompSsrmFields.js';

const base: StompSsrmProviderConfig = {
  providerType: 'stomp-ssrm',
  websocketUrl: 'ws://localhost:8081',
  listenerTopic: '/snapshot/positions/TRADER001',
  snapshotEndToken: 'Success',
  requestBody: '',
  columnDefinitions: [],
  blockSize: 200,
  publishWindowMs: 100,
  searchColumns: [],
};

describe('StompSsrmFields', () => {
  it('renders STOMP connection fields plus SSRM knobs', () => {
    render(<StompSsrmFields cfg={base} onChange={vi.fn()} />);
    expect(screen.getByText('Block size')).toBeInTheDocument();
    expect(screen.getByText('Publish window (ms)')).toBeInTheDocument();
    expect(screen.getByText('Search columns')).toBeInTheDocument();
  });

  it('edits blockSize', async () => {
    const onChange = vi.fn();
    render(<StompSsrmFields cfg={base} onChange={onChange} />);
    const input = screen.getByDisplayValue('200');
    await userEvent.clear(input);
    await userEvent.type(input, '400');
    expect(onChange).toHaveBeenCalled();
  });

  it('defaults empty knobs and writes publish window + search columns', async () => {
    const onChange = vi.fn();
    const { unmount } = render(
      <StompSsrmFields
        cfg={{ ...base, blockSize: undefined, publishWindowMs: undefined, searchColumns: undefined }}
        onChange={onChange}
      />,
    );
    expect(screen.getByDisplayValue('200')).toBeInTheDocument();
    expect(screen.getByDisplayValue('100')).toBeInTheDocument();
    unmount();

    render(
      <StompSsrmFields
        cfg={{ ...base, searchColumns: ['desk'] }}
        onChange={onChange}
      />,
    );
    const publish = screen.getByDisplayValue('100');
    await userEvent.clear(publish);
    await userEvent.type(publish, '250');
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ publishWindowMs: expect.any(Number) }));

    const search = screen.getByDisplayValue('desk');
    await userEvent.clear(search);
    await userEvent.type(search, 'desk, trader');
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      searchColumns: expect.any(Array),
    }));
  });
});
