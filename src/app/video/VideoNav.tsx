"use client";

import Link from "next/link";
import { useVideoStore } from "@/lib/videoStore";

const TABS = [
  { id: "relight", href: "/video", label: "Relight" },
  { id: "create", href: "/video/create", label: "Create" },
  { id: "edit", href: "/video/edit", label: "Edit" },
] as const;

/** Tab bar shared by the video pages. Shows how many jobs are still running. */
export default function VideoNav({ active }: { active: "relight" | "create" | "edit" }) {
  const { jobs } = useVideoStore();
  const running = jobs.filter((j) => j.status === "waiting" || j.status === "queued" || j.status === "running").length;
  return (
    <nav className="mb-6 flex items-center gap-2 border-b border-neutral-200 text-sm">
      {TABS.map((t) =>
        t.id === active ? (
          <span key={t.id} className="-mb-px border-b-2 border-neutral-900 px-3 py-2 font-medium">
            {t.label}
          </span>
        ) : (
          <Link key={t.id} href={t.href} className="-mb-px border-b-2 border-transparent px-3 py-2 font-medium text-neutral-500 hover:text-neutral-800">
            {t.label}
          </Link>
        )
      )}
      {running > 0 && <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">{running} running</span>}
    </nav>
  );
}
