import { redirect } from "next/navigation";
import { CredentialsForm, type CredGroup } from "@/components/CredentialsForm";
import { ENTITIES } from "@/lib/entities";
import { credSet, credentialStoreAvailable } from "@/lib/credentials";
import { supabaseConfig } from "@/lib/supabase/config";
import { getAccess } from "@/lib/access";

export const dynamic = "force-dynamic";

/** Env-var suffix for a brand, e.g. artificial-ignorance → ARTIFICIAL_IGNORANCE. */
function suffix(key: string) {
  return key.toUpperCase().replace(/-/g, "_");
}

export default async function SettingsPage() {
  // Owner-only: settings hold every company's credentials.
  if (supabaseConfig().configured) {
    const access = await getAccess();
    if (!access.isOwner) redirect("/dashboard");
  }

  const groups: CredGroup[] = [
    {
      title: "Access — set your own email as owner to lock down partner access",
      fields: [
        {
          name: "OWNER_EMAILS",
          label: "Owner emails (comma-separated) — full access to every company",
          kind: "text",
          placeholder: "you@macaws.ai",
        },
        {
          name: "EMAIL_SENDER_BRAND",
          label:
            "Email sender brand — which GHL account sends invites & sign-in links (macaws / artificial-ignorance / leonardo)",
          kind: "text",
          placeholder: "macaws",
        },
      ],
    },
    {
      title: "OpenAI — AI drafting, brand-voice interview, insights",
      fields: [
        { name: "OPENAI_API_KEY", label: "API key", kind: "secret" },
        { name: "OPENAI_MODEL", label: "Model (optional)", kind: "text", placeholder: "gpt-5.5" },
      ],
    },
    {
      title: "GoHighLevel — per brand (Pipeline · Marketing · Social)",
      fields: ENTITIES.flatMap((e) => [
        { name: `GHL_TOKEN__${suffix(e.key)}`, label: `${e.name} — auth token`, kind: "secret" as const },
        { name: `GHL_LOCATION__${suffix(e.key)}`, label: `${e.name} — location ID`, kind: "text" as const },
        {
          name: `GHL_USER__${suffix(e.key)}`,
          label: `${e.name} — user ID (optional, for social publishing)`,
          kind: "text" as const,
        },
      ]),
    },
    {
      title: "Stripe — per brand (Revenue)",
      fields: ENTITIES.map((e) => ({
        name: `STRIPE_KEY__${suffix(e.key)}`,
        label: `${e.name} — restricted key`,
        kind: "secret" as const,
      })),
    },
    {
      title: "Facebook Ads — per brand (Cost-per-lead · ROAS)",
      fields: ENTITIES.flatMap((e) => [
        {
          name: `FACEBOOK_ADS_TOKEN__${suffix(e.key)}`,
          label: `${e.name} — access token (system-user or long-lived)`,
          kind: "secret" as const,
        },
        {
          name: `FACEBOOK_AD_ACCOUNT__${suffix(e.key)}`,
          label: `${e.name} — ad account ID (act_… or the number)`,
          kind: "text" as const,
        },
      ]),
    },
    {
      title: "QuickBooks — expenses & net (OAuth). Use for brands on QuickBooks.",
      fields: [
        { name: "QUICKBOOKS_CLIENT_ID", label: "Client ID", kind: "text" },
        { name: "QUICKBOOKS_CLIENT_SECRET", label: "Client secret", kind: "secret" },
        { name: "QUICKBOOKS_ENVIRONMENT", label: "Environment", kind: "text", placeholder: "production" },
        {
          name: "QUICKBOOKS_REDIRECT_URI",
          label: "Redirect URI",
          kind: "text",
          placeholder: "http://localhost:3000/api/integrations/quickbooks/callback",
        },
      ],
    },
    {
      title: "Xero — expenses & net (OAuth). Use for brands on Xero (e.g. Artificial Ignorance).",
      fields: [
        { name: "XERO_CLIENT_ID", label: "Client ID", kind: "text" },
        { name: "XERO_CLIENT_SECRET", label: "Client secret", kind: "secret" },
        {
          name: "XERO_REDIRECT_URI",
          label: "Redirect URI (must match your Xero app exactly)",
          kind: "text",
          placeholder: "https://aibrain.macaws.ai/api/integrations/xero/callback",
        },
      ],
    },
    {
      title: "Higgsfield — images + AI video clips",
      fields: [
        {
          name: "HIGGSFIELD_API_KEY",
          label: "API key — format KEY_ID:KEY_SECRET (both parts, joined by a colon)",
          kind: "secret",
        },
        {
          name: "HIGGSFIELD_MODEL",
          label: "Image model (optional) — V1 text→image model",
          kind: "text",
          placeholder: "soul",
        },
        {
          name: "HIGGSFIELD_VIDEO_MODEL",
          label: "Video model (optional)",
          kind: "text",
          placeholder: "dop-turbo",
        },
      ],
    },
    {
      title: "Shotstack — video assembly",
      fields: [
        { name: "SHOTSTACK_API_KEY", label: "API key", kind: "secret" },
        { name: "SHOTSTACK_ENV", label: "Environment", kind: "text", placeholder: "production" },
      ],
    },
    {
      title: "Apify — market & lead research",
      fields: [
        { name: "APIFY_TOKEN", label: "API token", kind: "secret" },
        { name: "APIFY_ACTOR_ID", label: "Actor ID (optional)", kind: "text", placeholder: "compass~crawler-google-places" },
      ],
    },
    {
      title: "Goal Engine — retargeting",
      fields: [
        { name: "GOAL_ENGINE_URL", label: "URL", kind: "text", placeholder: "https://goal-engine.vercel.app" },
        { name: "GOAL_ENGINE_ENROLL_SECRET", label: "Enrol secret", kind: "secret" },
      ],
    },
    {
      title: "Signal — call data for self-learning (read-only)",
      fields: [
        { name: "SIGNAL_SUPABASE_URL", label: "Signal Supabase URL", kind: "text", placeholder: "https://xxxx.supabase.co" },
        { name: "SIGNAL_SUPABASE_SERVICE_KEY", label: "Signal Supabase service key (used read-only)", kind: "secret" },
      ],
    },
    {
      title: "Gmail — reads Loom recap emails into the knowledge base (read-only). Then connect from Connected apps.",
      fields: [
        { name: "GMAIL_CLIENT_ID", label: "Client ID", kind: "text" },
        { name: "GMAIL_CLIENT_SECRET", label: "Client secret", kind: "secret" },
        {
          name: "GMAIL_REDIRECT_URI",
          label: "Redirect URI (must match your Google OAuth app exactly)",
          kind: "text",
          placeholder: "https://aibrain.macaws.ai/api/integrations/gmail/callback",
        },
      ],
    },
  ];

  const names = groups.flatMap((g) => g.fields.map((f) => f.name));
  const statusEntries = await Promise.all(names.map(async (n) => [n, await credSet(n)] as const));
  const status = Object.fromEntries(statusEntries);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Settings — connections</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Enter your API keys and tokens here. They&apos;re stored securely in your
          database and never shown back. Fields already set show ••••; leave blank
          to keep them.
        </p>
      </div>

      <CredentialsForm
        groups={groups}
        status={status}
        storeAvailable={credentialStoreAvailable()}
      />
    </div>
  );
}
