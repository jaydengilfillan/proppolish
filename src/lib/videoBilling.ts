/**
 * Video billing: every fal call made through the /api/video routes is checked against the caller's
 * weekly allowance (WEEKLY_ALLOWANCES) and recorded as usage (shown in the credit tracker and the admin Usage view).
 * Admins and users with no allowance are never blocked. Needs Redis (same as the photo app's tracker).
 */
import { NextRequest, NextResponse } from "next/server";
import { getWeeklyAllowance, getWeeklyTotal, isAdmin, isUsageConfigured, recordUsage } from "@/lib/usage";

/** Returns an error response if this user can't afford `cost`, otherwise null. */
export async function checkCredits(req: NextRequest, cost: number): Promise<NextResponse | null> {
  const user = req.headers.get("x-pp-user");
  if (!user || isAdmin(user) || !isUsageConfigured()) return null;
  const allowance = getWeeklyAllowance(user);
  if (allowance === null) return null;
  const used = await getWeeklyTotal(user);
  if (used + cost > allowance + 0.0001) {
    const left = Math.max(0, allowance - used);
    return NextResponse.json(
      { error: `Weekly credit limit reached (402): $${left.toFixed(2)} of $${allowance.toFixed(2)} left, this needs about $${cost.toFixed(2)}. Credits reset every Monday.` },
      { status: 402 }
    );
  }
  return null;
}

/** Record a successful submission's estimated cost against the user. */
export async function chargeCredits(req: NextRequest, cost: number, mode: string, provider = "fal", imageUrl?: string): Promise<void> {
  const user = req.headers.get("x-pp-user");
  if (!user || !(cost > 0)) return;
  await recordUsage(user, { tab: "video", mode, provider, cost: Math.round(cost * 1000) / 1000, at: Date.now(), ...(imageUrl ? { imageUrl } : {}) });
}
