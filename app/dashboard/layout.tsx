import { Suspense } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { ClaimOwner } from "@/components/ClaimOwner";
import { supabaseConfig } from "@/lib/supabase/config";
import { getAccess } from "@/lib/access";
import { ENTITIES, type EntityKey } from "@/lib/entities";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { configured } = supabaseConfig();

  let email: string | null = null;
  let brands: EntityKey[] = ENTITIES.map((e) => e.key);
  let isOwner = true;

  if (configured) {
    const access = await getAccess();
    email = access.email;
    brands = access.brands;
    isOwner = access.isOwner;

    if (!access.hasAccess) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
          <div className="max-w-sm rounded-xl border border-slate-200 bg-white p-6 text-center">
            <h1 className="text-lg font-semibold text-slate-900">No access</h1>
            <p className="mt-2 text-sm text-slate-500">
              {email ? <>Your account (<strong>{email}</strong>) hasn&apos;t been given access yet.</> : "You're not signed in."}{" "}
              {access.canClaim ? "" : "Ask the owner to invite you."}
            </p>
            {access.canClaim && <ClaimOwner email={email} />}
            <form action="/auth/signout" method="post" className="mt-4">
              <button
                type="submit"
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      );
    }
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Suspense fallback={<div className="hidden w-60 bg-slate-900 md:block" />}>
        <Sidebar isOwner={isOwner} />
      </Suspense>
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar email={email} configured={configured} brands={brands} />
        <main className="flex-1 p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
