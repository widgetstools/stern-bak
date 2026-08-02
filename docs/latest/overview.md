# StarUI — Platform Overview

**StarUI** is the MarketsUI platform: a TypeScript library monorepo for
building trading-desk applications — data-dense grids, real-time market data,
multi-window OpenFin workspaces — on one coherent design system.

## What it gives you

**MarketsGrid** — the flagship surface. An opinionated AG Grid host with
profile persistence (columns, filters, formats survive reloads and roam via a
pluggable storage layer), a full grid customizer, Excel-style formatting
toolbars, conditional formats, smart editing, alerts, and a configuration
browser. One component, production defaults.

**A token-driven design system** — primitives, semantic tokens, themes and
icons. Dark/light switching is one attribute flip (`data-theme` on `<html>`);
adapters theme shadcn/ui, PrimeNG and AG Grid from the same token tree, so
every surface in every framework agrees.

**Shared real-time data services** — a SharedWorker owns a single upstream
STOMP connection and fans snapshots plus thin field-level deltas out to every
grid in every window. Twenty grids across five windows still cost one
connection.

**An OpenFin workspace shell** — dock, home, notifications, child windows and
config import/export, behind the same host/port contracts that also run in a
plain browser tab. Widgets don't change between environments.

**React building blocks** — shadcn/Radix primitives pre-wired to the design
system, a widget SDK, host wrappers and data bindings.

All of it rests on a framework-agnostic **core runtime** (grid engine, host
ports, Dexie-backed config store, widget framework) and a dependency-free
**types** package that defines the contracts.

## Shape of the platform

Seven npm packages in strict layers — imports only flow downward:

![StarUI at a glance](./diagrams/overview-stack.svg)

External consumers install the packages by their real names from a registry —
no aliases, no build glue. The repo's bundled demo apps consume the same
packages two ways (live source and packed tarballs) precisely so that
external consumption never silently breaks.

## Where to go next

| You want to… | Read |
|---|---|
| build an app on StarUI | [getting-started.md](./getting-started.md) |
| understand the architecture | [architecture.md](./architecture.md) |
| look up a package's exports | [packages.md](./packages.md) |
| see every shipped feature | [current-features.md](../current-features.md) |
