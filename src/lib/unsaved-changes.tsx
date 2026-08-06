"use client";

import { createContext, useContext, useEffect, useState } from "react";

const UnsavedChangesContext = createContext<{
  dirty: boolean;
  setDirty: (dirty: boolean) => void;
} | null>(null);

export function UnsavedChangesProvider({ children }: { children: React.ReactNode }) {
  const [dirty, setDirty] = useState(false);
  return (
    <UnsavedChangesContext.Provider value={{ dirty, setDirty }}>
      {children}
    </UnsavedChangesContext.Provider>
  );
}

export function useUnsavedChanges() {
  const ctx = useContext(UnsavedChangesContext);
  if (!ctx) throw new Error("useUnsavedChanges must be used within UnsavedChangesProvider");
  return ctx;
}

/** Wire a page's dirty flag into the nav guard + a browser close/refresh warning. */
export function useDirtyGuard(isDirty: boolean) {
  const { setDirty } = useUnsavedChanges();

  useEffect(() => {
    setDirty(isDirty);
    return () => setDirty(false);
  }, [isDirty, setDirty]);

  useEffect(() => {
    if (!isDirty) return;
    function handler(e: BeforeUnloadEvent) {
      e.preventDefault();
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);
}
