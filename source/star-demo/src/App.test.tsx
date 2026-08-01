import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { getOneByRole, getOneByText } from '../../../test-utils/queries';
import App from './App';

describe('App', () => {
  it('renders home route content and navigation links', () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );

    expect(getOneByText('Star Demo')).toBeInTheDocument();
    expect(getOneByText(/Minimal OpenFin workspace/)).toBeInTheDocument();
    expect(getOneByText(/Launch in OpenFin/)).toBeInTheDocument();
    expect(getOneByRole('link', { name: /MarketsGrid blotter/ })).toHaveAttribute(
      'href',
      '/blotters/marketsgrid',
    );
    expect(getOneByRole('link', { name: /Create \/ edit STOMP/ })).toHaveAttribute(
      'href',
      '/dataproviders',
    );
  });
});
