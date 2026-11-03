"use client";

import { ReactNode, useEffect, useState } from "react";

/** Slim top bar for the video tool: who is signed in, the weekly credit tracker, and sign out. */
export default function AccountBar({ credits }: { credits: ReactNode }) {
  const [user, setUser] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { username?: string } | null) => setUser(d?.username ?? null))
      .catch(() => setUser(null));
  }, []);
  async function signOut() {
    await fetch("/api/logout", { method: "POST" }).catch(() => undefined);
    window.location.href = "/login";
  }
  return (
    <div className="mx-auto flex max-w-5xl items-center justify-end gap-4 px-4 pt-3 text-xs text-neutral-500 sm:px-6">
      {credits}
      {user && <span>{user}</span>}
      {user && (
        <button onClick={signOut} className="underline hover:text-neutral-800">
          Sign out
        </button>
      )}
    </div>
  );
}
