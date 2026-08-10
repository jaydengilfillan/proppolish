import { NextRequest, NextResponse } from "next/server";
import { getWeeklyTotal, getWeeklyAllowance, isAdmin, isUsageConfigured } from "@/lib/usage";

export const dynamic = "force-dynamic";

/**
 * Returns the CALLING user's own weekly usage — used for the small credits
 * widget every non-admin user sees. Deliberately does NOT accept a
 * "username" query param — you can only ever see your own number through
 * this route, never anyone else's (that's what /api/usage/admin is for, and
 * it's gated to admins only).
 */
export async function GET(req: NextRequest) {
  const username = req.headers.get("x-pp-user");
  if (!username) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  if (!isUsageConfigured()) {
    return NextResponse.json({ configured: false, username, isAdmin: isAdmin(username) });
  }

  const [weeklyTotal] = await Promise.all([getWeeklyTotal(username)]);
  const weeklyAllowance = getWeeklyAllowance(username);

  return NextResponse.json({
    configured: true,
    username,
    isAdmin: isAdmin(username),
    weeklyTotal,
    weeklyAllowance, // null means "no allowance set for this user" (e.g. admins)
  });
}
