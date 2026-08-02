# StarUI Documentation

The current documentation set for the StarUI (MarketsUI) platform.

| Document | What it covers | Audience |
|---|---|---|
| [overview.md](./overview.md) | what StarUI is, capabilities at a glance | everyone — start here |
| [getting-started.md](./getting-started.md) | installing, first grid, theming, demo apps, platform dev loop | app builders + contributors |
| [architecture.md](./architecture.md) | layer model, dependency graph, runtime host/port model, data services, build & consumption tracks — with diagrams | engineers + reviewers |
| [packages.md](./packages.md) | per-package reference: role, export subpaths, peers | anyone importing a package |

## Related references (outside this set)

| Document | Purpose |
|---|---|
| [current-features.md](../current-features.md) | granular inventory of every shipped feature, kept in lockstep with code |
| [APPS_REPO.md](../APPS_REPO.md) | the `apps/` tree: two consumption tracks, platform linking, workflows |
| [WORKLOG.md](../WORKLOG.md) | known-open items — check before starting work |
| [COVERAGE_PLAN.md](../COVERAGE_PLAN.md) | the 70%-per-file coverage effort and its binding conventions |

**Print editions** — each document in this set also ships as a PDF under
[`pdf/`](./pdf/), regenerated from the markdown by `pdf/build.mjs`.

One-off deep dives (hub fan-out optimizations, Sonar LCOV notes, the
expression DSL) remain in [`docs/`](../); superseded documentation is
frozen in [`docs/archive/`](../archive/README.md).
