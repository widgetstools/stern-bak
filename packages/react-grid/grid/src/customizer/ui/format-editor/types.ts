/**
 * Shared types for the Format Editor primitive set.
 *
 * These mirror the flat `CellStyleProperties` border triplets
 * (`borderTopWidth`, `borderTopStyle`, `borderTopColor`, ...) on a per-side
 * basis. Consumers translate from/to whatever state shape they persist.
 */

export type BorderSide = 'top' | 'right' | 'bottom' | 'left';
export type BorderStyle = 'solid' | 'dashed' | 'dotted' | 'double' | 'groove' | 'ridge' | 'none';
export type BorderMode = 'all' | BorderSide | 'custom';

export interface SideSpec {
  /** Hex color string, e.g. "#F87171". */
  color: string;
  /** Opacity 0–100. */
  alpha: number;
  /** Width in pixels (0 = no border on this side). */
  width: number;
  /** Solid / dashed / dotted. */
  style: BorderStyle;
  /** Whether this side is rendered at all; hidden sides preserve their
   *  color/width/style so toggling back on restores the spec. */
  visible: boolean;
}

export const EDGE_ORDER: BorderSide[] = ['top', 'right', 'bottom', 'left'];

export const defaultSideSpec: SideSpec = {
  color: '#000000',
  alpha: 100,
  width: 1,
  style: 'solid',
  visible: true,
};

export function makeDefaultSides(): Record<BorderSide, SideSpec> {
  return {
    top: { ...defaultSideSpec },
    right: { ...defaultSideSpec },
    bottom: { ...defaultSideSpec },
    left: { ...defaultSideSpec },
  };
}
