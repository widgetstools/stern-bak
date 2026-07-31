/**
 * Minimal keyboard chord listener for hub dev tooling.
 */

import { useEffect, useRef } from 'react';

interface ParsedChord {
  shift: boolean;
  ctrl: boolean;
  alt: boolean;
  meta: boolean;
  key: string;
}

function parseChord(chord: string): ParsedChord {
  const parts = chord.split('+').map((p) => p.trim().toLowerCase());
  return {
    shift: parts.includes('shift'),
    ctrl: parts.includes('ctrl') || parts.includes('control'),
    alt: parts.includes('alt') || parts.includes('option'),
    meta: parts.includes('meta') || parts.includes('cmd') || parts.includes('command'),
    key: parts.find((p) => !['shift', 'ctrl', 'control', 'alt', 'option', 'meta', 'cmd', 'command'].includes(p)) ?? '',
  };
}

function keyPartMatches(ev: KeyboardEvent, expectedKey: string): boolean {
  if (!expectedKey) return false;
  if (ev.key.toLowerCase() === expectedKey) return true;
  if (/^[a-z]$/.test(expectedKey) && ev.code === `Key${expectedKey.toUpperCase()}`) {
    return true;
  }
  return false;
}

function matchesChord(ev: KeyboardEvent, parsed: ParsedChord): boolean {
  if (ev.shiftKey !== parsed.shift) return false;
  if (ev.ctrlKey !== parsed.ctrl) return false;
  if (ev.altKey !== parsed.alt) return false;
  if (ev.metaKey !== parsed.meta) return false;
  return keyPartMatches(ev, parsed.key);
}

export function useChordHotkey(
  chord: string | readonly string[],
  handler: (e: KeyboardEvent) => void,
  opts: { target?: HTMLElement | Document | null; enabled?: boolean } = {},
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (opts.enabled === false) return;
    const target = opts.target ?? (typeof document !== 'undefined' ? document : null);
    if (!target) return;
    const parsedList = (Array.isArray(chord) ? chord : [chord]).map(parseChord);

    const listener = (e: Event) => {
      const ev = e as KeyboardEvent;
      for (const parsed of parsedList) {
        if (!matchesChord(ev, parsed)) continue;
        ev.preventDefault();
        handlerRef.current(ev);
        return;
      }
    };
    target.addEventListener('keydown', listener, true);
    return () => target.removeEventListener('keydown', listener, true);
  }, [chord, opts.target, opts.enabled]);
}
