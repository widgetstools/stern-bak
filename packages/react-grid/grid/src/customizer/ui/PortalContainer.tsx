/**
 * Re-export the shared portal target context from `@wellsfargo-starui/ui` so
 * `PopoutPortal`, grid-local shadcn wrappers, and `@wellsfargo-starui/ui` primitives
 * all read the **same** React context — Radix portals land in the popped-
 * out window's `document.body`, not the parent shell.
 */
export {
  PortalContainerProvider,
  usePortalContainer,
  useResolvedPortalContainer,
  type PortalContainerProviderProps,
} from '@wellsfargo-starui/ui';
