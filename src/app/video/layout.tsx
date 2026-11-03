import { ReactNode } from "react";
import { VideoProvider } from "@/lib/videoStore";
import UsageCredits from "@/components/UsageCredits";
import AccountBar from "./AccountBar";

export default function VideoLayout({ children }: { children: ReactNode }) {
  return (
    <VideoProvider>
      <AccountBar credits={<UsageCredits always />} />
      {children}
    </VideoProvider>
  );
}
