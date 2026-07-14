import { AskChat } from "@/components/AskChat";
import { openaiConfig } from "@/lib/ai/openai";
import { supabaseConfig } from "@/lib/supabase/config";
import { getAccess } from "@/lib/access";
import { ENTITIES } from "@/lib/entities";

export const dynamic = "force-dynamic";

export default async function AskPage() {
  const configured = supabaseConfig().configured;
  const ready = configured && (await openaiConfig()).configured;
  const access = configured ? await getAccess() : null;
  const brands = ENTITIES.filter((e) => (access ? access.brands.includes(e.key) : true)).map(
    (e) => ({ key: e.key, name: e.name }),
  );
  const canTeach = access ? access.isOwner : true;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Ask your data</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Interrogate your business — it queries live Stripe, pipeline and accounting data on
          demand, then answers with the real numbers.
        </p>
      </div>
      <AskChat ready={ready} brands={brands} canTeach={canTeach} />
    </div>
  );
}
