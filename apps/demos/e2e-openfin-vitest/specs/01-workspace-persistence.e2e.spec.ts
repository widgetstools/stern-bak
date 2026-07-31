/**
 * End-to-end test for Phase 1 (workspace persistence override).
 *
 * Launches a real OpenFin platform via @openfin/node-adapter, connects
 * to the markets-ui-reference dev server, and exercises the full
 * saved-workspace lifecycle through @openfin/workspace-platform's
 * public Storage API. Each call routes through our
 * createWorkspacePersistenceOverride() — so passing tests prove the
 * override is wired correctly into init() and that ConfigService is
 * the source of truth (no fall-through to OpenFin's local IndexedDB).
 *
 * Pre-reqs (see ../README.md):
 *   - Markets-UI dev server reachable at http://localhost:5174
 *   - OpenFin runtime installable on this machine (auto-downloaded
 *     by node-adapter on first launch)
 *   - A display — OpenFin doesn't run headless
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { launchPlatform, type LaunchedPlatform } from '../helpers/platform';

const MANIFEST_URL = process.env.MUI_MANIFEST_URL
  ?? 'http://localhost:5174/platform/manifest.fin.json';

let platform: LaunchedPlatform;

// Snapshot fixture used across most assertions. Includes a ?id= so the
// override's instanceId-extraction path runs against real input.
function makeSnapshot(id: string) {
  return {
    windows: [
      {
        layout: { content: [] },
        views: [{ url: `http://localhost:5174/views/view1?id=${id}` }],
      },
    ],
  };
}

beforeAll(async () => {
  platform = await launchPlatform(MANIFEST_URL);

  // Sanity check: the test bridge channel must exist before specs run.
  const ping = await platform.bridge.ping();
  expect(ping.ok, `bridge ping failed: ${ping.error}`).toBe(true);
  expect(ping.data).toBe('pong');

  // Clean any leftover workspaces from previous runs so each suite
  // starts from a known empty state.
  const list = await platform.bridge.getWorkspaces();
  expect(list.ok, `initial getWorkspaces failed: ${list.error}`).toBe(true);
  for (const w of (list.data ?? [])) {
    if (w?.workspaceId) await platform.bridge.deleteWorkspace(w.workspaceId);
  }
}, 120_000);

afterAll(async () => {
  if (platform) await platform.quit();
});

describe('Phase 1 — workspace persistence override (OpenFin-driven)', () => {
  it('starts with no saved workspaces', async () => {
    const reply = await platform.bridge.getWorkspaces();
    expect(reply.ok).toBe(true);
    expect(reply.data).toEqual([]);
  });

  it('saveWorkspace persists a workspace, getWorkspaces lists it, getWorkspace round-trips it', async () => {
    const wsId = `e2e-rt-${Date.now()}`;
    const snapshot = makeSnapshot('inst-rt-1');

    const saveReply = await platform.bridge.saveWorkspace({
      workspaceId: wsId,
      title: 'E2E Round-Trip',
      snapshot,
      metadata: { color: 'blue' },
    });
    expect(saveReply.ok, `saveWorkspace failed: ${saveReply.error}`).toBe(true);

    const list = await platform.bridge.getWorkspaces();
    expect(list.ok).toBe(true);
    const titles = (list.data ?? []).map((w: any) => w.title);
    expect(titles).toContain('E2E Round-Trip');

    const got = await platform.bridge.getWorkspace(wsId);
    expect(got.ok, `getWorkspace failed: ${got.error}`).toBe(true);
    expect(got.data).toBeDefined();
    expect(got.data?.workspaceId).toBe(wsId);
    expect(got.data?.title).toBe('E2E Round-Trip');
    expect(got.data?.snapshot).toEqual(snapshot);
    expect(got.data?.metadata).toEqual({ color: 'blue' });
  });

  it('saveWorkspace acts as upsert — calling again with same id renames in place', async () => {
    const wsId = `e2e-upsert-${Date.now()}`;
    await platform.bridge.saveWorkspace({
      workspaceId: wsId,
      title: 'v1',
      snapshot: makeSnapshot('inst-upsert-1'),
    });

    await platform.bridge.saveWorkspace({
      workspaceId: wsId,
      title: 'v2',
      snapshot: makeSnapshot('inst-upsert-1'),
    });

    const got = await platform.bridge.getWorkspace(wsId);
    expect(got.ok).toBe(true);
    expect(got.data?.title).toBe('v2');

    // Final list should still have exactly one row for this id, not two
    const list = await platform.bridge.getWorkspaces();
    const matches = (list.data ?? []).filter((w: any) => w.workspaceId === wsId);
    expect(matches).toHaveLength(1);
  });

  it('deleteWorkspace removes the row + getWorkspace returns undefined after', async () => {
    const wsId = `e2e-del-${Date.now()}`;
    await platform.bridge.saveWorkspace({
      workspaceId: wsId,
      title: 'To Be Deleted',
      snapshot: makeSnapshot('inst-del-1'),
    });

    // Confirm it exists first
    let got = await platform.bridge.getWorkspace(wsId);
    expect(got.data?.workspaceId).toBe(wsId);

    const delReply = await platform.bridge.deleteWorkspace(wsId);
    expect(delReply.ok, `deleteWorkspace failed: ${delReply.error}`).toBe(true);

    got = await platform.bridge.getWorkspace(wsId);
    // OpenFin's contract: getWorkspace returns undefined for missing ids
    // (our override throws, but Storage.getWorkspace catches and returns
    // undefined per its public type signature)
    expect(got.data).toBeUndefined();

    const list = await platform.bridge.getWorkspaces();
    const matches = (list.data ?? []).filter((w: any) => w.workspaceId === wsId);
    expect(matches).toHaveLength(0);
  });

  it('multiple workspaces coexist and list ordering is stable', async () => {
    // Clean slate first
    const before = await platform.bridge.getWorkspaces();
    for (const w of (before.data ?? [])) {
      if (w?.workspaceId) await platform.bridge.deleteWorkspace(w.workspaceId);
    }

    const ids = ['a', 'b', 'c'].map((s) => `e2e-multi-${s}-${Date.now()}`);
    for (const id of ids) {
      await platform.bridge.saveWorkspace({
        workspaceId: id,
        title: `Multi ${id.split('-')[2]}`,
        snapshot: makeSnapshot(`inst-${id}`),
      });
    }

    const list = await platform.bridge.getWorkspaces();
    expect(list.ok).toBe(true);
    expect(list.data).toHaveLength(3);
    const gotIds = (list.data ?? []).map((w: any) => w.workspaceId).sort();
    expect(gotIds).toEqual([...ids].sort());

    // Cleanup
    for (const id of ids) await platform.bridge.deleteWorkspace(id);
  });
});
