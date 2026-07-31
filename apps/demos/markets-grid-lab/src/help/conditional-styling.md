# Conditional Styling — profile curricula

Six **toolbar profiles** isolate flash, diff (`[col.old]` / `[col.new]`),
row scope, indicators, and disabled-rule baselines. Grid ID:
`lab-conditional-v7`. Import from
[`public/lab-profiles/conditional-styling/`](../../public/lab-profiles/conditional-styling/).

| Profile | Focus |
| --- | --- |
| **00 · Full curriculum** | 13 rules — every CS feature (start here) |
| **01 · Flash lab** | One-shot + pulse flashes on price/yield |
| **02 · Diff old/new** | Mid/yield direction with `activeDurationMs` |
| **03 · Row + indicators** | Row tint, bell/triangle/trend icons |
| **04 · Cell paint** | Static winner/loser backgrounds only |
| **05 · All disabled** | Rules present but toggled off |

Open `Tools → Style Rules` after switching profiles. The **00** profile
includes the full rule table from the legacy single-seed doc:

## Foundational rules (1 – 9)

Cell colour, one-shot flash, **pulse** flash, row scope, indicators on
text vs numeric alignment, header-only indicators, `activeDurationMs`.

## Diff-aware rules (10 – 13)

`[midPrice.new] > [midPrice.old]` (and siblings) with brief active windows
after each mock-stream tick.

## Persistence

Edits save via `handle.saveAll()` on the active profile. Reset install:

```js
localStorage.removeItem('lab-demo-profiles-v2:lab-conditional-v7');
```

Seed: [`src/seeds/conditionalStyling.ts`](../../src/seeds/conditionalStyling.ts) ·
catalog [`conditionalCatalog.ts`](../../src/profiles/catalogs/conditionalCatalog.ts).
