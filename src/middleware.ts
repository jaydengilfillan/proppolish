import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";

// Paths that must stay reachable without a session:
// - /login and /api/login: you can't log in if the login page itself is gated.
// - /api/logout: needs to be callable to clear a stale/invalid cookie.
// Everything else (including /api/process and /api/analyze-floorplan) is
// gated — those cost real money per call against FAL/OpenAI keys.
const PUBLIC_PATHS = new Set(["/login", "/api/login", "/api/logout"]);

// Login gate is ON. (It was briefly bypassed to unblock a job mid-shift —
// see git history on `main` around "EMERGENCY_BYPASS" — this branch turns
// it back on once AUTH_USERS/AUTH_SECRET are confirmed correct in Vercel.)
const EMERGENCY_BYPASS = false;

export async function middleware(req: NextRequest) {
  if (EMERGENCY_BYPASS) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  const secret = process.env.AUTH_SECRET;
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const username = secret ? await verifySession(token, secret) : null;

  if (username) return NextResponse.next();

  // Fail CLOSED: if AUTH_SECRET isn't set yet (e.g. mid-setup), nobody gets
  // in rather than nobody being gated. The /login page's own submit will
  // surface a clear "not configured" error to whoever is setting it up.
  if (pathname.startsWith("/api")) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/login", req.url));
}

// Runs on everything except Next's own static/image pipeline, the favicon,
// and /skies/* — the Twilight sky reference photos, which FAL's servers
// fetch directly and would never carry our session cookie (same failure
// mode Vercel's own Deployment Protection caused earlier for this exact
// route — see prompts.ts/config.ts history).
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|skies/).*)"],
};
