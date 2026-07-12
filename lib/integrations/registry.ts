import { credSet, anyCredWithPrefix } from "@/lib/credentials";

/**
 * Integration registry — one place that knows which tools/engines are connected.
 * Status is derived from stored credentials (Settings page) or env vars.
 * Drives the "Connected apps" page and status badges across the hub.
 */

export type IntegrationCategory =
  | "engine"
  | "revenue"
  | "crm"
  | "ads"
  | "research"
  | "knowledge"
  | "ai"
  | "media"
  | "platform";

export interface Integration {
  key: string;
  name: string;
  category: IntegrationCategory;
  configured: boolean;
  note: string;
  /** true = one of your own apps; false = a third-party SaaS */
  internal: boolean;
}

async function all(...names: string[]): Promise<boolean> {
  const results = await Promise.all(names.map((n) => credSet(n)));
  return results.every(Boolean);
}

export async function getIntegrations(): Promise<Integration[]> {
  const [goalEngine, signal, stripe, quickbooks, xero, ghl, facebookAds, gmail, blotato, higgsfield, shotstack, apify, openai] =
    await Promise.all([
      all("GOAL_ENGINE_URL", "GOAL_ENGINE_ENROLL_SECRET"),
      all("SIGNAL_SUPABASE_URL", "SIGNAL_SUPABASE_SERVICE_KEY"),
      anyCredWithPrefix("STRIPE_KEY__"),
      all("QUICKBOOKS_CLIENT_ID", "QUICKBOOKS_CLIENT_SECRET", "QUICKBOOKS_REDIRECT_URI"),
      all("XERO_CLIENT_ID", "XERO_CLIENT_SECRET", "XERO_REDIRECT_URI"),
      anyCredWithPrefix("GHL_TOKEN__"),
      anyCredWithPrefix("FACEBOOK_ADS_TOKEN__"),
      all("GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REDIRECT_URI"),
      credSet("BLOTATO_API_KEY"),
      credSet("HIGGSFIELD_API_KEY"),
      credSet("SHOTSTACK_API_KEY"),
      credSet("APIFY_TOKEN"),
      credSet("OPENAI_API_KEY"),
    ]);

  const supabase = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  return [
    {
      key: "goal-engine",
      name: "Goal Engine",
      category: "engine",
      configured: goalEngine,
      note: "Your live AI retargeting engine — launches multi-channel flows into GHL.",
      internal: true,
    },
    {
      key: "signal",
      name: "Signal",
      category: "engine",
      configured: signal,
      note: "Your voice platform — anonymised call data the brain learns from.",
      internal: true,
    },
    {
      key: "stripe",
      name: "Stripe",
      category: "revenue",
      configured: stripe,
      note: "Revenue & MRR per brand.",
      internal: false,
    },
    {
      key: "quickbooks",
      name: "QuickBooks",
      category: "revenue",
      configured: quickbooks,
      note: "Expenses & net via Profit-and-Loss (OAuth, connect per brand).",
      internal: false,
    },
    {
      key: "xero",
      name: "Xero",
      category: "revenue",
      configured: xero,
      note: "Expenses & net via Profit-and-Loss for brands on Xero (OAuth, per brand).",
      internal: false,
    },
    {
      key: "ghl",
      name: "GoHighLevel",
      category: "crm",
      configured: ghl,
      note: "Leads & pipeline + social publishing across your three agencies.",
      internal: false,
    },
    {
      key: "blotato",
      name: "Blotato",
      category: "platform",
      configured: blotato,
      note: "Optional alt social publisher (GHL is the default rail).",
      internal: false,
    },
    {
      key: "higgsfield",
      name: "Higgsfield",
      category: "media",
      configured: higgsfield,
      note: "Generates images (Social) and AI video clips (Video).",
      internal: false,
    },
    {
      key: "shotstack",
      name: "Shotstack",
      category: "media",
      configured: shotstack,
      note: "Assembles video clips into a finished MP4 (Video).",
      internal: false,
    },
    {
      key: "facebook-ads",
      name: "Facebook Ads",
      category: "ads",
      configured: facebookAds,
      note: "Ad spend per brand → cost-per-lead & ROAS (Marketing view).",
      internal: false,
    },
    {
      key: "gmail",
      name: "Gmail (Loom recaps)",
      category: "knowledge",
      configured: gmail,
      note: "Reads Loom recap emails → meeting knowledge into the brain (read-only).",
      internal: false,
    },
    {
      key: "apify",
      name: "Apify",
      category: "research",
      configured: apify,
      note: "Market & lead research (Marketing view).",
      internal: false,
    },
    {
      key: "openai",
      name: "OpenAI (gpt-5.5)",
      category: "ai",
      configured: openai,
      note: "AI drafting, brand-voice interview, insights.",
      internal: false,
    },
    {
      key: "supabase",
      name: "Supabase",
      category: "platform",
      configured: supabase,
      note: "Database, credential store & team login.",
      internal: false,
    },
  ];
}
