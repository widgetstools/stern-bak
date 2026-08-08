# Column Groups — module-driven nested headers

**Five toolbar profiles** (`lab-column-groups-v5`) vary which groups start
open vs collapsed (pricing/P&L, all collapsed, identifier-only, etc.).
Import [`public/lab-profiles/column-groups/`](../../public/lab-profiles/column-groups/).

Default profile seeds **8 column groups** through the `column-groups`
module. Open `Tools → Column Groups` to inspect, rename, or restructure.

## Seeded groups

| Group | Open by default | Children always visible | Children on expand |
| --- | --- | --- | --- |
| **Identifier** | closed (marryChildren) | CUSIP · Ticker | Description · ISIN |
| **Reference** | closed | Class · Sector · Ccy · Rating | Country · Seniority |
| **Pricing** | **open** | Bid · Mid · Ask · Δ % | Last · Δ Px · B/A bps |
| **Yields & Spreads** | closed | YTM · OAS | YTW · Curr Yld · Z-spr · I-spr |
| **Risk** | closed | Dur · DV01 | Convex · CS01 · KRD curve |
| **Quantities & Cost** | closed | Qty (face) · Mkt Value | Avg Cost · Accrued |
| **P&L** | **open** | Unreal · Daily | MTD · YTD |
| **Status & Book** | closed | Book · Trader · Maturity | Account · Analyst · Updated |

## How `columnGroupShow` works

Each child of a group declares one of:

- `show: 'always'` (default) — visible regardless of group state.
- `show: 'open'` — only visible when the group's chevron is expanded.
- `show: 'closed'` — only visible when the group is collapsed (rarely
  useful; not seeded here).

When the user clicks a group chevron, AG Grid emits
`columnGroupOpened`. The module records `{ [groupId]: isExpanded }` in
`ColumnGroupsState.openGroupIds` so the runtime layout survives a
reload.

## `marryChildren`

The **Identifier** group has `marryChildren: true` — try dragging a
column out of it from the header bar; AG Grid blocks the move. The
other groups allow children to be dragged out freely.

## Edit / restructure

`Tools → Column Groups → New Group` opens the editor. You can:

- Rename the group header.
- Reorder columns within the group.
- Nest one group inside another (arbitrary depth).
- Toggle `marryChildren`.
- Set `openByDefault`.
- Set `headerStyle` — bold, italic, font size, color, background, and
  per-side borders (`top`/`right`/`bottom`/`left`).

The current seed uses **`headerStyle: { bold: true }`** on every group
to keep the group label visually distinct from individual column
headers, without imposing dark/light-incompatible colors.

## Where the seed lives

[src/seeds/columnGroups.ts](src/seeds/columnGroups.ts) — `ColumnGroupNode`
shape mirrors what the editor produces.
