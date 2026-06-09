import type { Metadata } from "next";
import "./globals.css";
import SiteHeader from "./_components/site-header";
import SiteFooter from "./_components/site-footer";

export const metadata: Metadata = {
  title: "Free Swing Analyzer — AI Coaching Solutions",
  description:
    "Describe a golf, baseball, or softball swing or pitch and get a sharp coaching breakdown — root cause, cues, and a drill for your next practice.",
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
