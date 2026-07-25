import { parsePhoneNumberFromString } from "libphonenumber-js";

/**
 * Lead timezone resolution — ported verbatim from the FB-retargeting project.
 * Order: GHL-provided tz → phone area-code country fallback → agency default.
 * Never overrides a valid GHL tz.
 */
const COUNTRY_FALLBACK_TZ: Record<string, string> = {
  GB: "Europe/London",
  IE: "Europe/Dublin",
  US: "America/New_York",
  CA: "America/Toronto",
  AU: "Australia/Sydney",
  NZ: "Pacific/Auckland",
  FR: "Europe/Paris",
  DE: "Europe/Berlin",
  ES: "Europe/Madrid",
  IT: "Europe/Rome",
  NL: "Europe/Amsterdam",
  IN: "Asia/Kolkata",
  AE: "Asia/Dubai",
  ZA: "Africa/Johannesburg",
  SG: "Asia/Singapore",
};

const DEFAULT_TZ = "America/Chicago";

export function resolveLeadTimezone(opts: {
  ghlTimezone?: string | null;
  phoneE164?: string | null;
  agencyTimezone?: string | null;
}): string {
  if (opts.ghlTimezone && isValidIanaTz(opts.ghlTimezone)) return opts.ghlTimezone;

  if (opts.phoneE164) {
    const parsed = parsePhoneNumberFromString(opts.phoneE164);
    const country = parsed?.country;
    if (country && COUNTRY_FALLBACK_TZ[country]) return COUNTRY_FALLBACK_TZ[country];
  }

  return opts.agencyTimezone ?? DEFAULT_TZ;
}

export function isValidIanaTz(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
