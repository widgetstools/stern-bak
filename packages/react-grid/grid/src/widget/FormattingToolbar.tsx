/**
 * FormattingToolbar — entry component.
 *
 * Thin shell that wires:
 *   1. The unified `useFormatter()` state/actions hook;
 *   2. The `<Poppable />` host that turns the same component graph
 *      into either an in-grid horizontal toolbar or a popped-out
 *      vertical inspector.
 *
 * The actual rendering lives in `./formatter/` — both surfaces consume
 * the same modules (`ModuleContext`, `ModuleType`, ...) so behaviour
 * and appearance can't drift between them. Everything below is
 * orchestration only.
 */

import { ExternalLink } from 'lucide-react';
import { forwardRef } from 'react';
import {
  Poppable,
  useGridPlatform,
  type PoppableHandle,
} from '../customizer/internal.js'; // relative on purpose (self-reference breaks the dist build + risks barrel cycles)
import {
  FormatterPanel,
  FormatterToolbar,
  useFormatter,
} from './formatter';

export interface FormattingToolbarProps {
  /** When provided, the in-grid toolbar renders a trailing ✕ that
   *  invokes this (the host hides the toolbar). The popped-out panel
   *  keeps its own close affordance from the Poppable host. */
  onClose?: () => void;
}

/** Imperative handle over FormattingToolbar — thin alias over
 *  PoppableHandle. Lets MarketsGrid raise a buried popout
 *  programmatically before falling back to inline toggle. */
export type FormattingToolbarHandle = PoppableHandle;

export const FormattingToolbar = forwardRef<FormattingToolbarHandle, FormattingToolbarProps>(
  function FormattingToolbar({ onClose }, ref) {
    const platform = useGridPlatform();
    const { state, actions } = useFormatter();

    return (
      <>
        <Poppable
          ref={ref}
          name={`ds-popout-toolbar-${platform.gridId}`}
          title={`Formatting — ${platform.gridId}`}
          // 560×680 is the comfortable default: the header strip
          // (column label + scope toggle + undo/redo + preview pill +
          // module trail) needs ~540px, plus the body shows all five
          // modules without forcing scroll on a typical viewport.
          // The panel is fully responsive — resizing the popout
          // shrinks/grows the layout via flex; this is just the
          // initial size before the user drags the corner.
          width={560}
          height={680}
          // OpenFin honors alwaysOnTop (pins above other windows —
          // the right behaviour for a styling tool returned to often).
          // Browsers silently ignore.
          alwaysOnTop
          // OpenFin drops its OS title bar — the panel renders its own
          // draggable title bar with a close button. Browsers always
          // render full chrome so the title bar stays hidden there.
          frame={false}
        >
          {({ popped, PopoutButton, close }) => {
            // Clear actions fire immediately (no confirm dialog) — the
            // buttons flash a check on success and undo/redo covers misclicks.
            if (popped) {
              return (
                <FormatterPanel
                  state={state}
                  actions={actions}
                  frameless
                  onClose={close}
                  titleText={`Formatting — ${platform.gridId}`}
                />
              );
            }
            return (
              <FormatterToolbar
                state={state}
                actions={actions}
                onClose={onClose}
                popoutSlot={
                  <PopoutButton
                    className="fx-popout"
                    title="Open toolbar in a separate window"
                    data-testid="formatting-popout-btn"
                    icon={<ExternalLink size={13} strokeWidth={2.25} />}
                  />
                }
              />
            );
          }}
        </Poppable>
      </>
    );
  },
);
