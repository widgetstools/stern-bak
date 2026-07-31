import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StompFields } from './StompFields.js';

const base = {
  providerType: 'stomp' as const,
  websocketUrl: 'ws://localhost:8080',
  listenerTopic: '/topic/a',
};

describe('StompFields', () => {
  it('fires onChange for all stomp connection and trigger fields', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<StompFields cfg={base} onChange={onChange} />);
    await user.type(screen.getByPlaceholderText('/snapshot/positions/TRADER001'), '/topic/b');
    await user.type(screen.getByPlaceholderText('/snapshot/positions/TRADER001/1000'), '/dest');
    await user.type(screen.getByPlaceholderText('(empty — rate in destination)'), 'START');
    await user.type(screen.getByPlaceholderText('Success'), 'Done');
    expect(onChange).toHaveBeenCalled();
  });
});
