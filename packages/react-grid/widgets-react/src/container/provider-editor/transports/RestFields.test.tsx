import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RestFields } from './RestFields.js';

const base = {
  providerType: 'rest' as const,
  method: 'GET' as const,
  baseUrl: 'https://api.example.com',
  endpoint: '/v1/data',
};

afterEach(() => {
  cleanup();
});

describe('RestFields', () => {
  it('updates base URL and endpoint', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<RestFields cfg={base} onChange={onChange} />);
    await user.clear(screen.getByPlaceholderText('https://api.example.com'));
    await user.type(screen.getByPlaceholderText('https://api.example.com'), 'https://host');
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ baseUrl: expect.any(String) }));
  });

  it('shows POST body editor when method is POST', async () => {
    const onChange = vi.fn();
    render(<RestFields cfg={{ ...base, method: 'POST', body: '{}' }} onChange={onChange} />);
    expect(screen.getByPlaceholderText('{"asOfDate": "{{positions.asOfDate}}"}')).toBeInTheDocument();
  });

  it('clears auth when type is none', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <RestFields
        cfg={{
          ...base,
          auth: { type: 'bearer', credentials: 'tok' },
        }}
        onChange={onChange}
      />,
    );
    const authCombo = screen.getAllByRole('combobox').at(-1)!;
    await user.click(authCombo);
    await user.click(await screen.findByRole('option', { name: 'None' }));
    expect(onChange).toHaveBeenCalledWith({ auth: undefined });
  });

  it('updates endpoint, rows path, credentials, and api key header', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <RestFields
        cfg={{
          ...base,
          method: 'POST',
          body: '',
          auth: { type: 'apikey', credentials: 'secret', headerName: 'X-Key' },
        }}
        onChange={onChange}
      />,
    );
    await user.type(screen.getByPlaceholderText('/v1/positions'), '/v2/x');
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ endpoint: expect.any(String) }));
    await user.type(screen.getByPlaceholderText('data.results'), 'items');
    fireEvent.change(screen.getByPlaceholderText('{"asOfDate": "{{positions.asOfDate}}"}'), {
      target: { value: '{}' },
    });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ body: expect.any(String) }));
    const cred = screen.getByDisplayValue('secret');
    await user.type(cred, '!');
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ auth: expect.objectContaining({ credentials: expect.any(String) }) }));
    await user.type(screen.getByPlaceholderText('X-API-Key'), '-Header');
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ auth: expect.objectContaining({ headerName: expect.any(String) }) }));
  });
});
