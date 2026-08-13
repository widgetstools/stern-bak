import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getOneByTestId, getOneByTestIdAttribute, getOneByText } from '../../../../test-utils/queries';
import { mockSubscribeThemeBroadcast, resetStaruiMocks } from '../staruiVitestMocks';

describe('DataProviders', () => {
  beforeEach(() => {
    resetStaruiMocks();
    document.title = 'Original Title';
    document.body.style.padding = '10px';
    document.body.style.margin = '5px';
    document.body.style.overflow = 'auto';
  });

  it('renders editor with user id and syncs theme', async () => {
    const DataProviders = (await import('./DataProviders')).default;
    render(
      <MemoryRouter initialEntries={['/dataproviders']}>
        <DataProviders />
      </MemoryRouter>,
    );

    expect(getOneByTestId('data-provider-editor')).toHaveAttribute('data-user-id', 'dev1');
    expect(getOneByText(/Back to home/)).toBeInTheDocument();
    expect(mockSubscribeThemeBroadcast).toHaveBeenCalled();
    expect(document.title).toBe('Data Providers · Markets UI');
    expect(document.body.style.padding).toBe('0px');
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('forwards provider id from search params', async () => {
    const DataProviders = (await import('./DataProviders')).default;
    render(
      <MemoryRouter initialEntries={['/dataproviders?id=stomp-42']}>
        <DataProviders />
      </MemoryRouter>,
    );

    expect(getOneByTestIdAttribute('data-provider-editor', 'data-initial-id', 'stomp-42')).toBeInTheDocument();
  });

  it('restores body styles and title on unmount', async () => {
    const DataProviders = (await import('./DataProviders')).default;
    const { unmount } = render(
      <MemoryRouter>
        <DataProviders />
      </MemoryRouter>,
    );

    unmount();
    expect(document.title).toBe('Original Title');
    expect(document.body.style.padding).toBe('10px');
    expect(document.body.style.margin).toBe('5px');
    expect(document.body.style.overflow).toBe('auto');
  });
});
