/** Bundled worker alias — see `scripts/buildWorker.mjs`. */
declare module '@starui/dshub' {
  export class RustHub {
    static new(): RustHub;
    free(): void;
    boot_datasource(config_json: string): string;
    connect(session_id: string): void;
    disconnect(session_id: string): string;
    on_control(session_id: string, msg_json: string): string;
    tick(): string;
    apply_message_json(ds_id: string, params_json: string, raw_json: string): string;
    snapshot_columns(ds_id: string, params_json: string): string;
    poll_shared_delta(ds_id: string, params_json: string): string;
    rewind_shared_delta(ds_id: string, params_json: string, from_rev: bigint): void;
    session_count(): number;
    mem_stats(): string;
  }
  export default function init(opts?: { module_or_path?: URL | string }): Promise<unknown>;
}
