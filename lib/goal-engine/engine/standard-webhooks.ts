import crypto from "node:crypto";

/**
 * Verify a Standard Webhooks signature (the scheme Supabase Auth's Send Email
 * Hook uses). Secret arrives as "v1,whsec_<base64>" (or just "whsec_<base64>").
 * Signed content is `${id}.${timestamp}.${body}`; the header is a space-
 * separated list of `v1,<base64sig>`.
 */
export function verifyStandardWebhook(opts: {
  secret: string;
  id: string;
  timestamp: string;
  signature: string;
  body: string;
}): boolean {
  let secret = opts.secret;
  const marker = secret.indexOf("whsec_");
  if (marker >= 0) secret = secret.slice(marker + "whsec_".length);
  const key = Buffer.from(secret, "base64");

  const expected = crypto
    .createHmac("sha256", key)
    .update(`${opts.id}.${opts.timestamp}.${opts.body}`)
    .digest("base64");

  const provided = opts.signature.split(" ").map((s) => (s.includes(",") ? s.split(",")[1] : s));
  return provided.some((p) => {
    try {
      return crypto.timingSafeEqual(Buffer.from(p), Buffer.from(expected));
    } catch {
      return false;
    }
  });
}
