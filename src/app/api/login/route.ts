import { NextRequest, NextResponse } from "next/server";
import { getUsers, signSession, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/auth";

export const dynamic = "force-dynamic";

interface LoginBody {
  username?: unknown;
  password?: unknown;
}

export async function POST(req: NextRequest) {
  let body: LoginBody;
  try {
    body = (await req.json()) as LoginBody;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  const secret = process.env.AUTH_SECRET;
  const users = getUsers();

  if (!secret || Object.keys(users).length === 0) {
    return NextResponse.json(
      {
        error:
          "Login isn't configured on the server yet — set AUTH_USERS and AUTH_SECRET in the Vercel project's environment variables, then redeploy.",
      },
      { status: 500 }
    );
  }

  if (!username || !password || users[username] !== password) {
    return NextResponse.json({ error: "Incorrect username or password." }, { status: 401 });
  }

  const token = await signSession(username, secret);
  const res = NextResponse.json({ ok: true, username });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return res;
}
