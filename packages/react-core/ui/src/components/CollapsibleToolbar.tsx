/**
 * CollapsibleToolbar Component
 *
 * A reusable toolbar with a persistent slim pill handle.
 * Features:
 * - Always-visible slim pill handle (70px wide, semi-transparent)
 * - Hover over pill to expand toolbar
 * - Pin to lock expanded state
 * - Auto-collapse when unpinned and mouse leaves
 */

import React, { useState } from 'react';
import { Pin, PinOff } from 'lucide-react';
import { Button } from './button';

export interface CollapsibleToolbarProps {
  /** Unique identifier for this toolbar instance */
  id?: string;
  /** Tailwind color class for the pill (e.g., 'blue', 'green', 'purple') */
  color?: 'blue' | 'green' | 'purple' | 'orange' | 'pink' | 'cyan' | 'red' | 'yellow';
  /** Whether the toolbar is collapsed */
  isCollapsed: boolean;
  /** Whether the toolbar is pinned (locked expanded) */
  isPinned: boolean;
  /** Callback when collapsed state changes */
  onCollapsedChange: (collapsed: boolean) => void;
  /** Callback when pinned state changes */
  onPinnedChange: (pinned: boolean) => void;
  /** Toolbar content */
  children: React.ReactNode;
  /** Optional class name */
  className?: string;
}

// Color mapping for Tailwind classes (full class names required for JIT)
const colorStyles = {
  blue: {
    pill: 'bg-blue-500/40',
    pillHover: 'hover:bg-blue-500/60',
    border: 'border-blue-500',
    dot: 'bg-blue-500',
  },
  green: {
    pill: 'bg-green-500/40',
    pillHover: 'hover:bg-green-500/60',
    border: 'border-green-500',
    dot: 'bg-green-500',
  },
  purple: {
    pill: 'bg-purple-500/40',
    pillHover: 'hover:bg-purple-500/60',
    border: 'border-purple-500',
    dot: 'bg-purple-500',
  },
  orange: {
    pill: 'bg-orange-500/40',
    pillHover: 'hover:bg-orange-500/60',
    border: 'border-orange-500',
    dot: 'bg-orange-500',
  },
  pink: {
    pill: 'bg-pink-500/40',
    pillHover: 'hover:bg-pink-500/60',
    border: 'border-pink-500',
    dot: 'bg-pink-500',
  },
  cyan: {
    pill: 'bg-cyan-500/40',
    pillHover: 'hover:bg-cyan-500/60',
    border: 'border-cyan-500',
    dot: 'bg-cyan-500',
  },
  red: {
    pill: 'bg-red-500/40',
    pillHover: 'hover:bg-red-500/60',
    border: 'border-red-500',
    dot: 'bg-red-500',
  },
  yellow: {
    pill: 'bg-yellow-500/40',
    pillHover: 'hover:bg-yellow-500/60',
    border: 'border-yellow-500',
    dot: 'bg-yellow-500',
  },
};

export const CollapsibleToolbar: React.FC<CollapsibleToolbarProps> = ({
  color = 'blue',
  isPinned,
  onCollapsedChange,
  onPinnedChange,
  children,
  className = '',
}) => {
  const [isHovering, setIsHovering] = useState(false);

  // Get color styles
  const styles = colorStyles[color];

  // Determine if toolbar content should be shown
  const showContent = isPinned || isHovering;

  // Handle mouse enter on the entire toolbar area
  const handleMouseEnter = () => {
    setIsHovering(true);
    if (!isPinned) {
      onCollapsedChange(false);
    }
  };

  // Handle mouse leave from the entire toolbar area
  const handleMouseLeave = () => {
    setIsHovering(false);
    if (!isPinned) {
      onCollapsedChange(true);
    }
  };

  // Toggle pin state
  const handleTogglePin = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newPinnedState = !isPinned;
    onPinnedChange(newPinnedState);

    // When pinning, ensure toolbar is expanded
    if (newPinnedState) {
      onCollapsedChange(false);
    } else {
      // When unpinning, collapse if not hovering
      if (!isHovering) {
        onCollapsedChange(true);
      }
    }
  };

  return (
    <div
      className={`relative ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Always-visible slim pill handle */}
      <div
        className={`
          absolute top-0 left-1/2 -translate-x-1/2 z-20
          w-[70px] h-3 rounded-b-md
          ${styles.pill} ${styles.pillHover}
          backdrop-blur-sm
          flex items-center justify-center gap-1
          transition-all duration-200 ease-in-out
          cursor-pointer
        `}
        title={showContent ? 'Toolbar expanded' : 'Hover to expand toolbar'}
      >
        {/* Color indicator dot */}
        <div className={`w-1.5 h-1.5 rounded-full ${styles.dot}`} />

        {/* Pin button (only shown when expanded) */}
        {showContent && (
          <Button
            size="sm"
            variant="ghost"
            className="h-3 w-3 p-0"
            onClick={handleTogglePin}
            title={isPinned ? 'Unpin (auto-collapse on hover out)' : 'Pin (keep expanded)'}
          >
            {isPinned ? (
              <Pin className="h-2.5 w-2.5 text-primary" />
            ) : (
              <PinOff className="h-2.5 w-2.5 text-muted-foreground" />
            )}
          </Button>
        )}
      </div>

      {/* Toolbar content (slides down when expanded) */}
      <div
        className={`
          transition-all duration-300 ease-in-out
          overflow-hidden
          bg-background
        `}
        style={{
          maxHeight: showContent ? '500px' : '0px',
          opacity: showContent ? 1 : 0,
          paddingTop: showContent ? '14px' : '0px', // Space for the pill
        }}
      >
        {children}
      </div>
    </div>
  );
};

export default CollapsibleToolbar;
