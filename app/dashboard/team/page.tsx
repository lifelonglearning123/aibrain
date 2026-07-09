import { redirect } from "next/navigation";
import { TeamManager } from "@/components/TeamManager";
import { getAccess } from "@/lib/access";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const access = await getAccess();
  if (!access.isOwner) redirect("/dashboard");

  const admin = createAdminClient();
  const { data } = admin
    ? await admin.from("memberships").select("email,role,brands").order("created_at", { ascending: true })
    : { data: [] };
  const members = (data ?? []) as { email: string; role: string; brands: string[] }[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Team &amp; access</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Invite partners and control which company each person can see. Everything is scoped
          server-side — they can never reach another company&apos;s data.
        </p>
      </div>

      {access.unconfigured && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <p className="font-medium">Access control isn&apos;t switched on yet.</p>
          <p className="mt-1">
            Right now everyone who signs in is treated as an owner. To lock it down, set{" "}
            <strong>your own email</strong> as an owner in <strong>Settings → Access</strong>
            (OWNER_EMAILS), then invite partners here.
          </p>
        </div>
      )}

      <TeamManager members={members} />
    </div>
  );
}
