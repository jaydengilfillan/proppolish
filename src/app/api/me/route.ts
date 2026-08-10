import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { isAdmin } from "@/lib/usage";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = process.env.AUTH_SECRET;
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const username = secret ? await verifySession(token, secret) : null;
  if (!username) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  return NextResponse.json({ username, isAdmin: isAdmin(username) });
}
