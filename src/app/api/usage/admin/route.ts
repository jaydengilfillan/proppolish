import { NextRequest, NextResponse } from "next/server";
import { getUsers } from "@/lib/auth";
import {
  getWeeklyTotal,
  getWeeklyAllowance,
  getAllHistory,
  isAdmin,
  isUsageConfigured,
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
