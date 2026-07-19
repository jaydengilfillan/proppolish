import type { Metadata } from "next";
import "./globals.css";
import { APP_NAME, APP_TAGLINE } from "@/lib/config";

export const metadata: Metadata = {
  title: `${APP_NAME} — ${APP_TAGLINE}`,
  description: APP_TAGLINE,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-full bg-neutral-50 text-neutral-900 font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
