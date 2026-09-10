/** Injectable WASM hub — tests supply a fake; the worker loads vendored dshub. */
export interface RustHubLike {
  boot_datasource(config_json: string): string;
  connect(session_id: string): void;
  disconnect(session_id: string): string;
  on_control(session_id: string, msg_json: string): string;
  tick(): string;
  apply_message_json(ds_id: string, params_json: string, raw_json: string): string;
  poll_shared_delta(ds_id: string, params_json: string): string;
  mem_stats(): string;
}

export type RustHubFactory = () => RustHubLike | Promise<RustHubLike>;

type DshubModule = typeof import('@starui/dshub');

let wasmReady: Promise<RustHubLike> | null = null;
let importDshub: () => Promise<DshubModule> = defaultImportDshub;

function defaultImportDshub(): Promise<DshubModule> {
  // Literal specifier so esbuild inlines vendor/dshub into the worker.
  // Vitest aliases `@starui/dshub` to `dshub.vitest-stub.ts`.
  return import('@starui/dshub') as Promise<DshubModule>;
}

export function resetRustHubLoader(next?: () => Promise<DshubModule>): void {
  wasmReady = null;
  importDshub = next ?? defaultImportDshub;
}

/** Load the vendored WASM module once per worker. */
export async function loadVendoredRustHub(): Promise<RustHubLike> {
  if (wasmReady) return wasmReady;
  wasmReady = (async () => {
    const mod = await importDshub();
    const wasmUrl = new URL('./dshub_bg.wasm', import.meta.url);
    await mod.default({ module_or_path: wasmUrl });
    return mod.RustHub.new();
  })();
  return wasmReady;
}

export class RustHubHost {
  private hub: RustHubLike | null = null;
  private readonly factory: RustHubFactory;

  constructor(factory: RustHubFactory = loadVendoredRustHub) {
    this.factory = factory;
  }

  async ensure(): Promise<RustHubLike> {
    if (this.hub) return this.hub;
    this.hub = await this.factory();
    return this.hub;
  }

  get current(): RustHubLike | null {
    return this.hub;
  }
}
