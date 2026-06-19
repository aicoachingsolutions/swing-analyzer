"use client";

import { useState } from "react";

type Product = "pack_small" | "pack_large" | "pro";

const OPTIONS: { product: Product; title: string; sub: string }[] = [
  { product: "pack_small", title: "5 video breakdowns", sub: "One-time — no subscription" },
  { product: "pack_large", title: "15 video breakdowns", sub: "One-time — best value" },
  { product: "pro", title: "Go Pro", sub: "Monthly — up to 20 videos/mo + PDF + history" },
];

export function BuyOptions() {
  const [busy, setBusy] = useState<Product | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function go(product: Product) {
    setBusy(product);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product }),
      });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url as string;
        return;
      }
      setError(data.error || "Could not start checkout.");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{ marginTop: 14 }}>
      <div style={grid}>
        {OPTIONS.map((o) => (
          <button
            key={o.product}
            type="button"
            className="btn"
            style={o.product === "pro" ? { marginTop: 0 } : ghost}
            onClick={() => go(o.product)}
            disabled={busy !== null}
          >
            <span style={{ display: "block", fontWeight: 800 }}>
              {busy === o.product ? "Starting…" : o.title}
            </span>
            <span style={{ display: "block", fontSize: "0.72rem", fontWeight: 600, opacity: 0.8 }}>
              {o.sub}
            </span>
          </button>
        ))}
      </div>
      {error && <p className="meta" style={{ color: "#fca5a5" }}>{error}</p>}
    </div>
  );
}

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 10,
};
const ghost: React.CSSProperties = {
  marginTop: 0,
  background: "transparent",
  color: "var(--gold)",
  border: "1px solid var(--gold)",
};
