import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ActiveProjectProvider } from "@/components/shell/ActiveProjectProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Kabanchik · ScrumAgent",
  description: "AI agent that runs your scrum.",
  icons: {
    icon: "/kabanchik-boar.svg",
  },
};

const FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,400;1,9..144,500&family=JetBrains+Mono:wght@400;500&family=Instrument+Serif:ital@0;1&family=Space+Grotesk:wght@400;500;600&family=Manrope:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link rel="stylesheet" href={FONTS_HREF} />
      </head>
      {/* Default density = "cozy" matches the prototype tweaks default. */}
      <body className="density-cozy">
        <ActiveProjectProvider>{children}</ActiveProjectProvider>
      </body>
    </html>
  );
}
