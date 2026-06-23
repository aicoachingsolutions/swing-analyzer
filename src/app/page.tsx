"use client";

import { useState } from "react";

type Metrics = {
  primaryFault: string;
  faultCategory: string;
  severity: number;
  confidence: number;
};
type Result = {
  mechanics: string;
  timing: string;
  cues: string[];
  nextFocus: string;
  drill: string;
  metrics: Metrics;
};
type Session = {
  sport: string;
  motion: string;
  ageGroup: string;
  skillLevel: string;
  mainIssue: string;
};

const MOTIONS: Record<string, { value: string; label: string }[]> = {
  golf: [{ value: "swing", label: "Swing" }],
  baseball: [
    { value: "swing", label: "Swing / Hitting" },
    { value: "pitching", label: "Pitching" },
  ],
  softball: [
    { value: "swing", label: "Swing / Hitting" },
    { value: "pitching", label: "Pitching (windmill)" },
  ],
};

export default function Home() {
  const [sport, setSport] = useState("baseball");
  const [motion, setMotion] = useState("swing");
  const [handedness, setHandedness] = useState("");
  const [ageGroup, setAgeGroup] = useState("");
  const [skillLevel, setSkillLevel] = useState("");
  const [mainIssue, setMainIssue] = useState("");
  const [hp, setHp] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [upgrade, setUpgrade] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [tier, setTier] = useState<string>("anonymous");
  const [session, setSession] = useState<Session | null>(null);

  // delivery state
  const [email, setEmail] = useState("");
  const [emailMsg, setEmailMsg] = useState<string | null>(null);
  const [emailBusy, setEmailBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setUpgrade(false);
    setResult(null);
    setEmailMsg(null);

    const sess: Session = { sport, motion, ageGroup, skillLevel, mainIssue };

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sport,
          motion,
          handedness: handedness || undefined,
          ageGroup,
          skillLevel,
          mainIssue,
          _hp: hp,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        setUpgrade(Boolean(data.upgrade));
      } else {
        setResult(data.result);
        setTier(data.tier || "anonymous");
        setSession(sess);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function onEmail() {
    if (!result || !session) return;
    setEmailBusy(true);
    setEmailMsg(null);
    try {
      const res = await fetch("/api/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, session, result }),
      });
      const data = await res.json();
      setEmailMsg(res.ok ? "Sent! Check your inbox." : data.error || "Could not send.");
    } catch {
      setEmailMsg("Network error. Try again.");
    } finally {
      setEmailBusy(false);
    }
  }

  async function onPdf() {
    if (!result || !session) return;
    setPdfBusy(true);
    try {
      const res = await fetch("/api/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session, result }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setEmailMsg(data.error || "Could not generate PDF.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "swing-breakdown.pdf";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setEmailMsg("Network error. Try again.");
    } finally {
      setPdfBusy(false);
    }
  }

  const motions = MOTIONS[sport] ?? [{ value: "swing", label: "Swing" }];

  return (
    <main className="wrap">
      <p className="eyebrow">Free Swing &amp; Pitching Analyzer</p>
      <h1>Describe the swing or pitch. Get a coaching breakdown.</h1>
      <p className="lede">
        Tell us what you&apos;re seeing in a baseball, softball, or golf swing or
        pitch — like &ldquo;she rolls over everything&rdquo; or &ldquo;he&apos;s
        late on the rise.&rdquo; You&apos;ll get the root cause, cues, and a drill
        for your next practice.
      </p>

      <a href="/video" className="video-cta">
        <span className="video-cta__icon" aria-hidden="true">🎥</span>
        <span className="video-cta__text">
          <strong>New: Video Swing &amp; Pitching Breakdown</strong>
          <span>Upload a clip — see the exact frames the AI reads and get a full breakdown. 2 free with sign-up.</span>
        </span>
        <span className="video-cta__btn">Try it →</span>
      </a>

      <form className="card" onSubmit={onSubmit}>
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
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="row">
          <div>
            <label>Handedness (optional)</label>
            <select value={handedness} onChange={(e) => setHandedness(e.target.value)}>
              <option value="">Not sure</option>
              <option value="right">Right-handed</option>
              <option value="left">Left-handed</option>
            </select>
          </div>
          <div>
            <label>Age group (optional)</label>
            <input
              value={ageGroup}
              onChange={(e) => setAgeGroup(e.target.value)}
              placeholder="e.g. 12U, high school"
            />
          </div>
          <div>
            <label>Skill level (optional)</label>
            <input
              value={skillLevel}
              onChange={(e) => setSkillLevel(e.target.value)}
              placeholder="e.g. beginner, varsity"
            />
          </div>
        </div>

        <label>What are you seeing?</label>
        <textarea
          value={mainIssue}
          onChange={(e) => setMainIssue(e.target.value)}
          placeholder="Describe the issue in coaching terms (at least 20 characters)…"
          maxLength={600}
        />

        <input
          className="hp"
          tabIndex={-1}
          autoComplete="off"
          value={hp}
          onChange={(e) => setHp(e.target.value)}
          aria-hidden="true"
        />

        <button className="btn" type="submit" disabled={loading}>
          {loading ? "Analyzing…" : "Analyze"}
        </button>

        {error && (
          <div className="err">
            {error}
            {upgrade && (
              <>
                <br />
                <a className="upgrade" href="https://www.aicoachingsolutions.net/pricing">
                  See plans →
                </a>
              </>
            )}
          </div>
        )}
      </form>

      {result && session && (
        <section className="result">
          <h2>Mechanics — Root Cause</h2>
          <p>{result.mechanics}</p>
          <h2>Timing</h2>
          <p>{result.timing}</p>
          <h2>Coaching Cues</h2>
          <ul className="cues">
            {result.cues.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
          <h2>Next Focus</h2>
          <p>{result.nextFocus}</p>
          <h2>Recommended Drill</h2>
          <p>{result.drill}</p>

          {/* Delivery — email for everyone (lead capture), PDF for Pro */}
          <div className="card" style={{ marginTop: 28 }}>
            <label>Email this breakdown to yourself</label>
            <div className="row">
              <div style={{ flex: 2 }}>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
              <div>
                <button
                  type="button"
                  className="btn"
                  style={{ marginTop: 0 }}
                  onClick={onEmail}
                  disabled={emailBusy || !email}
                >
                  {emailBusy ? "Sending…" : "Email it"}
                </button>
              </div>
            </div>

            {tier === "pro" ? (
              <button
                type="button"
                className="btn"
                style={{ background: "transparent", color: "var(--gold)", border: "1px solid var(--gold)" }}
                onClick={onPdf}
                disabled={pdfBusy}
              >
                {pdfBusy ? "Building PDF…" : "Download branded PDF"}
              </button>
            ) : (
              <p className="meta">
                Want a downloadable, branded PDF?{" "}
                <a className="upgrade" href="https://www.aicoachingsolutions.net/pricing">
                  Upgrade to Pro →
                </a>
              </p>
            )}

            {emailMsg && <div className="meta">{emailMsg}</div>}
          </div>

          <p className="meta">
            <span className="badge">{tier}</span> AI-assisted · not a substitute for in-person
            coaching or medical advice.
          </p>
        </section>
      )}
    </main>
  );
}
