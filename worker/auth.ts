import type { Env } from "./types";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(str: string): Uint8Array {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function hashToken(raw: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(raw));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function generateRawToken(byteLen = 24): string {
  const bytes = new Uint8Array(byteLen);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

export function generateId(prefix: string): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${prefix}-${hex}`;
}

export async function verifyAdminPassword(password: string, env: Env): Promise<boolean> {
  const expected = env.ADMIN_PASSWORD || "admin123";
  const [a, b] = await Promise.all([hashToken(password), hashToken(expected)]);
  return a === b;
}

function getSigningSecret(env: Env): string {
  return env.JWT_SECRET || env.ADMIN_PASSWORD || "pulse-vps-dev-secret";
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signAdminToken(env: Env, ttlMs = 7 * 24 * 3600_000): Promise<{ token: string; expiresAt: number }> {
  const expiresAt = Date.now() + ttlMs;
  const payload = JSON.stringify({ sub: "admin", exp: expiresAt });
  const payloadB64 = toBase64Url(encoder.encode(payload));
  const key = await importHmacKey(getSigningSecret(env));
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payloadB64));
  return {
    token: `${payloadB64}.${toBase64Url(new Uint8Array(sig))}`,
    expiresAt,
  };
}

export async function verifyAdminToken(token: string | undefined, env: Env): Promise<boolean> {
  if (!token || !token.includes(".")) return false;
  const [payloadB64, sigB64] = token.split(".", 2);
  if (!payloadB64 || !sigB64) return false;
  try {
    const key = await importHmacKey(getSigningSecret(env));
    const sigBytes = fromBase64Url(sigB64);
    const valid = await crypto.subtle.verify("HMAC", key, sigBytes, encoder.encode(payloadB64));
    if (!valid) return false;
    const parsed = JSON.parse(decoder.decode(fromBase64Url(payloadB64))) as { sub?: string; exp?: number };
    return parsed.sub === "admin" && typeof parsed.exp === "number" && parsed.exp > Date.now();
  } catch {
    return false;
  }
}

export function extractBearerToken(authHeader: string | undefined): string | undefined {
  if (!authHeader) return undefined;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim();
}
