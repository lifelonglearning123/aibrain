import { createHash, timingSafeEqual } from "crypto";
import { cred } from "@/lib/credentials";

/**
 * Machine-to-machine auth for the Brain's outward APIs (knowledge provider +
 * funnel outcomes). The caller (Goal Engine) sends the shared secret in an
 * `x-brain-secret` (or `x-enroll-secret`) header. Reuses GOAL_ENGINE_ENROLL_SECRET
 * so there's one secret to manage; a dedicated BRAIN_API_SECRET also works.
 */
export async function checkApiSecret(req: Request): Promise<boolean> {
  const provided =
    req.headers.get("x-brain-secret") || req.headers.get("x-enroll-secret") || "";
  const [a, b] = await Promise.all([cred("BRAIN_API_SECRET"), cred("GOAL_ENGINE_ENROLL_SECRET")]);
  const valid = [a, b].filter((s): s is string => Boolean(s));
  if (valid.length === 0 || !provided) return false;
  // Constant-time compare via fixed-length hashes (avoids length leaks).
  const p = createHash("sha256").update(provided).digest();
  return valid.some((s) => {
    const t = createHash("sha256").update(s).digest();
    return timingSafeEqual(p, t);
  });
}
