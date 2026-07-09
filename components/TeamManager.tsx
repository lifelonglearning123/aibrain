"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ENTITIES } from "@/lib/entities";

interface Member {
  email: string;
  role: string;
  brands: string[];
}

export function TeamManager({ members }: { members: Member[] }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [brands, setBrands] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function toggle(k: string) {
    setBrands((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
  }

  async function add() {
    if (!email.trim() || brands.length === 0) {
      setMsg("Enter an email and pick at least one company.");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/team/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, brands }),
      });
      const data = await res.json();
      if (data.ok) {
        setEmail("");
        setBrands([]);
        if (data.invited) setMsg("Saved — invite email sent via GoHighLevel. ✓");
        else if (data.inviteError)
          setMsg(`Saved, but the invite email didn't send (${data.inviteError}). They can still sign in at /login.`);
        else setMsg("Saved. ✓");
        router.refresh();
      } else setMsg(`Error: ${data.error}`);
    } catch {
      setMsg("Request failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove(e: string) {
    setBusy(true);
    try {
      await fetch("/api/team/remove", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: e }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="text-sm font-semibold text-slate-700">Invite a partner</h3>
        <p className="mt-1 text-sm text-slate-500">
          They sign in with this email and see only the companies you tick.
        </p>
        <div className="mt-3 space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="partner@company.com"
            className="w-full max-w-sm rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
          />
          <div className="flex flex-wrap gap-2">
            {ENTITIES.map((e) => {
              const on = brands.includes(e.key);
              return (
                <button
                  key={e.key}
                  onClick={() => toggle(e.key)}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition ${
                    on ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  }`}
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: e.color }} />
                  {e.name}
                </button>
              );
            })}
          </div>
          <button
            onClick={add}
            disabled={busy}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Invite / update"}
          </button>
          {msg && (
            <p
              className={`text-xs ${
                msg.startsWith("Error") || msg.includes("didn't")
                  ? "text-red-600"
                  : "text-emerald-600"
              }`}
            >
              {msg}
            </p>
          )}
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-700">People with access</h3>
        {members.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">
            No partners yet. You (the owner) see everything.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <tbody>
                {members.map((m) => (
                  <tr key={m.email} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-2.5 font-medium text-slate-800">{m.email}</td>
                    <td className="px-4 py-2.5 text-slate-500">
                      {m.role === "owner"
                        ? "Owner (all companies)"
                        : m.brands
                            .map((b) => ENTITIES.find((e) => e.key === b)?.name ?? b)
                            .join(", ")}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={() => remove(m.email)}
                        disabled={busy}
                        className="text-xs font-medium text-red-500 hover:text-red-700"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
