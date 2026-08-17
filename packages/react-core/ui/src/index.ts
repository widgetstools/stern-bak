// @wellsfargo-starui/react — shadcn/Radix primitives; theme tokens from @wellsfargo-starui/design-system/css

// ============================================================================
// Utilities
// ============================================================================
export { cn } from './lib/utils.js';

// ============================================================================
// Theme
// ============================================================================
export { ThemeProvider, useTheme } from './providers/ThemeProvider.js';
export type { Theme, ThemeProviderProps } from './providers/ThemeProvider.js';

// ============================================================================
// Portal target (detached windows / OpenFin popouts)
// ============================================================================
export {
  PortalContainerProvider,
  usePortalContainer,
  useResolvedPortalContainer,
  type PortalContainerProviderProps,
} from './portal-container.js';

// ============================================================================
// Components
// ============================================================================

// Layout & Containers
export * from './components/accordion.js';
export * from './components/aspect-ratio.js';
export * from './components/card.js';
export * from './components/collapsible.js';
export * from './components/resizable.js';
export * from './components/scroll-area.js';
export * from './components/separator.js';
export * from './components/sheet.js';
export * from './components/tabs.js';

// Navigation
export * from './components/breadcrumb.js';
export * from './components/dropdown-menu.js';
export * from './components/menubar.js';
export * from './components/navigation-menu.js';
export * from './components/pagination.js';
export * from './components/context-menu.js';
export * from './components/command.js';

// Forms & Inputs
export * from './components/button.js';
export * from './components/button-group.js';
export * from './components/checkbox.js';
export * from './components/form.js';
export * from './components/input.js';
export * from './components/input-otp.js';
export * from './components/label.js';
export * from './components/radio-group.js';
export * from './components/select.js';
export * from './components/slider.js';
export * from './components/switch.js';
export * from './components/textarea.js';
export * from './components/toggle.js';
export * from './components/toggle-group.js';

// Data Display
export * from './components/avatar.js';
export * from './components/badge.js';
export * from './components/calendar.js';
export * from './components/carousel.js';
// chart.js is intentionally NOT re-exported here — it pulls in recharts
// (a multi-MB peer) which every consumer of @wellsfargo-starui/react would otherwise
// inherit. Import directly from `@wellsfargo-starui/react/chart` when needed.
export * from './components/progress.js';
export * from './components/skeleton.js';
export * from './components/table.js';

// Feedback & Overlays
export * from './components/alert.js';
export * from './components/alert-dialog.js';
export * from './components/dialog.js';
export * from './components/drawer.js';
export * from './components/hover-card.js';
export * from './components/popover.js';
// Sonner and shadcn's own toast both live here. Prefixed rather than plain
// `toast` because `./components/use-toast.js` below already owns that name —
// the duplication predates this export and is not resolved by it.
export { Toaster as SonnerToaster, toast as sonnerToast } from './components/sonner.js';
export * from './components/toast.js';
export * from './components/toaster.js';
export * from './components/tooltip.js';
export * from './components/use-toast.js';

// Custom — Trading Platform
export * from './components/CollapsibleToolbar.js';
export * from './components/ToolbarContainer.js';
export * from './components/VirtualizedList.js';
