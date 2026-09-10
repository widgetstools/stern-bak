import { describe, expect, it } from 'vitest';
import {
  bindSsrmTicks,
  bindSsrmExpressionAggregates,
  createSsrmDatasource,
  createSsrmGetRowId,
  drainSsrmRows,
  isSsrmGrid,
  lockSsrmExpressionColumns,
  sendSsrmClipboard,
  ssrmGetRowId,
  watchGroupsFromApi,
  withSsrmSelectAll,
  withSsrmStatusBar,
  useSsrmStatusBar,
  statusBarSignature,
  applySsrmStatusBar,
} from './index.js';

describe('ssrm barrel', () => {
  it('re-exports the AG Grid 36.1 helpers', () => {
    expect(createSsrmDatasource).toEqual(expect.any(Function));
    expect(ssrmGetRowId).toEqual(expect.any(Function));
    expect(createSsrmGetRowId).toEqual(expect.any(Function));
    expect(bindSsrmTicks).toEqual(expect.any(Function));
    expect(bindSsrmExpressionAggregates).toEqual(expect.any(Function));
    expect(watchGroupsFromApi).toEqual(expect.any(Function));
    expect(withSsrmStatusBar).toEqual(expect.any(Function));
    expect(useSsrmStatusBar).toEqual(expect.any(Function));
    expect(statusBarSignature).toEqual(expect.any(Function));
    expect(applySsrmStatusBar).toEqual(expect.any(Function));
    expect(drainSsrmRows).toEqual(expect.any(Function));
    expect(isSsrmGrid).toEqual(expect.any(Function));
    expect(lockSsrmExpressionColumns).toEqual(expect.any(Function));
    expect(sendSsrmClipboard).toEqual(expect.any(Function));
    expect(withSsrmSelectAll).toEqual(expect.any(Function));
  });
});
