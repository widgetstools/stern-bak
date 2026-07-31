import { ExpressionEngine } from '../expression';
import { CssInjector } from './CssInjector';
import { DirtyBus } from './DirtyBus';
import type {
  AppDataLookup,
  CssHandle,
  DirtyBus as IDirtyBus,
  ExpressionEngineLike,
  ResourceScope as IResourceScope,
} from './types';

/**
 * Per-platform resource registry. Replaces the file-level
 * `Map<gridId, …>` pattern that v2 used — every per-grid piece of state
 * now hangs off a single object whose `dispose()` is called exactly once.
 *
 * Not file-global. Not module-global. Not a singleton. One per GridPlatform.
 */
export class ResourceScope implements IResourceScope {
  private cssByModule = new Map<string, CssInjector>();
  private engine: ExpressionEngine | null = null;
  private caches = new Map<string, WeakMap<object, unknown>>();
  private dirtyBus: DirtyBus | null = null;
  private disposed = false;
  private appDataLookup: AppDataLookup | undefined;

  constructor(private readonly gridId: string, opts?: { appData?: AppDataLookup }) {
    this.appDataLookup = opts?.appData;
  }

  css(moduleId: string): CssHandle {
    this.assertLive();
    let injector = this.cssByModule.get(moduleId);
    if (!injector) {
      injector = new CssInjector(this.gridId, moduleId);
      this.cssByModule.set(moduleId, injector);
    }
    return injector;
  }

  expression(): ExpressionEngineLike {
    this.assertLive();
    if (!this.engine) this.engine = new ExpressionEngine();
    return this.engine;
  }

  cache<K extends object, V>(name: string): WeakMap<K, V> {
    this.assertLive();
    let map = this.caches.get(name);
    if (!map) {
      map = new WeakMap();
      this.caches.set(name, map);
    }
    return map as WeakMap<K, V>;
  }

  dirty(): IDirtyBus {
    this.assertLive();
    if (!this.dirtyBus) this.dirtyBus = new DirtyBus();
    return this.dirtyBus;
  }

  appData(): AppDataLookup | undefined {
    this.assertLive();
    return this.appDataLookup;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const injector of this.cssByModule.values()) injector.destroy();
    this.cssByModule.clear();
    this.caches.clear();
    this.dirtyBus?.reset();
    this.dirtyBus = null;
    this.engine = null;
  }

  private assertLive(): void {
    if (this.disposed) {
      throw new Error('[platform] ResourceScope used after dispose()');
    }
  }
}
