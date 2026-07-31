<!--
  PR template — MarketsUI platform monorepo.
  Fill in Summary + Test plan. Delete sections that don't apply.
-->

## Summary

<!-- 1-3 bullets describing what changed and why. -->

-
-

## Packages touched

<!-- Tick every package affected. Helps reviewers scope their read. -->

- [ ] `@wellsfargo-starui/core`
- [ ] `@wellsfargo-starui/markets-grid`
- [ ] `@wellsfargo-starui/design-system`
- [ ] `@wellsfargo-starui/shared-types`
- [ ] `@wellsfargo-starui/config-service`
- [ ] `@wellsfargo-starui/component-host`
- [ ] `@wellsfargo-starui/widget-sdk`
- [ ] `@wellsfargo-starui/openfin-platform`
- [ ] `@wellsfargo-starui/widgets-react`
- [ ] `@wellsfargo-starui/react-tools` / `@wellsfargo-starui/angular-tools`
- [ ] `@wellsfargo-starui/dock-editor` / `@wellsfargo-starui/angular-dock-editor`
- [ ] `@wellsfargo-starui/registry-editor` / `@wellsfargo-starui/angular-registry-editor`
- [ ] `apps/demos/demo-react` / `apps/demo-angular`
- [ ] Other: ___

## Test plan

- [ ] `npx turbo typecheck` passes
- [ ] `npx turbo build` passes
- [ ] `npx turbo test` passes
- [ ] `npx playwright test` (if E2E-relevant)
- [ ] Manual smoke in `apps/demos/demo-react` (if UI-facing)

## Docs updated

- [ ] `docs/IMPLEMENTED_FEATURES.md` (feature changes)
- [ ] `docs/ARCHITECTURE.md` (structural / boundary changes)
- [ ] `CLAUDE.md` (agent instructions)
- [ ] N/A
