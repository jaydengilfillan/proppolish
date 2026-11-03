import { ReactNode } from "react";
import { VideoProvider } from "@/lib/videoStore";

export default function VideoLayout({ children }: { children: ReactNode }) {
  return <VideoProvider>{children}</VideoProvider>;
}
