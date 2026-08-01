import { createContext, useContext, type ReactNode } from 'react';

/**
 * Target element for Radix/shadcn `*Portal` components.
 *
 * When UI is rendered inside a detached window (e.g. `PopoutPortal` in
 * `@wellsfargo-starui/grid-react`), React still runs in the parent window, so
 * `document.body` is the **parent** document. Radix portals default to
 * that body — menus and popovers appear behind/in the wrong window.
 *
 * Wrap the popped-out subtree with `<PortalContainerProvider
 * container={thatWindow.document.body}>` so every `@wellsfargo-starui/ui` portal
 * receives `container={...}` and mounts into the correct document.
 */
const PortalContainerContext = createContext<HTMLElement | null>(null);

export interface PortalContainerProviderProps {
  /** Portal mount target, or `null` to use Radix defaults (`document.body`). */
  container: HTMLElement | null;
  children: ReactNode;
}

export function PortalContainerProvider({ container, children }: PortalContainerProviderProps) {
  return (
    <PortalContainerContext.Provider value={container}>
      {children}
    </PortalContainerContext.Provider>
  );
}

export function usePortalContainer(): HTMLElement | null {
  return useContext(PortalContainerContext);
}

/**
 * Mount target for Radix/shadcn `*Portal` components.
 *
 * `@radix-ui/react-portal` computes `container = containerProp || (mounted && document.body)`.
 * Passing **`undefined`** leaves the first render with **no** container (`mounted` is still false),
 * so portal content does not appear until a later commit — popovers/menus fail on the parent shell.
 * When there is no {@link PortalContainerProvider} (normal app), return **`document.body`**
 * immediately so the overlay renders in the **same document as the trigger**. When popped out,
 * context supplies the child window `body`.
 */
export function useResolvedPortalContainer(): HTMLElement | undefined {
  const explicit = usePortalContainer();
  if (explicit) return explicit;
  if (typeof document !== 'undefined') return document.body;
  return undefined;
}
