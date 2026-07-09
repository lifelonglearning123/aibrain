"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { supabaseConfig } from "@/lib/supabase/config";

export default function LoginPage() {
  const { configured } = supabaseConfig();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      // Preferred: deliver the sign-in link via GoHighLevel.
      const res = await fetch("/api/auth/send-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok) {
        setSent(true);
        return;
      }
      // Fall back to Supabase's own magic-link email if GHL sending isn't available.
      if (data.fallback) {
        const supabase = createClient();
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        });
        if (error) setError(error.message);
        else setSent(true);
        return;
      }
      setError(data.error ?? "Could not send your sign-in link.");
    } catch {
      setError("Could not reach the server. Check your configuration.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-lg font-bold text-white">
            AI
          </div>
          <h1 className="text-xl font-semibold text-slate-900">AI Brain</h1>
          <p className="mt-1 text-sm text-slate-500">
            Sales &amp; marketing across your brands
          </p>
        </div>

        {!configured ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
            <p className="font-medium">Supabase isn&apos;t connected yet.</p>
            <p className="mt-1">
              Add your Supabase URL and anon key to <code>.env.local</code>, then
              restart. See <code>SETUP.md</code> for the steps.
            </p>
          </div>
        ) : sent ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-800">
            <p className="font-medium">Check your email.</p>
            <p className="mt-1">
              We sent a magic sign-in link to <strong>{email}</strong>.
            </p>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <label
              htmlFor="email"
              className="block text-sm font-medium text-slate-700"
            >
              Work email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@macaws.ai"
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
            />
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="mt-4 w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60"
            >
              {loading ? "Sending…" : "Send magic link"}
            </button>
            <p className="mt-3 text-center text-xs text-slate-400">
              You&apos;ll get a one-time sign-in link. No password needed.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
