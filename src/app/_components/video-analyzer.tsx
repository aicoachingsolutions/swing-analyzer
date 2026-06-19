"use client";

import { useRef, useState } from "react";
import { BuyOptions } from "./buy-options";

type FrameAnalysis = {
  index: number;
  phase: string;
  observation: string;
  isKeyFault: boolean;
  calloutLabel: string;
  region: { x: number; y: number };
};
type VideoResult = {
  frames: FrameAnalysis[];
  angleNote: string;
  mechanics: string;
  timing: string;
  cues: string[];
  nextFocus: string;
  drill: string;
  metrics: { primaryFault: string; faultCategory: string; severity: number; confidence: number };
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

const FRAME_COUNT = 6;
const MAX_BYTES = 50 * 1024 * 1024; // 50 MB
const PHASE_LABEL: Record<string, string> = {
  load: "Load",
  stride: "Stride",
  contact: "Contact",
  finish: "Finish",
  other: "Frame",
};

/** Pull N evenly-spaced frames from a video file, client-side, downscaled to JPEG. */
async function extractFrames(file: File, count: number): Promise<string[]> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  (video as HTMLVideoElement & { playsInline: boolean }).playsInline = true;
  video.src = url;

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("Could not read that video file."));
    });

    const duration = video.duration;
    if (!duration || !isFinite(duration)) {
      throw new Error("Could not read the video length. Try a different clip.");
    }

    const maxW = 640;
    const scale = video.videoWidth > maxW ? maxW / video.videoWidth : 1;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Your browser blocked frame capture.");

    const seek = (t: number) =>
      new Promise<void>((resolve) => {
        const onSeeked = () => {
          video.removeEventListener("seeked", onSeeked);
          resolve();
        };
        video.addEventListener("seeked", onSeeked);
        video.currentTime = Math.min(Math.max(t, 0), duration - 0.01);
      });

    const frames: string[] = [];
    for (let i = 0; i < count; i++) {
      // sample at the middle of each even slice (avoids black first/last frames)
      await seek(duration * ((i + 0.5) / count));
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      frames.push(canvas.toDataURL("image/jpeg", 0.7));
    }
    return frames;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function VideoAnalyzer() {
  const [sport, setSport] = useState("baseball");
  const [motion, setMotion] = useState("swing");
  const [handedness, setHandedness] = useState("");
  const [ageGroup, setAgeGroup] = useState("");
  const [skillLevel, setSkillLevel] = useState("");
  const [note, setNote] = useState("");

  const [frames, setFrames] = useState<string[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cta, setCta] = useState<null | "signup" | "upgrade">(null);
  const [result, setResult] = useState<VideoResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const motions = MOTIONS[sport] ?? [{ value: "swing", label: "Swing" }];

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setCta(null);
    setResult(null);
    setFrames([]);

    if (!file.type.startsWith("video/")) {
      setError("Please choose a video file (a short clip of the full swing).");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("That clip is over 50 MB. Trim it to ~5–15 seconds and try again.");
      return;
    }

    setExtracting(true);
    try {
      const grabbed = await extractFrames(file, FRAME_COUNT);
      setFrames(grabbed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that video.");
    } finally {
      setExtracting(false);
    }
  }

  async function onAnalyze() {
    if (frames.length < 3) return;
    setAnalyzing(true);
    setError(null);
    setCta(null);
    setResult(null);
    try {
      const res = await fetch("/api/analyze-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sport,
          motion,
          handedness: handedness || undefined,
          ageGroup,
          skillLevel,
          mainIssue: note,
          frames,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        if (data.signup) setCta("signup");
        else if (data.upgrade) setCta("upgrade");
      } else {
        setResult(data.result as VideoResult);
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setAnalyzing(false);
    }
  }

  const keyFrame = result?.frames.find((f) => f.isKeyFault) ?? result?.frames[0];

  return (
    <div>
      <form className="card" onSubmit={(e) => e.preventDefault()}>
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

        <label>Upload a clip (full swing, face-on or down-the-line)</label>
        <input ref={fileRef} type="file" accept="video/*" onChange={onFile} />
        <p className="meta" style={{ marginTop: 8 }}>
          Film the whole swing, ~5–15 seconds, steady camera. Face-on shows rotation; down-the-line
          shows swing plane. We pull {FRAME_COUNT} key frames in your browser — your video never
          leaves your device.
        </p>

        <label>Anything you&apos;re seeing? (optional)</label>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. rolls over on inside pitches"
          maxLength={600}
        />

        {extracting && <p className="meta">Pulling key frames…</p>}

        {frames.length > 0 && (
          <>
            <label>These are the moments we&apos;ll analyze:</label>
            <div style={frameGrid}>
              {frames.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={src} alt={`Frame ${i + 1}`} style={thumb} />
              ))}
            </div>
            <button className="btn" type="button" onClick={onAnalyze} disabled={analyzing}>
              {analyzing ? "Analyzing the swing…" : "Analyze this swing"}
            </button>
          </>
        )}

        {error && (
          <div className="err">
            {error}
            {cta === "signup" && (
              <>
                <br />
                <a className="upgrade" href="https://app.aicoachingsolutions.net/login">
                  Create a free account →
                </a>
              </>
            )}
          </div>
        )}

        {cta === "upgrade" && <BuyOptions />}
      </form>

      {result && keyFrame && (
        <section className="result">
          {/* PROOF OF VISION — the money frame, annotated */}
          <h2>What the AI Saw</h2>
          <div style={moneyWrap}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={frames[keyFrame.index]} alt="Key fault frame" style={moneyImg} />
            <div
              style={{
                ...marker,
                left: `${Math.round(keyFrame.region.x * 100)}%`,
                top: `${Math.round(keyFrame.region.y * 100)}%`,
              }}
            />
            {keyFrame.calloutLabel && (
              <div
                style={{
                  ...calloutBadge,
                  left: `${Math.round(keyFrame.region.x * 100)}%`,
                  top: `${Math.round(keyFrame.region.y * 100)}%`,
                }}
              >
                {keyFrame.calloutLabel}
              </div>
            )}
          </div>
          <p className="meta">
            {PHASE_LABEL[keyFrame.phase] ?? "Key frame"} — {keyFrame.observation}
          </p>
          {result.angleNote && (
            <p className="meta" style={{ fontStyle: "italic" }}>
              {result.angleNote}
            </p>
          )}

          {/* Frame-by-frame proof strip */}
          <h2>Frame-by-Frame</h2>
          <div style={proofList}>
            {result.frames.map((f) => (
              <div key={f.index} style={proofRow}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={frames[f.index]}
                  alt={`${f.phase} frame`}
                  style={{ ...thumb, outline: f.isKeyFault ? "2px solid var(--gold)" : "none" }}
                />
                <div>
                  <span className="badge">{PHASE_LABEL[f.phase] ?? "Frame"}</span>
                  <p style={{ margin: "6px 0 0", fontSize: "0.92rem" }}>{f.observation}</p>
                </div>
              </div>
            ))}
          </div>

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

          <p className="meta">
            <span className="badge">video</span> AI-assisted from your clip · not a substitute for
            in-person coaching or medical advice.
          </p>
        </section>
      )}
    </div>
  );
}

const frameGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))",
  gap: 8,
  marginTop: 8,
};
const thumb: React.CSSProperties = {
  width: "100%",
  aspectRatio: "9 / 16",
  objectFit: "cover",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "#000",
};
const moneyWrap: React.CSSProperties = { position: "relative", display: "inline-block", maxWidth: "100%" };
const moneyImg: React.CSSProperties = {
  maxWidth: "100%",
  borderRadius: 10,
  border: "1px solid var(--border)",
  display: "block",
};
const marker: React.CSSProperties = {
  position: "absolute",
  width: 34,
  height: 34,
  marginLeft: -17,
  marginTop: -17,
  borderRadius: "50%",
  border: "3px solid var(--gold)",
  boxShadow: "0 0 0 2px rgba(0,0,0,0.5)",
  pointerEvents: "none",
};
const calloutBadge: React.CSSProperties = {
  position: "absolute",
  transform: "translate(20px, -34px)",
  background: "var(--gold)",
  color: "var(--deep-navy)",
  fontWeight: 800,
  fontSize: "0.72rem",
  padding: "3px 8px",
  borderRadius: 6,
  whiteSpace: "nowrap",
  pointerEvents: "none",
};
const proofList: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 12 };
const proofRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "84px 1fr",
  gap: 12,
  alignItems: "start",
};
