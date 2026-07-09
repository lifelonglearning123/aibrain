import { AskChat } from "@/components/AskChat";
import { openaiConfig } from "@/lib/ai/openai";
import { supabaseConfig } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export default async function AskPage() {
  const ready = supabaseConfig().configured && (await openaiConfig()).configured;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Ask your data</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Interrogate your business — answered from your live brief and everything the brain has
          learned.
        </p>
      </div>
      <AskChat ready={ready} />
    </div>
  );
}
