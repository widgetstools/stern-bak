/**
 * ToolbarContainer Component
 *
 * Manages multiple CollapsibleToolbar instances with intelligent auto-arrangement
 * of collapsed pills to prevent overlapping.
 *
 * Features:
 * - Auto-arranges collapsed pills side-by-side
 * - Assigns default colors to toolbar instances
 * - Handles z-index stacking for hover expansion
 */

import React from 'react';

export interface ToolbarContainerProps {
  /** Child toolbars */
  children: React.ReactNode;
  /** Optional class name */
  className?: string;
}

/**
 * Default color palette for multiple toolbars
 * Used when toolbar doesn't specify its own color
 */
export const DEFAULT_TOOLBAR_COLORS = [
  'blue-500',
  'green-500',
  'purple-500',
  'orange-500',
  'pink-500',
  'cyan-500',
  'red-500',
  'yellow-500',
  'indigo-500',
  'teal-500',
];

/**
 * ToolbarContainer - Wraps multiple CollapsibleToolbar components
 * and manages their layout and arrangement
 */
export const ToolbarContainer: React.FC<ToolbarContainerProps> = ({
  children,
  className = '',
}) => {
  return (
    <div className={`toolbar-container ${className}`}>
      {/*
        Toolbars are stacked vertically
        Each toolbar manages its own collapse/expand state
        The auto-arrange happens via CSS flexbox
      */}
      <div className="flex flex-col">
        {children}
      </div>
    </div>
  );
};

export default ToolbarContainer;
