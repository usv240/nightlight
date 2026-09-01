import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verify a Ring Partner API webhook signature.
 *
 * Ring signs webhook deliveries with HMAC SHA-256 over the raw request body
 * and sends the signature in the X-Signature header. Always verify against
 * the raw bytes you received, before any JSON parsing, and reject on failure.
 *
 * Accepts hex or base64 encoded signatures, with or without a "sha256="
 * prefix, since gateway configurations differ. Comparison is timing-safe.
 */
export function verifySignature(
  rawBody: string | Buffer,
  signatureHeader: string | undefined,
  secret: string,
): boolean {
  if (!signatureHeader || !secret) return false;
  const body = typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : rawBody;
  const expected = createHmac("sha256", secret).update(body).digest();

  const cleaned = signatureHeader.trim().replace(/^sha256=/i, "");
  const candidates: Buffer[] = [];
  if (/^[0-9a-f]+$/i.test(cleaned) && cleaned.length % 2 === 0) {
    candidates.push(Buffer.from(cleaned, "hex"));
  }
  try {
    candidates.push(Buffer.from(cleaned, "base64"));
  } catch {
    // not base64, ignore
  }
  for (const candidate of candidates) {
    if (candidate.length === expected.length && timingSafeEqual(candidate, expected)) {
      return true;
    }
  }
  return false;
}

/** Produce a signature header value (hex) for testing and simulators. */
export function signBody(rawBody: string | Buffer, secret: string): string {
  const body = typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : rawBody;
  return createHmac("sha256", secret).update(body).digest("hex");
}
