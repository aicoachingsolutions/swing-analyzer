import type { Metadata } from "next";
import "./globals.css";
import SiteHeader from "./_components/site-header";
import SiteFooter from "./_components/site-footer";

export const metadata: Metadata = {
  title: "Free Swing & Pitching Analyzer — AI Coaching Solutions",
  description:
    "Get an AI coaching breakdown of a baseball, softball, or golf swing or pitch — root cause, cues, and a drill for your next practice.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className="page-shell">
          <SiteHeader />
          <div className="page-shell__main">{children}</div>
          <SiteFooter />
        </div>
      </body>
    </html>
  );
}
