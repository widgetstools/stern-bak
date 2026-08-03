/**
 * The point of this component is composition, so the test is mostly that the
 * STOMP form is genuinely the STOMP form — a fork would pass a test that only
 * checked the five Perspective fields.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { StompPerspectiveProviderConfig } from '@wellsfargo-starui/types/shared';
import { StompPerspectiveFields } from './StompPerspectiveFields.js';

const base: StompPerspectiveProviderConfig = {
  providerType: 'stomp-perspective',
  websocketUrl: 'ws://localhost:8081',
  listenerTopic: '/snapshot/positions/T1',
  keyColumn: 'positionId',
  columnDefinitions: [{ field: 'positionId', headerName: 'Position', cellDataType: 'text' }],
};

function renderFields(cfg: StompPerspectiveProviderConfig = base, onChange = vi.fn()) {
  render(
    <StompPerspectiveFields
      cfg={cfg}
      onChange={onChange}
      providerLabel="positions-live"
      providerId="dp-1"
    />,
  );
  return onChange;
}

describe('StompPerspectiveFields', () => {
  it('still edits every STOMP wire setting', async () => {
    const user = userEvent.setup();
    const onChange = renderFields();

    await user.type(screen.getByPlaceholderText('ws://localhost:8080'), 'x');
    expect(onChange).toHaveBeenCalledWith({ websocketUrl: 'ws://localhost:8081x' });

    onChange.mockClear();
    await user.type(screen.getByPlaceholderText('Success'), 'S');
    expect(onChange).toHaveBeenCalledWith({ snapshotEndToken: 'S' });
  });

  it('edits the Table settings alongside them', async () => {
    const user = userEvent.setup();
    const onChange = renderFields();

    await user.type(screen.getByPlaceholderText('dp-1'), 'p');
    expect(onChange).toHaveBeenCalledWith({ tableName: 'p' });
  });

  it('surfaces an unusable keyColumn before save', () => {
    renderFields({ ...base, keyColumn: ['book', 'positionId'] });

    expect(screen.getByTestId('perspective-key-column-error')).toHaveTextContent(
      'composite keyColumn [book, positionId]',
    );
  });
});
