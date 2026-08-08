# Lab demo profiles (importable JSON)

Each feature tab under `apps/demos/markets-grid-lab` ships a **profile selector**
in the toolbar. On first visit, the active catalog profile is installed
automatically (`lab-demo-profiles-v2:<gridId>` in `localStorage`).

These files are the same snapshots, for **Import** in the profile picker
or for sharing outside the app.

| Folder | Grid ID | Profiles |
| --- | --- | --- |
| `overview/` | `lab-overview-v7` | 6 |
| `conditional-styling/` | `lab-conditional-v7` | 6 |
| `calculated-columns/` | `lab-calculated-v5` | 5 |
| `formatting/` | `lab-formatting-v7` | 6 |
| `column-groups/` | `lab-column-groups-v5` | 5 |
| `live-updates/` | `lab-live-v6` | 4 |
| `alerts/` | `lab-alerts-v2` | 9 |
| `renderers/` | `lab-renderers-v2` | 6 |
| `formatter-toolbar/` | `lab-formatter-toolbar-v2` | 6 |

Regenerate after editing catalogs:

```bash
npx tsx apps/demos/markets-grid-lab/scripts/writeLabProfileJson.ts
```

To force a fresh install in the browser:

```js
localStorage.removeItem('lab-demo-profiles-v2:<gridId>');
localStorage.removeItem('markets-grid-bundle:<gridId>');
```

Legacy alert JSON under `public/alert-profiles/` targets `lab-alerts-v1` —
prefer `lab-profiles/alerts/` for `lab-alerts-v2`.
