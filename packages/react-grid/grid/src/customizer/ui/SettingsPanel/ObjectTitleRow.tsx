import type { ReactNode } from 'react';

/**
 * Editor identity row.
 *
 * Renders a title input (or title node) on the left and a cluster of
 * actions on the right. Generous padding to match the reference screens;
 * 56px tall footprint keeps the header distinct from the meta strip
 * beneath.
 */

export interface ObjectTitleRowProps {
  title: ReactNode;
  /** Optional prefix slot — we no longer render an id chip, but keep
   *  the slot so panels can render status badges here if they want. */
  id?: string;
  /** Deprecated — dirty state is shown via the Save button state now. */
  dirty?: boolean;
  actions?: ReactNode;
  'data-testid'?: string;
}

export function ObjectTitleRow({ title, actions, ...rest }: ObjectTitleRowProps) {
  return (
    <div
      data-testid={rest['data-testid']}
      className="flex items-center gap-3 px-6 pt-5 pb-3"
    >
      <div className="flex-1 min-w-0">{title}</div>
      {actions && (
        <div className="flex items-center gap-2 flex-shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
}
