import { describe, expect, it } from 'vitest';
import { engineAssetsFromWorkerUrl } from './engineClient.js';

describe('engineAssetsFromWorkerUrl', () => {
  it('resolves the wasm binaries as siblings of an absolute worker URL', () => {
    const assets = engineAssetsFromWorkerUrl('https://host.example/assets/data-provider-worker.js');
    expect(assets.clientWasmUrl).toBe('https://host.example/assets/perspective-js.wasm');
    expect(assets.serverWasmUrl).toBe('https://host.example/assets/perspective-server.wasm');
  });

  it('resolves a root-relative worker URL (Vite dev `?url` shape) against the document', () => {
    // jsdom provides a window location; `/@fs/...` is what a Vite dev server
    // hands out and is NOT a valid URL base on its own — the regression this
    // guards was a render-time "Invalid base URL" TypeError.
    const assets = engineAssetsFromWorkerUrl('/@fs/C:/repo/dist/assets/data-provider-worker.js');
    const origin = window.location.origin;
    expect(assets.clientWasmUrl).toBe(`${origin}/@fs/C:/repo/dist/assets/perspective-js.wasm`);
    expect(assets.serverWasmUrl).toBe(`${origin}/@fs/C:/repo/dist/assets/perspective-server.wasm`);
  });
});
