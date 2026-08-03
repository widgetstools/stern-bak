/**
 * The shape both Perspective tee transports share.
 *
 * `stompPerspective` and `mockPerspective` are the same construction over two
 * different generators — forward the emit stream untouched, and feed a Table
 * off the side of it — so they take the same options and hand back the same
 * handle. Keeping that contract in one place is what makes a caller able to
 * treat them interchangeably (the registry does).
 */
import type { ProviderHandle } from '../Provider.js';
import type { PerspectiveHost } from '../../perspective/perspectiveHost.js';
import type {
  FeedDiagnostic,
  PerspectiveTableFeed,
} from '../../perspective/perspectiveTableFeed.js';

export interface PerspectiveTeeOpts {
  /**
   * The worker's Perspective host. Injected rather than imported so a worker
   * that never opens a blotter does not pull in the engine's wasm, and so
   * these transports are testable without one. Absent, the provider still
   * runs — it just serves the push path only.
   */
  perspectiveHost?: PerspectiveHost;
  /** Table name; defaults to `cfg.tableName`, then `'positions'`. */
  tableName?: string;
  onDiagnostic?(diagnostic: FeedDiagnostic): void;
}

export interface PerspectiveTeeHandle extends ProviderHandle {
  /** The feed, for diagnostics and for awaiting the Table. Null when no Table was built. */
  readonly feed: PerspectiveTableFeed | null;
  /** Name the Table is hosted under — what a window passes to `open_table`. */
  readonly tableName: string;
}
