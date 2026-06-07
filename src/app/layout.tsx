import type { Metadata } from "next";
import "./globals.css";

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
      <body>{children}</body>
    </html>
  );
}
