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

  it('switches the HTTP method, which is what reveals the body editor', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<RestFields cfg={base} onChange={onChange} />);
    // Body editor is POST-only; the GET form must not offer one.
    expect(screen.queryByPlaceholderText('{"asOfDate": "{{positions.asOfDate}}"}')).toBeNull();

    await user.click(screen.getAllByRole('combobox')[0]);
    await user.click(await screen.findByRole('option', { name: 'POST' }));
    expect(onChange).toHaveBeenCalledWith({ method: 'POST' });
  });

  it('edits query parameters and headers independently', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <RestFields
        cfg={{ ...base, queryParams: { limit: '10' }, headers: { 'X-Desk': 'rates' } }}
        onChange={onChange}
      />,
    );

    await user.type(screen.getByDisplayValue('10'), '0');
    expect(onChange).toHaveBeenCalledWith({ queryParams: { limit: '100' } });

    // The two editors are separate config keys; a shared handler would write
    // a header into queryParams and silently drop it from the request.
    await user.type(screen.getByDisplayValue('rates'), '!');
    expect(onChange).toHaveBeenLastCalledWith({ headers: { 'X-Desk': 'rates!' } });
  });

  it('builds an auth block when a scheme is chosen, carrying the existing credentials over', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <RestFields
        cfg={{ ...base, auth: { type: 'apikey', credentials: 'secret', headerName: 'X-Key' } }}
        onChange={onChange}
      />,
    );
    await user.click(screen.getAllByRole('combobox').at(-1)!);
    await user.click(await screen.findByRole('option', { name: 'Bearer Token' }));
    // Re-typing the token on every scheme change is the thing to avoid.
    expect(onChange).toHaveBeenCalledWith({
      auth: { type: 'bearer', credentials: 'secret', headerName: 'X-Key' },
    });
  });

  it('starts an auth block from nothing with empty credentials', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<RestFields cfg={base} onChange={onChange} />);
    await user.click(screen.getAllByRole('combobox').at(-1)!);
    await user.click(await screen.findByRole('option', { name: 'Basic' }));
    expect(onChange).toHaveBeenCalledWith({
      auth: { type: 'basic', credentials: '', headerName: undefined },
    });
  });

  it('renders a provider with nothing filled in yet', () => {
    // A freshly created REST provider has only `providerType`. Every field
    // reads through a `?? ''`, so a missing one must render an empty control
    // rather than an uncontrolled input React then warns about.
    const onChange = vi.fn();
    render(<RestFields cfg={{ providerType: 'rest' }} onChange={onChange} />);
    expect(screen.getByPlaceholderText('https://api.example.com')).toHaveValue('');
    expect(screen.getByPlaceholderText('/v1/positions')).toHaveValue('');
    expect(screen.getByPlaceholderText('data.results')).toHaveValue('');
    // Method defaults to GET, so no body editor and no auth fields.
    expect(screen.queryByPlaceholderText('{"asOfDate": "{{positions.asOfDate}}"}')).toBeNull();
    expect(screen.queryByPlaceholderText('X-API-Key')).toBeNull();
    expect(screen.getAllByText('No entries configured')).toHaveLength(2);
  });

  it('shows the header-name field only for the api-key scheme', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <RestFields cfg={{ ...base, auth: { type: 'bearer', credentials: 'tok' } }} onChange={onChange} />,
    );
    expect(screen.queryByPlaceholderText('X-API-Key')).toBeNull();

    rerender(
      <RestFields cfg={{ ...base, auth: { type: 'apikey', credentials: 'tok' } }} onChange={onChange} />,
    );
    expect(screen.getByPlaceholderText('X-API-Key')).toHaveValue('');
  });
});
