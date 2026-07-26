/**
 * Minimal cookie-based session auth — no database. A small, fixed set of
 * named users (you + your editor, etc.) live in the AUTH_USERS env var as
 * plaintext JSON, e.g. {"jayden":"somepassword","editor":"anotherpassword"}.
 * Treat that env var with the same care as FAL_KEY/OPENAI_API_KEY — anyone
 * who can read it can read every password.
 *
 * Sessions are a signed token (HMAC-SHA256 over "username.issuedAt"), stored
 * in an httpOnly cookie. No server-side session store is needed — verifying
 * just means recomputing the signature with AUTH_SECRET and checking it
 * matches, which works identically in Edge middleware and Node API routes
 * since it only uses the Web Crypto API (available in both).
 *
 * Honest limitation: this stops randoms who don't have credentials, and lets
 * you tell who's using the app. It cannot stop someone who DOES have valid
 * credentials from sharing them — no login system anywhere can do that.
 */

const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const encoder = new TextEncoder();

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Parse the AUTH_USERS env var into a { username: password } map. */
export function getUsers(): Record<string, string> {
  const raw = process.env.AUTH_USERS;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === "string") out[k] = v;
      }
      return out;
    }
  } catch {
    /* malformed env var — treated as no users configured */
  }
  return {};
}

/** Sign a new session token for a username. */
export async function signSession(username: string, secret: string): Promise<string> {
  const payload = `${username}.${Date.now()}`;
  const key = await hmacKey(secret);
  const sigBuf = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return `${payload}.${toHex(sigBuf)}`;
}

/** Verify a session token, returning the username if valid and unexpired. */
export async function verifySession(
  token: string | undefined | null,
  secret: string
): Promise<string | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [username, tsStr, sigHex] = parts;
  if (!username || !tsStr || !sigHex) return null;

  const payload = `${username}.${tsStr}`;
  const key = await hmacKey(secret);
  const expectedBuf = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  const expectedHex = toHex(expectedBuf);
  if (expectedHex !== sigHex) return null;

  const ts = Number(tsStr);
  if (!Number.isFinite(ts)) return null;
  if (Date.now() - ts > SESSION_MAX_AGE_MS) return null;

  return username;
}

export const SESSION_COOKIE = "pp_session";
export const SESSION_MAX_AGE_SECONDS = SESSION_MAX_AGE_MS / 1000;
