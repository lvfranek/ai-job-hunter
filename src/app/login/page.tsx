"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Lightning } from "@phosphor-icons/react/dist/ssr";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Incorrect password");
      }
      router.push(searchParams.get("next") || "/");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-5 rounded-[28px] border border-white/60 bg-[#F1FAFF] p-8 shadow-[0_8px_30px_-10px_rgba(30,64,120,0.28)]"
      >
        <div className="flex flex-col items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-linear-to-b from-white to-[#F3F9FD] text-[#1E2A3D] shadow-[0_2px_8px_rgba(30,64,120,0.15)]">
            <Lightning size={18} weight="fill" />
          </span>
          <h1 className="text-[15px] font-semibold text-text">AI Job Hunter</h1>
        </div>

        {error && (
          <div className="rounded-lg border border-rose-300 bg-rose-100 px-3.5 py-2.5 text-[13px] text-rose-800">
            {error}
          </div>
        )}

        <div>
          <label className="mb-1.5 block text-[13px] font-medium text-text-muted">
            Password
          </label>
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-[13px] text-text outline-none focus:border-[#101828]"
          />
        </div>

        <button
          type="submit"
          disabled={submitting || !password}
          className="w-full rounded-xl bg-[#101828] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#1E293B] active:scale-[0.98] disabled:opacity-50"
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
