import { BrandContextForm } from "@/components/BrandContextForm";
import { getAccess } from "@/lib/access";
import { getBrandProfiles } from "@/lib/brand-profile";
import { ENTITIES } from "@/lib/entities";
import { supabaseConfig } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export default async function ContextPage() {
  const configured = supabaseConfig().configured;
  const access = configured ? await getAccess() : null;
  const brands = ENTITIES.filter((e) => (access ? access.brands.includes(e.key) : true)).map(
    (e) => ({ key: e.key, name: e.name }),
  );
  const profiles = await getBrandProfiles(brands.map((b) => b.key));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Business context</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Teach the brain each business in your own words. This is the foundation — it feeds Ask,
          your Daily Brief, sequence drafting and the retargeting engine, so the more you fill in,
          the smarter and more on-brand everything gets.
        </p>
      </div>
      {brands.length === 0 ? (
        <p className="text-sm text-slate-500">No businesses available to you yet.</p>
      ) : (
        <BrandContextForm brands={brands} initialProfiles={profiles} />
      )}
    </div>
  );
}
