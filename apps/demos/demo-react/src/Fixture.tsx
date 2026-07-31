import { useEffect, useMemo, useState } from 'react';
import { MarketsGrid, type StorageAdapterFactory } from '@wellsfargo-starui/grid';
import { activeProfileKey } from '@wellsfargo-starui/engine';
import type { ProfileSnapshot } from '@wellsfargo-starui/engine';

import { generateNestedOrders, nestedColumnDefs } from './nestedData';
import type { FixtureSpec } from './nestedFixtures';
import { APP_ID, DEMO_USER_ID } from './App';

/**
 * Seed (upsert) the fixture's profile and flip the active-profile
 * pointer so MarketsGrid boots straight into the styled state. Stable
 * id `${fixture.name}-profile` so re-seeds overwrite cleanly.
 */
async function seedFixture(
  storage: StorageAdapterFactory,
  fixture: FixtureSpec,
): Promise<void> {
  // Seed the fixture state under id `__default__` so MarketsGrid's
  // default-profile auto-seed becomes a no-op (its `if (existing)`
  // guard short-circuits) — and we don't fight an active-pointer race
  // with the host's "ensure default exists" step. The fixture profile
  // IS the default for this gridId.
  const adapter = storage({
    instanceId: fixture.gridId,
    appId: APP_ID,
    userId: DEMO_USER_ID,
  });
  const now = Date.now();
  const snap: ProfileSnapshot = {
    id: '__default__',
    gridId: fixture.gridId,
    name: fixture.profile.profile.name,
    state: fixture.profile.profile.state,
    createdAt: now,
    updatedAt: now,
  };
  await adapter.saveProfile(snap);
  try { localStorage.setItem(activeProfileKey(fixture.gridId), '__default__'); } catch { /* */ }
}

interface FixtureProps {
  fixture: FixtureSpec;
  storage: StorageAdapterFactory;
}

const defaultColDef = {
  floatingFilter: true,
  filter: true,
  sortable: true,
  resizable: true,
};

/**
 * Mounts MarketsGrid with the nested-fields dataset, seeded against the
 * fixture's pre-built profile. The component is intentionally minimal —
 * each spec is responsible for clearing IndexedDB before it runs (via
 * `bootCleanDemo`) so the seed is fresh for every test.
 *
 * Determinism note: row data is regenerated on every mount, but the
 * underlying generator is seeded so rows are byte-for-byte stable
 * across page loads. Edge-case rows (`EDGE-NULL-PRICING`, etc.) are
 * always at the front of the dataset — see `nestedData.ts`.
 */
export function Fixture({ fixture, storage }: FixtureProps) {
  const rowData = useMemo(() => generateNestedOrders(60), []);
  const columnDefs = useMemo(() => nestedColumnDefs(), []);
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    let alive = true;
    seedFixture(storage, fixture).finally(() => {
      if (alive) setSeeded(true);
    });
    return () => { alive = false; };
  }, [storage, fixture]);

  if (!seeded) {
    return (
      <div
        data-testid="fixture-loading"
        style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--muted-foreground)', fontSize: 11,
        }}
      >
        Loading fixture: {fixture.label}…
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div
        data-testid="fixture-banner"
        data-fixture-name={fixture.name}
        data-fixture-grid-id={fixture.gridId}
        style={{
          padding: '4px 12px',
          fontSize: 10,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--muted-foreground)',
          borderBottom: '1px solid var(--border)',
          background: 'var(--card)',
          fontFamily: "'JetBrains Mono', monospace",
        }}
      >
        Fixture · {fixture.label} · gridId={fixture.gridId}
      </div>
      <div style={{ flex: 1 }}>
        <MarketsGrid
          gridId={fixture.gridId}
          rowData={rowData}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          rowIdField="id"
          storage={storage}
          appId={APP_ID}
          userId={DEMO_USER_ID}
          showFiltersToolbar
          showFormattingToolbar
          showEditingToolbar
          sideBar={{ toolPanels: ['columns', 'filters'] }}
        />
      </div>
    </div>
  );
}
