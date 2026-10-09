"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

// A per-browser convenience value (filter choices and the like), kept in
// localStorage. The server render and the first client render both see the
// fallback; the stored value arrives right after, without a hydration mismatch.
// An in-memory copy keeps the value working when storage is blocked.

const memory = new Map<string, string>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function readRaw(key: string): string | null {
  if (memory.has(key)) return memory.get(key)!;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * `parse` turns whatever was stored (possibly from an older version of the
 * page) into a valid value, falling back field by field.
 */
export function useStoredValue<T>(
  key: string,
  fallback: T,
  parse: (stored: unknown) => T,
): [T, (value: T) => void] {
  const raw = useSyncExternalStore(
    subscribe,
    () => readRaw(key),
    () => null,
  );

  const value = useMemo(() => {
    if (raw === null) return fallback;
    try {
      return parse(JSON.parse(raw));
    } catch {
      return fallback;
    }
  }, [raw, fallback, parse]);

  const setValue = useCallback(
    (next: T) => {
      const json = JSON.stringify(next);
      memory.set(key, json);
      try {
        window.localStorage.setItem(key, json);
      } catch {
        // Private mode or blocked storage: the in-memory copy still works.
      }
      listeners.forEach((listener) => listener());
    },
    [key],
  );

  return [value, setValue];
}
