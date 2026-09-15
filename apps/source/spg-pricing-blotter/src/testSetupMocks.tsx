/**
 * Module mocks for this app's unit tests.
 *
 * `@wellsfargo-starui/react` is aliased to its BUILT `dist`, which resolves
 * Radix out of the platform checkout's `node_modules` while the test file's
 * React comes from the apps install root — two React instances, and every hook
 * inside a Radix Dialog dies with "Cannot read properties of null (reading
 * 'useRef')". Neither `resolve.dedupe` nor `server.deps.inline` reaches an
 * already-externalised transitive, so the primitives are stood in for here,
 * the same way `markets-grid-lab` does it.
 *
 * The stand-ins are deliberately dumb DOM: what these tests assert is the
 * app's own logic — CSV parse → server lookup → preview → stage, and the
 * write-state chips — not Radix's portal and focus behaviour, which is the
 * design system's own test surface.
 */
import React from 'react';
import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

vi.mock('./styles.css', () => ({}));

type Props = Record<string, unknown> & { children?: React.ReactNode; asChild?: boolean };

function passthrough(tag: string) {
  return function Stub({ children, asChild: _asChild, ...rest }: Props) {
    return React.createElement(tag, rest, children as React.ReactNode);
  };
}

vi.mock('@wellsfargo-starui/react', () => ({
  Badge: passthrough('span'),
  Button: function Button({ children, ...rest }: Props) {
    return React.createElement('button', { type: 'button', ...rest }, children as React.ReactNode);
  },
  // `open` gates the subtree exactly as Radix does, so a closed dialog
  // renders nothing and `onOpenChange(false)` is still the close signal.
  Dialog: function Dialog({ open, children }: Props) {
    return open ? React.createElement(React.Fragment, null, children as React.ReactNode) : null;
  },
  DialogContent: passthrough('div'),
  DialogHeader: passthrough('div'),
  DialogTitle: passthrough('h2'),
  DialogDescription: passthrough('p'),
  DialogFooter: passthrough('div'),
  Alert: passthrough('div'),
  AlertTitle: passthrough('h3'),
  AlertDescription: passthrough('div'),
}));
