# @wellsfargo-starui/app

Declarative app root for StarGrid consumer apps. Replaces the legacy
`AppShell` + nested provider stack with a single `GridHostContext` model.

## Usage

```tsx
import { applyTheme, getTheme } from '@wellsfargo-starui/design-system';
import { StarGridApp, useStarGridHost } from '@wellsfargo-starui/app';
import { MarketsGrid } from '@wellsfargo-starui/grid';

applyTheme(getTheme());

function Blotter() {
  const host = useStarGridHost({ gridId: 'my-grid' });
  return <MarketsGrid host={host} gridId="my-grid" rowData={rows} columnDefs={cols} />;
}

createRoot(document.getElementById('root')!).render(
  <StarGridApp appId="my-app" userId="dev1" persistence="localStorage">
    <Blotter />
  </StarGridApp>,
);
```

## Persistence modes

| Mode | Behavior |
|---|---|
| `memory` | In-memory profiles (tests, ephemeral demos) |
| `localStorage` | Default — `createMarketsGridLocalStorageStorage()` |
| `config` | ConfigManager-backed via `createConfigServiceStorage()` — pass `configManager` |

## Exports

- `StarGridApp`, `useStarGridApp`, `useStarGridHost`
- `buildGridHostContext`, `storageFactoryForPersistence`
- `defineStarGridPlugin` — hook point for OpenFin workspace shell (follow-up)
