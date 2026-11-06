import { NextRequest, NextResponse } from "next/server";
import { getUsers } from "@/lib/auth";
import {
  getWeeklyTotal,
  getWeeklyAllowance,
  getAllHistory,
  isAdmin,
  isUsageConfigured,
  resetWeeklyTotal,
} from "@/lib/usage";

export const dynamic = "force-dynamic";

/**
 * Full usage breakdown across every known user — admin only. Gated on
 * isAdmin(username), checked against the verified x-pp-user header (set by
 * middleware.ts from the signed session cookie, not client-controlled), so
 * there's no way for a non-admin login to reach this even by guessing the URL.
 */
export async function GET(req: NextRequest) {
  const username = req.headers.get("x-pp-user");
  if (!username || !isAdmin(username)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  if (!isUsageConfigured()) {
    return NextResponse.json({
      configured: false,
      users: [],
      history: [],
    });
  }

  const allUsernames = Object.keys(getUsers());
  const users = await Promise.all(
    allUsernames.map(async (u) => ({
      username: u,
      weeklyTotal: await getWeeklyTotal(u),
      weeklyAllowance: getWeeklyAllowance(u),
    }))
  );
  const history = await getAllHistory(200);

  return NextResponse.json({ configured: true, users, history });
}

/** Admin only: reset a user's credits for the current week. Body: { username } */
export async function POST(req: NextRequest) {
  const caller = req.headers.get("x-pp-user");
  if (!caller || !isAdmin(caller)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as { username?: string };
  const target = body.username?.trim();
  if (!target || !(target in getUsers())) {
    return NextResponse.json({ error: "Unknown user." }, { status: 400 });
  }
  const ok = await resetWeeklyTotal(target);
  return NextResponse.json({ ok });
}
