"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Result = {
  mechanics: string;
  timing: string;
  cues: string[];
  nextFocus: string;
  drill: string;
};

const MOTIONS: Record<string, { value: string; label: string }[]> = {
  baseball: [
    { value: "swing", label: "Swing / Hitting" },
    { value: "pitching", label: "Pitching" },
  ],
  softball: [
    { value: "swing", label: "Swing / Hitting" },
    { value: "pitching", label: "Pitching (windmill)" },
  ],
  golf: [{ value: "swing", label: "Swing" }],
};

const BREAK90_URL = "https://break90.aicoachingsolutions.net";

/** Extract evenly-spaced frames from a video file, in the browser. */
async function extractFrames(file: File, count = 4): Promise<string[]> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.src = url;

  await new Promise<void>((res, rej) => {
    video.onloadedmetadata = () => res();
    video.onerror = () => rej(new Error("Could not read that video file."));
  });

  const duration = video.duration || 0;
  const canvas = document.createElement("canvas");
  const maxW = 720;
  const scale = video.videoWidth ? Math.min(1, maxW / video.videoWidth) : 1;
  canvas.width = Math.round((video.videoWidth || maxW) * scale);
  canvas.height = Math.round((video.videoHeight || maxW) * scale);
  const ctx = canvas.getContext("2d");

  const frames: string[] = [];
  for (let i = 0; i < count; i++) {
    const t = duration * (0.1 + (0.8 * i) / Math.max(1, count - 1));
    // eslint-disable-next-line no-await-in-loop
    await new Promise<void>((res, rej) => {
      video.onseeked = () => res();
      video.onerror = () => rej(new Error("Could not read frames from that video."));
      video.currentTime = Math.min(t, Math.max(0, duration - 0.05));
    });
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      frames.push(canvas.toDataURL("image/jpeg", 0.7));
    }
  }

  URL.revokeObjectURL(url);
  return frames;
}

export default function VideoPage() {
  const supabase = createClient();

  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [signinEmail, setSigninEmail] = useState("");
  const [signinSent, setSigninSent] = useState(false);

  const [sport, setSport] = useState("baseball");
  const [motion, setMotion] = useState("swing");
  const [mainIssue, setMainIssue] = useState("");

  const [frames, setFrames] = useState<string[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outOfCredits, setOutOfCredits] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [isGolf, setIsGolf] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
      setReady(true);
    });
  }, [supabase]);

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const redirect = `${window.location.origin}/auth/callback?next=/video`;
    const { error } = await supabase.auth.signInWithOtp({
      email: signinEmail,
      options: { emailRedirectTo: redirect },
    });
    if (error) setError(error.message);
    else setSigninSent(true);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setResult(null);
    setFrames([]);
    setExtracting(true);
    try {
      const f = await extractFrames(file, 4);
      setFrames(f);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that video.");
    } finally {
      setExtracting(false);
    }
  }

  async function startCheckout(plan: "pack" | "pro_month" | "pro_year") {
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else setError(data.error || "Could not start checkout.");
    } catch {
      setError("Could not start checkout. Please try again.");
    }
  }

  async function analyze() {
    if (frames.length === 0) return;
    setAnalyzing(true);
    setError(null);
    setOutOfCredits(false);
    setResult(null);
    try {
      const res = await fetch("/api/analyze-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sport, motion, mainIssue, images: frames }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Analysis failed.");
        setOutOfCredits(Boolean(data.outOfCredits));
      } else {
        setResult(data.result);
        setIsGolf(Boolean(data.isGolf));
        setRemaining(typeof data.remaining === "number" ? data.remaining : null);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setAnalyzing(false);
    }
  }

  const motions = MOTIONS[sport] ?? [{ value: "swing", label: "Swing" }];

  if (!ready) {
    return (
      <main className="wrap">
        <p className="lede">Loading…</p>
      </main>
    );
  }

  // Not signed in → sign-in gate.
  if (!email) {
    return (
      <main className="wrap">
        <p className="eyebrow">Video Swing Breakdown</p>
        <h1>Sign in to analyze your swing on video</h1>
        <p className="lede">
          Upload a swing video and get an AI frame-by-frame breakdown. New accounts get
          <strong> 2 free video breakdowns</strong>.
        </p>
        <form className="card" onSubmit={sendMagicLink}>
          {signinSent ? (
            <p>Check your email for a sign-in link, then come back here.</p>
          ) : (
            <>
              <label>Email</label>
              <input
                type="email"
                required
                value={signinEmail}
                onChange={(e) => setSigninEmail(e.target.value)}
                placeholder="you@example.com"
              />
              <button className="btn" type="submit">Send me a sign-in link</button>
              {error && <div className="err">{error}</div>}
            </>
          )}
        </form>
        <p className="meta" style={{ marginTop: 16 }}>
          Just want a quick text breakdown? <a className="upgrade" href="/">Use the free text analyzer →</a>
        </p>
      </main>
    );
  }

  // Signed in → video flow.
  return (
    <main className="wrap">
      <p className="eyebrow">Video Swing Breakdown</p>
      <h1>Upload a swing. See what the AI sees.</h1>
      <p className="lede">
        We pull key frames from your video, show you exactly what&apos;s analyzed, and
        return a coaching breakdown.
      </p>

      <div className="card">
        <div className="row">
          <div>
            <label>Sport</label>
            <select
              value={sport}
              onChange={(e) => {
                const s = e.target.value;
                setSport(s);
                setMotion((MOTIONS[s] ?? [])[0]?.value ?? "swing");
              }}
            >
              <option value="baseball">Baseball</option>
              <option value="softball">Softball</option>
              <option value="golf">Golf</option>
            </select>
          </div>
          <div>
            <label>Motion</label>
            <select value={motion} onChange={(e) => setMotion(e.target.value)}>
              {motions.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
        </div>

        <label>Anything specific to look at? (optional)</label>
        <input
          value={mainIssue}
          onChange={(e) => setMainIssue(e.target.value)}
          placeholder="e.g. she keeps rolling over"
          maxLength={600}
        />

        <label style={{ marginTop: 16 }}>Swing video</label>
        <input type="file" accept="video/*" onChange={onFile} />

        {extracting && <p className="meta">Pulling frames from your video…</p>}

        {frames.length > 0 && (
          <>
            <p className="meta" style={{ marginTop: 16 }}>
              These are the frames the AI will analyze:
            </p>
            <div className="frames">
              {frames.map((f, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={f} alt={`Frame ${i + 1}`} className="frame" />
              ))}
            </div>
            <button className="btn" onClick={analyze} disabled={analyzing}>
              {analyzing ? "Analyzing…" : "Analyze these frames"}
            </button>
          </>
        )}

        {error && (
          <div className="err">
            {error}
            {outOfCredits && (
              <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button type="button" className="btn" style={{ marginTop: 0, width: "auto" }} onClick={() => startCheckout("pack")}>
                  Buy a Swing Pack — $4.99 / 5
                </button>
                <button type="button" className="btn" style={{ marginTop: 0, width: "auto", background: "transparent", color: "var(--gold)", border: "1px solid var(--gold)" }} onClick={() => startCheckout("pro_month")}>
                  Go Pro — 20/mo
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {result && (
        <section className="result">
          <h2>Mechanics — Root Cause</h2>
          <p>{result.mechanics}</p>
          <h2>Timing</h2>
          <p>{result.timing}</p>
          <h2>Coaching Cues</h2>
          <ul className="cues">{result.cues.map((c, i) => <li key={i}>{c}</li>)}</ul>
          <h2>Next Focus</h2>
          <p>{result.nextFocus}</p>
          <h2>Recommended Drill</h2>
          <p>{result.drill}</p>

          {remaining !== null && (
            <p className="meta"><span className="badge">{remaining} left</span></p>
          )}

          {isGolf && (
            <div className="card" style={{ marginTop: 20 }}>
              <h3 style={{ marginTop: 0 }}>Serious about your golf game?</h3>
              <p className="meta">
                Break90 is our dedicated golf coaching app — track rounds, find scoring
                leaks, and build practice around your game.
              </p>
              <a className="btn" href={BREAK90_URL} target="_blank" rel="noopener noreferrer">
                Explore Break90 →
              </a>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
