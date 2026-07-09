import { Suspense } from "react";
import { EntitySwitcher } from "./EntitySwitcher";
import type { EntityKey } from "@/lib/entities";

export function Topbar({
  email,
  configured,
  brands,
}: {
  email: string | null;
  configured: boolean;
  brands: EntityKey[];
}) {
  return (
    <header className="flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-6 py-3">
      <Suspense fallback={<div className="h-8" />}>
        <EntitySwitcher brands={brands} />
      </Suspense>

      <div className="flex items-center gap-3">
        {email ? (
          <>
            <span className="hidden text-sm text-slate-500 sm:inline">
              {email}
            </span>
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
              >
                Sign out
              </button>
            </form>
          </>
        ) : configured ? (
          <span className="text-sm text-slate-400">Not signed in</span>
        ) : (
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">
            Demo mode — Supabase not connected
          </span>
        )}
      </div>
    </header>
  );
}
