import { NextResponse } from "next/server";
import { getUsers } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Diagnostic-only, no secrets returned — just enough to tell whether the
 * server is actually seeing valid AUTH_USERS/AUTH_SECRET env vars, without
 * needing to screenshot the Vercel dashboard back and forth. Safe to leave
 * public: it exposes usernames (already semi-public — same people know their
 * own login) but never passwords or the signing secret itself.
 */
export async function GET() {
  const secret = process.env.AUTH_SECRET;
  const users = getUsers();
  return NextResponse.json({
    authSecretSet: !!secret && secret.length > 0,
    authSecretLength: secret ? secret.length : 0,
    userCount: Object.keys(users).length,
    usernames: Object.keys(users),
  });
}
