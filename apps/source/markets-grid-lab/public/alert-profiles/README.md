# Alert demo profiles (legacy folder)

**Use** [`../lab-profiles/alerts/`](../lab-profiles/alerts/) for grid
`lab-alerts-v2`. Files here still reference `lab-alerts-v1`.

Import via toolbar **profile selector → Import**. Regenerate current exports:

```bash
npx tsx apps/source/markets-grid-lab/scripts/writeLabProfileJson.ts
```

On first visit to the Alerts tab, profiles install automatically
(`lab-demo-profiles-v2:lab-alerts-v2`).
