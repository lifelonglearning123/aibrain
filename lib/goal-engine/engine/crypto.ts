import crypto from "node:crypto";

/**
 * App-level symmetric encryption for per-location GHL tokens (used when
 * Supabase Vault is off — the pilot path). AES-256-GCM. Key is 32 bytes as
 * 64 hex chars in APP_ENCRYPTION_KEY (generate: `openssl rand -hex 32`).
 */
function key(): Buffer {
  const k = process.env.APP_ENCRYPTION_KEY;
  if (!k) throw new Error("APP_ENCRYPTION_KEY not set");
  const buf = Buffer.from(k, "hex");
  if (buf.length !== 32) throw new Error("APP_ENCRYPTION_KEY must be 32 bytes hex (64 chars)");
  return buf;
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, enc].map((b) => b.toString("base64")).join(".");
}

export function decryptSecret(payload: string): string {
  const [iv, tag, enc] = payload.split(".").map((s) => Buffer.from(s, "base64"));
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}
