/**
 * Persistence helpers shared across OpenFin child windows.
 * `sessionStorage` is per-window; `localStorage` is same-origin global.
 */

export function readCrossWindowItem(key: string): string | null {
  if (typeof localStorage !== 'undefined') {
    try {
      const value = localStorage.getItem(key);
      if (value !== null) return value;
    } catch {
      /* private mode / quota */
    }
  }
  if (typeof sessionStorage !== 'undefined') {
    try {
      return sessionStorage.getItem(key);
    } catch {
      /* ignore */
    }
  }
  return null;
}

export function writeCrossWindowItem(key: string, value: string): void {
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* best-effort */
    }
  }
  if (typeof sessionStorage !== 'undefined') {
    try {
      sessionStorage.setItem(key, value);
    } catch {
      /* best-effort */
    }
  }
}

export function clearCrossWindowPrefix(prefix: string): void {
  for (const store of [localStorage, sessionStorage]) {
    if (typeof store === 'undefined') continue;
    try {
      for (let i = store.length - 1; i >= 0; i -= 1) {
        const key = store.key(i);
        if (key?.startsWith(prefix)) {
          store.removeItem(key);
        }
      }
    } catch {
      /* ignore */
    }
  }
}
