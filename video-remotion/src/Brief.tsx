// « Brief plage » quotidien — composition Remotion (remplace l'assemblage
// ffmpeg/zoompan/calques-Playwright du v1 ; storyboard + voix edge-tts
// inchangés, fournis en props par scripts/video/make-brief-remotion.cjs).
// Aucun chiffre inventé : tout vient du storyboard data-driven.
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
const GOLD = "#FFC72C";

export type Cue = { startF: number; endF: number; text: string };
export type Scene = {
  id: string;
  type: "card" | "photo";
  durF: number;
  voice: string | null;
  img: string | null;
  chapter?: string | null;
  dark?: boolean;
  overlay?: {
    overline?: string;
    title?: string;
    pill?: string;
    pillColor?: string;
    sub?: string;
  };
  card?: { overline?: string; title?: string; sub?: string };
};
export type BriefProps = {
  wordmark: string;
  scenes: Scene[];
  cues: Cue[];
};

const FADE_F = 11; // ≈0,35 s à 30 fps — mêmes fondus que le v1

const Lines: React.FC<{ text?: string }> = ({ text }) => (
  <>
    {String(text || "")
      .split("\n")
      .map((l, i) => (
        <div key={i}>{l}</div>
      ))}
  </>
);

const Chrome: React.FC<{ wordmark: string; chapter?: string | null }> = ({
  wordmark,
  chapter,
}) => (
  <>
    <div
      style={{
        position: "absolute",
        top: 54,
        left: 0,
        right: 0,
        textAlign: "center",
        fontFamily: ANTON,
        fontSize: 30,
        letterSpacing: ".18em",
        color: "#fff",
        opacity: 0.92,
      }}
    >
      {wordmark}
    </div>
    <div
      style={{
        position: "absolute",
        top: 118,
        left: 0,
        right: 0,
        textAlign: "center",
        fontSize: 24,
        fontWeight: 700,
        letterSpacing: ".08em",
        color: "#22C55E",
        fontFamily: "Segoe UI, sans-serif",
      }}
    >
      ● LIVE · SATELLITE COPERNICUS
    </div>
    {chapter ? (
      <div
        style={{
          position: "absolute",
          top: 200,
          left: 64,
          fontFamily: ANTON,
          fontSize: 34,
          letterSpacing: ".14em",
          color: GOLD,
          border: "3px solid rgba(255,199,44,.55)",
          borderRadius: 18,
          padding: "14px 26px",
          background: "rgba(10,23,20,.45)",
        }}
      >
        {chapter}
      </div>
    ) : null}
  </>
);

const PhotoScene: React.FC<{ s: Scene; zoomIn: boolean; wordmark: string }> = ({
  s,
  zoomIn,
  wordmark,
}) => {
  const frame = useCurrentFrame();
  // Ken Burns : zoom 1→1,16 (ou l'inverse), léger cadrage haut comme le v1
  const scale = interpolate(
    frame,
    [0, s.durF],
    zoomIn ? [1, 1.16] : [1.16, 1],
    { extrapolateRight: "clamp" },
  );
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
          background:
            "linear-gradient(180deg,rgba(10,23,20,.62),rgba(10,23,20,0))",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 1100,
          background:
            "linear-gradient(180deg,rgba(10,23,20,0),rgba(10,23,20,.55) 38%,rgba(10,23,20,.94) 78%)",
        }}
      />
      {s.dark ? (
        <AbsoluteFill style={{ background: "rgba(10,23,20,.30)" }} />
      ) : null}
      <Chrome wordmark={wordmark} chapter={s.chapter} />
      <div
        style={{
          position: "absolute",
          left: 64,
          right: 64,
          bottom: 0,
          paddingBottom: 430,
          fontFamily: "Segoe UI, sans-serif",
        }}
      >
        <div
          style={{
            fontSize: 34,
            fontWeight: 700,
            letterSpacing: ".16em",
            color: "rgba(255,255,255,.72)",
            marginBottom: 18,
            textTransform: "uppercase",
          }}
        >
          {o.overline || ""}
        </div>
        <div
          style={{
            fontFamily: ANTON,
            fontSize: 148,
            lineHeight: 0.96,
            color: "#fff",
            textTransform: "uppercase",
            letterSpacing: ".01em",
            textShadow: "0 4px 40px rgba(0,0,0,.45)",
            marginBottom: 30,
          }}
        >
          <Lines text={o.title} />
        </div>
        {o.pill ? (
          <div
            style={{
              display: "inline-block",
              fontWeight: 800,
              fontSize: 44,
              letterSpacing: ".02em",
              color: INK,
              padding: "18px 36px",
              borderRadius: 999,
              marginBottom: 22,
              background: o.pillColor || GOLD,
            }}
          >
            {o.pill}
          </div>
        ) : null}
        {o.sub ? (
          <div style={{ fontSize: 34, color: "rgba(255,255,255,.75)" }}>
            {o.sub}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

const CardScene: React.FC<{ s: Scene; wordmark: string }> = ({
  s,
  wordmark,
}) => {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [0, s.durF], [1, 1.05], {
    extrapolateRight: "clamp",
  });
  const c = s.card || {};
  return (
    <AbsoluteFill style={{ background: INK, overflow: "hidden" }}>
      <AbsoluteFill style={{ transform: `scale(${scale})` }}>
        <Chrome wordmark={wordmark} chapter={s.chapter} />
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "flex-start",
            padding: "0 64px",
            fontFamily: "Segoe UI, sans-serif",
          }}
        >
          <div
            style={{
              fontSize: 34,
              fontWeight: 700,
              letterSpacing: ".16em",
              color: "rgba(255,255,255,.72)",
              marginBottom: 18,
              textTransform: "uppercase",
            }}
          >
            {c.overline || ""}
          </div>
          <div
            style={{
              fontFamily: ANTON,
              fontSize: 148,
              lineHeight: 0.96,
              color: "#fff",
              textTransform: "uppercase",
              letterSpacing: ".01em",
            }}
          >
            <Lines text={c.title} />
          </div>
          {c.sub ? (
            <div
              style={{
                fontSize: 36,
                color: "rgba(255,255,255,.65)",
                marginTop: 26,
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

const SceneFade: React.FC<{ durF: number; children: React.ReactNode }> = ({
  durF,
  children,
}) => {
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
        fontSize: 62,
        lineHeight: 1.18,
        color: "#fff",
        textShadow:
          "0 0 14px rgba(0,0,0,.75), 0 3px 6px rgba(0,0,0,.85), 0 0 3px rgba(0,0,0,.9)",
      }}
    >
      {cue.text}
    </div>
  );
};

export const Brief: React.FC<BriefProps> = ({ wordmark, scenes, cues }) => {
  const { durationInFrames } = useVideoConfig();
  let from = 0;
  const seqs = scenes.map((s, i) => {
    const el = (
      <Sequence key={s.id} from={from} durationInFrames={s.durF} name={s.id}>
        <SceneFade durF={s.durF}>
          {s.type === "card" ? (
            <CardScene s={s} wordmark={wordmark} />
          ) : (
            <PhotoScene s={s} zoomIn={i % 2 === 0} wordmark={wordmark} />
          )}
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
      {/* Nappe de vagues — mixée bas, coupée net à la fin par durationInFrames */}
      <Audio
        src={staticFile("waves.mp3")}
        volume={(f) =>
          interpolate(
            f,
            [0, 15, durationInFrames - 20, durationInFrames],
            [0, 0.3, 0.3, 0],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          )
        }
      />
      <Captions cues={cues} />
    </AbsoluteFill>
  );
};
