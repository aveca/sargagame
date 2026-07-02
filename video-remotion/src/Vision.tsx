// « Le Veilleur » — vidéo de vision de marque (manifeste, pas un brief data-driven).
// Même recette visuelle que Brief.tsx (Anton, fondus, sous-titres, nappe de vagues)
// mais fond golden-hour + glyphe Veilleur (réutilisé de public/a-propos/index.html)
// au lieu du chrome "wordmark + LIVE SATELLITE" propre au brief quotidien.
// Scènes fournies par scripts/video/make-vision.cjs (script figé par panel adverse).
import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { loadFont } from "@remotion/google-fonts/Anton";

const { fontFamily: ANTON } = loadFont();
const INK = "#0A1714";

export type Cue = { startF: number; endF: number; text: string };
export type Scene = {
  id: string;
  type: "card" | "photo";
  durF: number;
  voice: string | null;
  img: string | null;
  dark?: boolean;
  glyph?: boolean;
  overlay?: { overline?: string; title?: string; sub?: string };
  card?: { overline?: string; title?: string; sub?: string };
};
export type VisionProps = {
  scenes: Scene[];
  cues: Cue[];
};

const FADE_F = 11; // ≈0,35 s à 30 fps — mêmes fondus que Brief.tsx

const Lines: React.FC<{ text?: string }> = ({ text }) => (
  <>
    {String(text || "")
      .split("\n")
      .map((l, i) => (
        <div key={i}>{l}</div>
      ))}
  </>
);

// Fond golden-hour (ciel + mer), tokens identiques à design/proto-veilleur-clip*.html
const SkyBg: React.FC = () => (
  <svg
    viewBox="0 0 1080 1920"
    width="100%"
    height="100%"
    style={{ position: "absolute", inset: 0 }}
    preserveAspectRatio="xMidYMid slice"
  >
    <defs>
      <linearGradient id="vSky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#0B2230" />
        <stop offset=".42" stopColor="#155A5A" />
        <stop offset=".74" stopColor="#C97E3A" />
        <stop offset="1" stopColor="#F2B05E" />
      </linearGradient>
      <linearGradient id="vSea" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#1A5852" />
        <stop offset=".55" stopColor="#0F3B34" />
        <stop offset="1" stopColor="#08251F" />
      </linearGradient>
      <radialGradient id="vSun" cx="74%" cy="26%" r="46%">
        <stop offset="0" stopColor="#FFF6E0" stopOpacity=".9" />
        <stop offset=".5" stopColor="#FFD884" stopOpacity=".5" />
        <stop offset="1" stopColor="#F2B05E" stopOpacity="0" />
      </radialGradient>
    </defs>
    <rect x="0" y="0" width="1080" height="1180" fill="url(#vSky)" />
    <rect x="0" y="0" width="1080" height="1180" fill="url(#vSun)" />
    <rect x="0" y="1120" width="1080" height="800" fill="url(#vSea)" />
  </svg>
);

// Glyphe Veilleur statique (porté de public/a-propos/index.html #veilleur-ap),
// respiration douce en scale — jamais d'interaction (vidéo exportée).
const VeilleurGlyph: React.FC<{ size?: number }> = ({ size = 260 }) => {
  const frame = useCurrentFrame();
  const breathe = 1 + Math.sin(frame / 40) * 0.035;
  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      style={{ transform: `scale(${breathe})`, filter: "drop-shadow(0 8px 30px rgba(0,0,0,.35))" }}
    >
      <defs>
        <radialGradient id="vPhalo" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#FFE6A8" stopOpacity=".6" />
          <stop offset="1" stopColor="#FFE6A8" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g transform="translate(60 60) scale(1.1)">
        <circle cx="0" cy="0" r="42" fill="url(#vPhalo)" />
        <rect x="-58" y="-6" width="34" height="20" rx="3" fill="#163a4f" transform="rotate(-8 -41 4)" />
        <rect x="24" y="-6" width="34" height="20" rx="3" fill="#163a4f" transform="rotate(8 41 4)" />
        <path
          d="M0 -22 C14 -22 22 -14 22 2 C22 18 14 30 0 30 C-14 30 -22 18 -22 2 C-22 -14 -14 -22 0 -22 Z"
          fill="#102622"
          stroke="#FFD884"
          strokeWidth="1.1"
          strokeOpacity=".5"
        />
        <circle cx="0" cy="4" r="15" fill="#0d3a39" />
        <circle cx="0" cy="4" r="15" fill="none" stroke="#E8A800" strokeWidth="2.4" />
        <ellipse cx="0" cy="9" rx="15" ry="9" fill="#102622" />
        <circle cx="2" cy="3" r="5.4" fill="#0a3a39" />
        <circle cx="0.5" cy="1.2" r="2" fill="#cff4ff" />
        <line x1="0" y1="-22" x2="0" y2="-34" stroke="#0e2622" strokeWidth="2.4" />
        <circle cx="0" cy="-36" r="3.4" fill="#22C55E" />
      </g>
    </svg>
  );
};

const PhotoScene: React.FC<{ s: Scene; zoomIn: boolean }> = ({ s, zoomIn }) => {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [0, s.durF], zoomIn ? [1, 1.16] : [1.16, 1], {
    extrapolateRight: "clamp",
  });
  const o = s.overlay || {};
  return (
    <AbsoluteFill style={{ background: INK, overflow: "hidden" }}>
      <Img
        src={staticFile(s.img!)}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "center 38%",
          transform: `scale(${scale})`,
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 420,
          background: "linear-gradient(180deg,rgba(10,23,20,.55),rgba(10,23,20,0))",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 1150,
          background:
            "linear-gradient(180deg,rgba(10,23,20,0),rgba(10,23,20,.58) 38%,rgba(10,23,20,.95) 78%)",
        }}
      />
      {s.dark ? <AbsoluteFill style={{ background: "rgba(10,23,20,.34)" }} /> : null}
      <div style={{ position: "absolute", left: 64, right: 64, bottom: 0, paddingBottom: 430, fontFamily: "Segoe UI, sans-serif" }}>
        {o.overline ? (
          <div
            style={{
              fontSize: 34,
              fontWeight: 700,
              letterSpacing: ".16em",
              color: "rgba(255,255,255,.75)",
              marginBottom: 18,
              textTransform: "uppercase",
            }}
          >
            {o.overline}
          </div>
        ) : null}
        <div
          style={{
            fontFamily: ANTON,
            fontSize: 132,
            lineHeight: 0.98,
            color: "#fff",
            textTransform: "uppercase",
            letterSpacing: ".01em",
            textShadow: "0 4px 40px rgba(0,0,0,.45)",
            marginBottom: 22,
          }}
        >
          <Lines text={o.title} />
        </div>
        {o.sub ? (
          <div style={{ fontSize: 32, color: "rgba(255,255,255,.78)", maxWidth: 880 }}>{o.sub}</div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

const CardScene: React.FC<{ s: Scene }> = ({ s }) => {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [0, s.durF], [1, 1.045], { extrapolateRight: "clamp" });
  const c = s.card || {};
  return (
    <AbsoluteFill style={{ background: INK, overflow: "hidden" }}>
      <SkyBg />
      <AbsoluteFill style={{ background: "rgba(6,20,15,.22)" }} />
      <AbsoluteFill style={{ transform: `scale(${scale})` }}>
        {s.glyph ? (
          <div style={{ position: "absolute", top: 190, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
            <VeilleurGlyph />
          </div>
        ) : null}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            justifyContent: s.glyph ? "flex-end" : "center",
            alignItems: "flex-start",
            padding: s.glyph ? "0 64px 420px" : "0 64px",
            fontFamily: "Segoe UI, sans-serif",
          }}
        >
          {c.overline ? (
            <div
              style={{
                fontSize: 34,
                fontWeight: 700,
                letterSpacing: ".16em",
                color: "rgba(255,255,255,.78)",
                marginBottom: 18,
                textTransform: "uppercase",
                textShadow: "0 2px 18px rgba(0,0,0,.35)",
              }}
            >
              {c.overline}
            </div>
          ) : null}
          <div
            style={{
              fontFamily: ANTON,
              fontSize: 132,
              lineHeight: 0.98,
              color: "#fff",
              textTransform: "uppercase",
              letterSpacing: ".01em",
              textShadow: "0 4px 34px rgba(0,0,0,.4)",
            }}
          >
            <Lines text={c.title} />
          </div>
          {c.sub ? (
            <div
              style={{
                fontSize: 34,
                color: "rgba(255,255,255,.72)",
                marginTop: 24,
                maxWidth: 880,
                textShadow: "0 2px 18px rgba(0,0,0,.35)",
              }}
            >
              {c.sub}
            </div>
          ) : null}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const SceneFade: React.FC<{ durF: number; children: React.ReactNode }> = ({ durF, children }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(
    frame,
    [0, FADE_F, Math.max(FADE_F + 1, durF - FADE_F), durF],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  return <AbsoluteFill style={{ opacity, background: INK }}>{children}</AbsoluteFill>;
};

const Captions: React.FC<{ cues: Cue[] }> = ({ cues }) => {
  const frame = useCurrentFrame();
  const cue = cues.find((c) => frame >= c.startF && frame < c.endF);
  if (!cue) return null;
  return (
    <div
      style={{
        position: "absolute",
        bottom: 200,
        left: 50,
        right: 50,
        textAlign: "center",
        fontFamily: "Segoe UI, sans-serif",
        fontWeight: 900,
        fontSize: 58,
        lineHeight: 1.2,
        color: "#fff",
        textShadow: "0 0 14px rgba(0,0,0,.75), 0 3px 6px rgba(0,0,0,.85), 0 0 3px rgba(0,0,0,.9)",
      }}
    >
      {cue.text}
    </div>
  );
};

export const Vision: React.FC<VisionProps> = ({ scenes, cues }) => {
  const { durationInFrames } = useVideoConfig();
  let from = 0;
  const seqs = scenes.map((s, i) => {
    const el = (
      <Sequence key={s.id} from={from} durationInFrames={s.durF} name={s.id}>
        <SceneFade durF={s.durF}>
          {s.type === "card" ? <CardScene s={s} /> : <PhotoScene s={s} zoomIn={i % 2 === 0} />}
        </SceneFade>
        {s.voice ? <Audio src={staticFile(s.voice)} /> : null}
      </Sequence>
    );
    from += s.durF;
    return el;
  });
  return (
    <AbsoluteFill style={{ background: INK }}>
      {seqs}
      <Audio
        src={staticFile("waves.mp3")}
        volume={(f) =>
          interpolate(f, [0, 15, durationInFrames - 20, durationInFrames], [0, 0.3, 0.3, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })
        }
      />
      <Captions cues={cues} />
    </AbsoluteFill>
  );
};
