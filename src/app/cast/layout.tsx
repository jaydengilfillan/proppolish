import { ReactNode } from "react";
import { VideoProvider } from "@/lib/videoStore";

/** Shares the video job tracker so scene clips made on this page are polled and saved like Create-tab jobs. */
export default function CastLayout({ children }: { children: ReactNode }) {
  return <VideoProvider>{children}</VideoProvider>;
}
