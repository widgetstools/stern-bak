import { describe, expect, it } from 'vitest';
import {
  FLATTEN_MAX_DEPTH,
  FLATTEN_SEPARATOR,
  flattenRow,
  flattenRows,
  loadVendoredRustHub,
  publishWindowMsOf,
  resetRustHubLoader,
  RustHubHost,
  SsrmWasmPlane,
  toViewSpec,
} from './index.js';

describe('ssrm runtime barrel', () => {
  it('re-exports the WASM plane helpers', () => {
    expect(flattenRow).toEqual(expect.any(Function));
    expect(flattenRows).toEqual(expect.any(Function));
    expect(toViewSpec).toEqual(expect.any(Function));
    expect(RustHubHost).toEqual(expect.any(Function));
    expect(SsrmWasmPlane).toEqual(expect.any(Function));
    expect(loadVendoredRustHub).toEqual(expect.any(Function));
    expect(resetRustHubLoader).toEqual(expect.any(Function));
    expect(publishWindowMsOf).toEqual(expect.any(Function));
    expect(FLATTEN_SEPARATOR).toBe('_');
    expect(FLATTEN_MAX_DEPTH).toBe(6);
  });
});
