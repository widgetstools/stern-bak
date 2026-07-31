import { lazy, Suspense, forwardRef } from 'react';
import type { ExpressionEditorProps, ExpressionEditorHandle } from './types';
import { FallbackInput } from './FallbackInput';

/**
 * Public `<ExpressionEditor>`. Lazy-loads the CodeMirror editor on first
 * render; shows the plain-input fallback while the chunk is downloading so
 * the field is NEVER unresponsive — required for a trading terminal where
 * expression inputs can be on the primary path.
 *
 * If the editor chunk fails to load (network error, extension blocking,
 * bundler regression), the fallback stays mounted indefinitely and the field
 * still works — just without autocomplete / syntax highlighting.
 */
const LazyInner = lazy(() => import('./ExpressionEditorInner'));

export const ExpressionEditor = forwardRef<ExpressionEditorHandle, ExpressionEditorProps>(
  function ExpressionEditor(props, ref) {
    return (
      <Suspense fallback={<FallbackInput {...props} handleRef={ref} />}>
        <LazyInner {...props} handleRef={ref} />
      </Suspense>
    );
  },
);

export type { ExpressionEditorProps, ExpressionEditorHandle } from './types';
