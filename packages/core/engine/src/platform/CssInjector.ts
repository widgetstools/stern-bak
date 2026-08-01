import type { CssHandle } from './types';

/**
 * Per-module <style> tag with keyed rule upserts.
 *
 * Instances are owned by `ResourceScope` — one per (gridId, moduleId). The
 * ResourceScope's `dispose()` tears them all down in a single pass.
 *
 * Writes are microtask-coalesced: the reinjection paths (e.g.
 * conditional-styling's `reinjectAllRules`) upsert one rule per rule
 * per transform pass, and the old shape rebuilt + rewrote the whole
 * style element's textContent on EVERY upsert — N style recalcs per
 * pass. Now a burst of add/remove/clear calls lands as ONE textContent
 * write on the next microtask (still before the next paint, so there is
 * no visible unstyled window). Unchanged rule text short-circuits
 * entirely, so a steady-state re-transform performs zero DOM writes.
 *
 * SSR-safe: every method is a no-op when `document` is undefined.
 */
export class CssInjector implements CssHandle {
  private styleEl: HTMLStyleElement | null = null;
  private rules = new Map<string, string>();
  private flushQueued = false;
  private destroyed = false;

  constructor(
    private readonly gridId: string,
    private readonly moduleId: string,
  ) {}

  addRule(ruleId: string, cssText: string): void {
    if (this.rules.get(ruleId) === cssText) return;
    this.rules.set(ruleId, cssText);
    this.scheduleFlush();
  }

  removeRule(ruleId: string): void {
    if (this.rules.delete(ruleId)) this.scheduleFlush();
  }

  clear(): void {
    if (this.rules.size === 0) return;
    this.rules.clear();
    this.scheduleFlush();
  }

  destroy(): void {
    this.destroyed = true;
    this.rules.clear();
    if (this.styleEl?.parentNode) this.styleEl.parentNode.removeChild(this.styleEl);
    this.styleEl = null;
  }

  private ensure(): HTMLStyleElement | null {
    if (typeof document === 'undefined') return null;
    if (this.styleEl) return this.styleEl;
    const el = document.createElement('style');
    el.setAttribute('data-ds-grid', this.gridId);
    el.setAttribute('data-ds-module', this.moduleId);
    document.head.appendChild(el);
    this.styleEl = el;
    return el;
  }

  private scheduleFlush(): void {
    if (this.flushQueued) return;
    if (typeof queueMicrotask !== 'function') {
      this.flush();
      return;
    }
    this.flushQueued = true;
    queueMicrotask(() => {
      this.flushQueued = false;
      if (this.destroyed) return;
      this.flush();
    });
  }

  private flush(): void {
    const el = this.ensure();
    if (!el) return;
    el.textContent = Array.from(this.rules.values()).join('\n');
  }
}
