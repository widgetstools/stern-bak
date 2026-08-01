import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import {
  PortalContainerProvider,
  usePortalContainer,
  useResolvedPortalContainer,
} from './portal-container';

afterEach(cleanup);

describe('PortalContainerProvider', () => {
  it('provides container context to children', () => {
    const container = document.createElement('div');
    let capturedValue: HTMLElement | null = null;

    function TestComponent() {
      capturedValue = usePortalContainer();
      return null;
    }

    render(
      <PortalContainerProvider container={container}>
        <TestComponent />
      </PortalContainerProvider>
    );

    expect(capturedValue).toBe(container);
  });

  it('provides null when no container is set', () => {
    let capturedValue: HTMLElement | null = null;

    function TestComponent() {
      capturedValue = usePortalContainer();
      return null;
    }

    render(
      <PortalContainerProvider container={null}>
        <TestComponent />
      </PortalContainerProvider>
    );

    expect(capturedValue).toBeNull();
  });

  it('renders children correctly', () => {
    const container = document.createElement('div');
    const { getByText } = render(
      <PortalContainerProvider container={container}>
        <div>Child content</div>
      </PortalContainerProvider>
    );

    expect(getByText('Child content')).toBeInTheDocument();
  });
});

describe('usePortalContainer', () => {
  it('returns null outside of provider', () => {
    let capturedValue: HTMLElement | null = null;

    function TestComponent() {
      capturedValue = usePortalContainer();
      return null;
    }

    render(<TestComponent />);

    expect(capturedValue).toBeNull();
  });

  it('returns container from context', () => {
    const container = document.createElement('div');
    let capturedValue: HTMLElement | null = null;

    function TestComponent() {
      capturedValue = usePortalContainer();
      return null;
    }

    render(
      <PortalContainerProvider container={container}>
        <TestComponent />
      </PortalContainerProvider>
    );

    expect(capturedValue).toBe(container);
  });
});

describe('useResolvedPortalContainer', () => {
  it('returns explicit container from context', () => {
    const container = document.createElement('div');
    let capturedValue: HTMLElement | undefined;

    function TestComponent() {
      capturedValue = useResolvedPortalContainer();
      return null;
    }

    render(
      <PortalContainerProvider container={container}>
        <TestComponent />
      </PortalContainerProvider>
    );

    expect(capturedValue).toBe(container);
  });

  it('returns document.body when no explicit container is provided', () => {
    let capturedValue: HTMLElement | undefined;

    function TestComponent() {
      capturedValue = useResolvedPortalContainer();
      return null;
    }

    render(
      <PortalContainerProvider container={null}>
        <TestComponent />
      </PortalContainerProvider>
    );

    expect(capturedValue).toBe(document.body);
  });

  it('returns document.body when used outside provider', () => {
    let capturedValue: HTMLElement | undefined;

    function TestComponent() {
      capturedValue = useResolvedPortalContainer();
      return null;
    }

    render(<TestComponent />);

    expect(capturedValue).toBe(document.body);
  });

});
