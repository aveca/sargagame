import React from "react";
import {
  AbsoluteFill,
  Sequence,
  Img,
  OffthreadVideo,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  staticFile,
} from "remotion";
import { anton, bangers } from "./fonts";
import { Halftone, Starburst, ComicText } from "./primitives";
import { VeilleurReel } from "./VeilleurReel";
import { BgReel } from "./BgReel";
import tour from "./tour.json";

/* ============================================================================
 * TourVideo — a CONFIG-DRIVEN long-form "Exploration" / explainer engine.
 *
 * Reads src/tour.json (an array of CHAPTER objects) and renders each chapter
 * back-to-back as a <Sequence>. Length scales purely by editing the JSON:
 * a 1-min highlight or a 30-min deep tour come from the SAME file — just add
 * chapters / bump each `seconds`.
 *
 * Landscape 1920x1080 @ 30fps. Brand = "LE VEILLEUR · COMICS GROUP":
 * golden-hour ocean + comic/BD (Anton / Bangers), the sonde mascot, halftone.
 *
 * Chapter types: intro · section · caption · image · screencap · reel · outro.
 * ==========================================================================*/

const FPS = 30;
const W = 1920;
const H = 1080;
const DEFAULT_SECONDS = 4;
const XFADE = 14; // cross-fade overlap (frames) between chapters

/* --------------------------------------------------------------- palette
 * "Le Veilleur" golden-hour ocean. Kept LOCAL (do NOT edit theme.ts). */
const C = {
  sky3: "#F2B05E",
  glint: "#FFD884",
  sky2: "#C97E3A",
  seaT: "#1A5852",
  sky1: "#155A5A",
  sky0: "#0B2230",
  abyss: "#020A12",
  gold: "#E8A800",
  goldBrand: "#FFC72C",
  teal: "#009E8E",
  tealL: "#1EC8B0",
  green: "#22C55E",
  red: "#FF3B5C",
  paper: "#FDFCF7",
  ink: "#0D0D0F",
};

const ACCENTS: Record<string, string> = {
  gold: C.goldBrand,
  green: C.green,
  red: C.red,
  teal: C.tealL,
};

const shadow = "0 2px 20px rgba(2,10,18,0.75), 0 1px 3px rgba(2,10,18,0.9)";

/* ---------------------------------------------------------------- types */
type Chapter = {
  type: string;
  seconds?: number;
  title?: string;
  subtitle?: string;
  label?: string;
  bullets?: string[];
  accent?: string;
  src?: string;
  caption?: string;
  kenburns?: string;
  cta?: string;
  name?: string;
};

const CHAPTERS = tour as Chapter[];

/* ============================================================================
 * Shared background — golden-hour vertical gradient + halftone + vignette.
 * Every text/section chapter sits on this so the whole film breathes ONE
 * brand universe. `sink` (0..1) darkens it toward the deep for variety.
 * ==========================================================================*/
const GoldenHourBg: React.FC<{ sink?: number; drift?: number }> = ({
  sink = 0,
  drift = 0.1,
}) => {
  const frame = useCurrentFrame();
  const rays = [420, 900, 1360, 1760];
  return (
    <AbsoluteFill>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
        <defs>
          <linearGradient id="tv-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={C.sky3} />
            <stop offset="0.16" stopColor={C.glint} />
            <stop offset="0.34" stopColor={C.sky2} />
            <stop offset="0.56" stopColor={C.seaT} />
            <stop offset="0.78" stopColor={C.sky1} />
            <stop offset="1" stopColor={C.sky0} />
          </linearGradient>
          <radialGradient id="tv-sun" cx="0.8" cy="0.18" r="0.6">
            <stop offset="0" stopColor={C.glint} stopOpacity={0.7 * (1 - sink)} />
            <stop offset="0.45" stopColor={C.gold} stopOpacity={0.22 * (1 - sink)} />
            <stop offset="1" stopColor={C.gold} stopOpacity="0" />
          </radialGradient>
          <radialGradient id="tv-vig" cx="0.5" cy="0.5" r="0.75">
            <stop offset="0.55" stopColor="#000000" stopOpacity="0" />
            <stop offset="1" stopColor="#000000" stopOpacity="0.4" />
          </radialGradient>
        </defs>
        <rect width={W} height={H} fill="url(#tv-sky)" />
        {sink > 0 && (
          <rect width={W} height={H} fill={C.abyss} opacity={sink * 0.5} />
        )}
        <rect width={W} height={H} fill="url(#tv-sun)" />
        {/* light rays fanning from the sun */}
        <g opacity={0.14 * (1 - sink)}>
          {rays.map((x, i) => {
            const sway = Math.sin(frame * 0.02 + i) * 24;
            return (
              <polygon
                key={i}
                points={`${1420},60 ${x + sway},${H} ${x + 130 + sway},${H}`}
                fill={C.glint}
              />
            );
          })}
        </g>
        {/* calm shimmering sea bands lower third */}
        {Array.from({ length: 6 }).map((_, i) => {
          const y = 660 + i * 62;
          const w = Math.sin(frame * 0.05 + i * 0.8) * 14;
          return (
            <path
              key={i}
              d={`M0 ${y} Q ${480 + w} ${y - 16} 960 ${y} T 1920 ${y}`}
              stroke={C.glint}
              strokeWidth={2}
              fill="none"
              opacity={interpolate(i, [0, 5], [0.24, 0.04])}
            />
          );
        })}
        <rect width={W} height={H} fill="url(#tv-vig)" />
      </svg>
      <Halftone color="#000" size={22} opacity={0.07} speed={drift * 0.4} />
    </AbsoluteFill>
  );
};

/* Bottom scrim so any caption / bullets read cleanly over imagery. */
const Scrim: React.FC<{ height?: number; strength?: number }> = ({
  height = 0.5,
  strength = 0.82,
}) => (
  <AbsoluteFill
    style={{
      background: `linear-gradient(to top, rgba(4,10,18,${strength}) 0%, rgba(4,10,18,${
        strength * 0.55
      }) ${height * 0.5 * 100}%, transparent ${height * 100}%)`,
    }}
  />
);

/* --------------------------------------------------- entrance helpers */
const useEnter = (delay = 0, damping = 18) => {
  const frame = useCurrentFrame();
  return spring({ frame: frame - delay, fps: FPS, config: { damping, mass: 0.7 } });
};
const rise = (v: number, px = 26) => interpolate(v, [0, 1], [px, 0]);

/* ============================================================================
 * The sonde mascot lockup (compact SVG, reused by intro + outro).
 * ==========================================================================*/
const SondeLockup: React.FC<{ size?: number }> = ({ size = 300 }) => {
  const frame = useCurrentFrame();
  const breathe = Math.sin(frame * 0.05) * 6;
  const tilt = Math.sin(frame * 0.03) * 1.6;
  return (
    <svg width={size} height={size} viewBox="-260 -300 520 660" style={{ display: "block" }}>
      <g transform={`rotate(${tilt}) translate(0 ${breathe})`}>
        <circle r="200" fill={C.tealL} opacity="0.16" />
        <path d="M0 70 L-120 340 L120 340 Z" fill={C.glint} opacity="0.2" />
        {/* solar panels */}
        <g transform="rotate(-6)">
          <rect x="-232" y="-30" width="150" height="80" rx="8" fill="#123B57" stroke={C.ink} strokeWidth="8" />
          {[0, 1, 2].map((i) => (
            <line key={i} x1={-232 + 37 * (i + 1)} y1={-30} x2={-232 + 37 * (i + 1)} y2={50} stroke={C.ink} strokeWidth="4" />
          ))}
        </g>
        <g transform="rotate(6)">
          <rect x="82" y="-30" width="150" height="80" rx="8" fill="#123B57" stroke={C.ink} strokeWidth="8" />
          {[0, 1, 2].map((i) => (
            <line key={i} x1={82 + 37 * (i + 1)} y1={-30} x2={82 + 37 * (i + 1)} y2={50} stroke={C.ink} strokeWidth="4" />
          ))}
        </g>
        {/* body */}
        <path d="M0 -110 C74 -110 118 -70 118 0 C118 92 78 156 0 156 C-78 156 -118 92 -118 0 C-118 -70 -74 -110 0 -110 Z" fill="#16332e" stroke={C.ink} strokeWidth="10" />
        {/* lens */}
        <defs>
          <radialGradient id="tv-lens" cx="0.4" cy="0.32" r="0.8">
            <stop offset="0" stopColor="#CFF4FF" />
            <stop offset="0.5" stopColor="#16b9c9" />
            <stop offset="1" stopColor="#052b2b" />
          </radialGradient>
        </defs>
        <circle cx="0" cy="26" r="80" fill="url(#tv-lens)" stroke={C.ink} strokeWidth="10" />
        <circle cx="0" cy="26" r="80" fill="none" stroke={C.gold} strokeWidth="10" />
        <circle cx="0" cy="40" r="30" fill="#03100f" />
        <circle cx="-12" cy="14" r="12" fill="#fff7e2" />
        {/* antenna + green LIVE tip */}
        <line x1="0" y1="-110" x2="0" y2="-168" stroke={C.ink} strokeWidth="11" />
        <circle cx="0" cy="-176" r="17" fill={C.green} stroke={C.ink} strokeWidth="8" />
      </g>
    </svg>
  );
};

/* ============================================================================
 * CHAPTER RENDERERS
 * ==========================================================================*/

/* ---- intro — brand cold-open: starburst + logo lockup + mascot ---- */
const IntroChapter: React.FC<{ chapter: Chapter }> = ({ chapter }) => {
  const e = useEnter(6);
  const sub = useEnter(20, 22);
  return (
    <AbsoluteFill>
      <GoldenHourBg drift={0.2} />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", opacity: 0.9 }}>
        <div style={{ transform: "scale(1.5)" }}>
          <Starburst color={C.goldBrand} points={20} spin={0.15} scale={0.62} />
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        <div style={{ transform: `scale(${interpolate(e, [0, 1], [0.8, 1])})`, marginTop: -40 }}>
          <SondeLockup size={340} />
        </div>
        <div
          style={{
            fontFamily: anton,
            fontSize: 150,
            letterSpacing: 3,
            color: C.paper,
            textShadow: `7px 8px 0 ${C.ink}, ${shadow}`,
            WebkitTextStroke: `3px ${C.ink}`,
            marginTop: -10,
            transform: `translateY(${rise(e, 40)}px)`,
            opacity: interpolate(e, [0, 0.4], [0, 1], { extrapolateRight: "clamp" }),
          }}
        >
          {chapter.title || "LE VEILLEUR"}
        </div>
        {chapter.subtitle && (
          <div
            style={{
              fontFamily: bangers,
              fontSize: 52,
              letterSpacing: 2,
              color: C.goldBrand,
              textShadow: shadow,
              marginTop: 12,
              transform: `translateY(${rise(sub)}px)`,
              opacity: sub,
            }}
          >
            {chapter.subtitle}
          </div>
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* ---- section — chapter-divider title card ("Chapitre 2 · La carte") ---- */
const SectionChapter: React.FC<{ chapter: Chapter }> = ({ chapter }) => {
  const e = useEnter(4, 16);
  const t = useEnter(14, 18);
  return (
    <AbsoluteFill>
      <GoldenHourBg sink={0.28} drift={0.15} />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", flexDirection: "column" }}>
        {chapter.label && (
          <div
            style={{
              fontFamily: bangers,
              fontSize: 44,
              letterSpacing: 6,
              color: C.goldBrand,
              textShadow: shadow,
              opacity: e,
              transform: `translateY(${rise(e, -18)}px)`,
              marginBottom: 18,
            }}
          >
            {chapter.label.toUpperCase()}
          </div>
        )}
        <div style={{ opacity: t, transform: `translateY(${rise(t)}px)` }}>
          <ComicText
            text={(chapter.title || "").toUpperCase()}
            fontFamily={anton}
            size={130}
            color={C.paper}
            stroke={C.ink}
            from="bottom"
            stagger={2}
          />
        </div>
        <div
          style={{
            width: interpolate(t, [0, 1], [0, 340]),
            height: 8,
            background: C.goldBrand,
            borderRadius: 999,
            marginTop: 30,
            boxShadow: `4px 4px 0 ${C.ink}`,
          }}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* One bullet row — own component so its entrance hook lives at top level. */
const BulletRow: React.FC<{ text: string; index: number; accent: string }> = ({
  text,
  index,
  accent,
}) => {
  const be = useEnter(20 + index * 12, 20);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 26,
        opacity: be,
        transform: `translateX(${interpolate(be, [0, 1], [-40, 0])}px)`,
      }}
    >
      <div
        style={{
          flex: "none",
          marginTop: 14,
          width: 26,
          height: 26,
          background: accent,
          border: `4px solid ${C.ink}`,
          borderRadius: 6,
          transform: "rotate(8deg)",
          boxShadow: `3px 3px 0 ${C.ink}`,
        }}
      />
      <div
        style={{
          fontFamily: "system-ui, sans-serif",
          fontWeight: 600,
          fontSize: 46,
          lineHeight: 1.25,
          color: C.paper,
          textShadow: shadow,
          maxWidth: 1300,
        }}
      >
        {text}
      </div>
    </div>
  );
};

/* ---- caption — text/bullets over golden-hour+halftone (text exploration) ---- */
const CaptionChapter: React.FC<{ chapter: Chapter }> = ({ chapter }) => {
  const accent = ACCENTS[chapter.accent || "gold"] || C.goldBrand;
  const titleE = useEnter(4, 16);
  const bullets = chapter.bullets || [];
  return (
    <AbsoluteFill>
      <GoldenHourBg sink={0.12} drift={0.14} />
      <Scrim height={1} strength={0.5} />
      <AbsoluteFill
        style={{
          justifyContent: "center",
          padding: "0 150px",
          flexDirection: "column",
        }}
      >
        {/* accent kicker bar */}
        <div
          style={{
            width: interpolate(titleE, [0, 1], [0, 120]),
            height: 12,
            background: accent,
            borderRadius: 999,
            marginBottom: 28,
            boxShadow: `4px 4px 0 ${C.ink}`,
          }}
        />
        <div
          style={{
            fontFamily: anton,
            fontSize: 96,
            letterSpacing: 1,
            color: C.paper,
            textShadow: `5px 6px 0 ${C.ink}, ${shadow}`,
            lineHeight: 1.02,
            maxWidth: 1400,
            transform: `translateY(${rise(titleE, 34)}px)`,
            opacity: titleE,
          }}
        >
          {chapter.title}
        </div>
        <div style={{ marginTop: 54, display: "flex", flexDirection: "column", gap: 30 }}>
          {bullets.map((b, i) => (
            <BulletRow key={i} text={b} index={i} accent={accent} />
          ))}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* ---- Ken-Burns wrapper for full-bleed imagery/video ---- */
const kenBurns = (mode: string | undefined, p: number) => {
  // p goes 0..1 across the chapter.
  switch (mode) {
    case "out":
      return { scale: interpolate(p, [0, 1], [1.16, 1.0]), x: 0, y: interpolate(p, [0, 1], [-16, 10]) };
    case "left":
      return { scale: 1.14, x: interpolate(p, [0, 1], [40, -40]), y: 0 };
    case "right":
      return { scale: 1.14, x: interpolate(p, [0, 1], [-40, 40]), y: 0 };
    case "in":
    default:
      return { scale: interpolate(p, [0, 1], [1.0, 1.16]), x: 0, y: interpolate(p, [0, 1], [10, -16]) };
  }
};

/* Labelled brand panel shown when an asset src is missing/placeholder. */
const PlaceholderPanel: React.FC<{ label: string; caption?: string }> = ({ label, caption }) => (
  <AbsoluteFill>
    <GoldenHourBg sink={0.2} />
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: 120 }}>
      <div
        style={{
          border: `6px dashed ${C.goldBrand}`,
          borderRadius: 28,
          padding: "70px 90px",
          background: "rgba(4,14,22,0.55)",
          boxShadow: `12px 12px 0 rgba(0,0,0,0.35)`,
          textAlign: "center",
          maxWidth: 1500,
        }}
      >
        <div
          style={{
            fontFamily: bangers,
            fontSize: 40,
            letterSpacing: 4,
            color: C.goldBrand,
            marginBottom: 22,
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontFamily: anton,
            fontSize: 72,
            lineHeight: 1.08,
            color: C.paper,
            textShadow: shadow,
          }}
        >
          {caption || "APERÇU"}
        </div>
      </div>
    </AbsoluteFill>
  </AbsoluteFill>
);

const hasAsset = (src?: string) =>
  !!src && src.trim() !== "" && !/placeholder/i.test(src);

/* ---- image — full-bleed <Img> with slow Ken-Burns + caption + scrim ---- */
const ImageChapter: React.FC<{ chapter: Chapter; durationInFrames: number }> = ({
  chapter,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [0, durationInFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const capE = useEnter(8, 18);

  if (!hasAsset(chapter.src)) {
    return (
      <AbsoluteFill>
        <PlaceholderPanel label={`APERÇU : ${chapter.caption || ""}`} caption={chapter.caption} />
      </AbsoluteFill>
    );
  }

  const kb = kenBurns(chapter.kenburns, p);
  return (
    <AbsoluteFill style={{ backgroundColor: C.ink, overflow: "hidden" }}>
      <AbsoluteFill
        style={{ transform: `scale(${kb.scale}) translate(${kb.x}px, ${kb.y}px)` }}
      >
        <Img
          src={staticFile(chapter.src as string)}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </AbsoluteFill>
      <Scrim height={0.55} strength={0.85} />
      {chapter.caption && (
        <AbsoluteFill style={{ justifyContent: "flex-end", padding: "0 130px 110px" }}>
          <div
            style={{
              fontFamily: anton,
              fontSize: 74,
              lineHeight: 1.06,
              color: C.paper,
              textShadow: `4px 5px 0 ${C.ink}, ${shadow}`,
              maxWidth: 1500,
              opacity: capE,
              transform: `translateY(${rise(capE, 30)}px)`,
            }}
          >
            {chapter.caption}
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};

/* ---- screencap — embed a screen-recording via <OffthreadVideo> ---- */
const ScreencapChapter: React.FC<{ chapter: Chapter }> = ({ chapter }) => {
  const capE = useEnter(8, 18);
  if (!hasAsset(chapter.src)) {
    return (
      <AbsoluteFill>
        <PlaceholderPanel
          label={`CAPTURE ÉCRAN : ${chapter.caption || ""}`}
          caption={chapter.caption}
        />
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill style={{ backgroundColor: C.ink }}>
      <OffthreadVideo
        src={staticFile(chapter.src as string)}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
      <Scrim height={0.4} strength={0.8} />
      {chapter.caption && (
        <AbsoluteFill style={{ justifyContent: "flex-end", padding: "0 130px 110px" }}>
          <div
            style={{
              fontFamily: anton,
              fontSize: 68,
              lineHeight: 1.06,
              color: C.paper,
              textShadow: `4px 5px 0 ${C.ink}, ${shadow}`,
              maxWidth: 1500,
              opacity: capE,
            }}
          >
            {chapter.caption}
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};

/* ---- reel — embed an existing reel component, scaled to fill the frame ---- */
const ReelChapter: React.FC<{ chapter: Chapter }> = ({ chapter }) => {
  if (chapter.name === "BgReel") {
    // BgReel authored at 1280x720 (16:9) → scale to fill 1920x1080.
    const scale = W / 1280; // 1.5 → exactly 1920x1080
    return (
      <AbsoluteFill style={{ backgroundColor: C.ink, justifyContent: "center", alignItems: "center", overflow: "hidden" }}>
        <div style={{ width: 1280, height: 720, transform: `scale(${scale})`, transformOrigin: "center" }}>
          <BgReel />
        </div>
      </AbsoluteFill>
    );
  }
  // VeilleurReel authored at 900x900 (square) → center on golden-hour bg, no crop.
  return (
    <AbsoluteFill style={{ backgroundColor: C.abyss, justifyContent: "center", alignItems: "center", overflow: "hidden" }}>
      <div style={{ width: 900, height: 900, transform: `scale(${H / 900})`, transformOrigin: "center" }}>
        <VeilleurReel />
      </div>
    </AbsoluteFill>
  );
};

/* ---- outro — CTA lockup: mascot + gold button style ---- */
const OutroChapter: React.FC<{ chapter: Chapter }> = ({ chapter }) => {
  const e = useEnter(6, 16);
  const btn = useEnter(22, 14);
  return (
    <AbsoluteFill>
      <GoldenHourBg drift={0.18} />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", opacity: 0.8 }}>
        <div style={{ transform: "scale(1.3)" }}>
          <Starburst color={C.goldBrand} points={18} spin={0.12} scale={0.55} />
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", flexDirection: "column" }}>
        <div style={{ transform: `scale(${interpolate(e, [0, 1], [0.85, 1])})`, marginBottom: -8 }}>
          <SondeLockup size={280} />
        </div>
        <div
          style={{
            fontFamily: anton,
            fontSize: 92,
            letterSpacing: 1,
            color: C.paper,
            textShadow: `5px 6px 0 ${C.ink}, ${shadow}`,
            textAlign: "center",
            maxWidth: 1500,
            transform: `translateY(${rise(e, 30)}px)`,
            opacity: e,
          }}
        >
          {chapter.title}
        </div>
        {chapter.cta && (
          <div
            style={{
              marginTop: 40,
              background: C.goldBrand,
              color: C.ink,
              fontFamily: bangers,
              fontSize: 52,
              letterSpacing: 1,
              padding: "24px 60px",
              borderRadius: 999,
              border: `5px solid ${C.ink}`,
              boxShadow: `10px 10px 0 ${C.ink}`,
              transform: `scale(${interpolate(btn, [0, 1], [0.7, 1])})`,
              opacity: btn,
            }}
          >
            {chapter.cta} →
          </div>
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* ============================================================================
 * Dispatch a chapter to its renderer.
 * ==========================================================================*/
const RenderChapter: React.FC<{ chapter: Chapter; durationInFrames: number }> = ({
  chapter,
  durationInFrames,
}) => {
  switch (chapter.type) {
    case "intro":
      return <IntroChapter chapter={chapter} />;
    case "section":
      return <SectionChapter chapter={chapter} />;
    case "caption":
      return <CaptionChapter chapter={chapter} />;
    case "image":
      return <ImageChapter chapter={chapter} durationInFrames={durationInFrames} />;
    case "screencap":
      return <ScreencapChapter chapter={chapter} />;
    case "reel":
      return <ReelChapter chapter={chapter} />;
    case "outro":
      return <OutroChapter chapter={chapter} />;
    default:
      return (
        <AbsoluteFill>
          <PlaceholderPanel label={`TYPE INCONNU : ${chapter.type}`} caption={chapter.title} />
        </AbsoluteFill>
      );
  }
};

/* ============================================================================
 * Persistent brand chrome — wordmark top-left + chapter progress ticker.
 * Sits OVER everything, at low opacity, so the film always reads as ours.
 * ==========================================================================*/
const BrandChrome: React.FC<{ starts: number[]; total: number }> = ({ starts, total }) => {
  const frame = useCurrentFrame();
  // current chapter index from cumulative starts
  let idx = 0;
  for (let i = 0; i < starts.length; i++) {
    if (frame >= starts[i]) idx = i;
  }
  const progress = interpolate(frame, [0, total], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {/* wordmark top-left */}
      <div
        style={{
          position: "absolute",
          top: 42,
          left: 54,
          display: "flex",
          alignItems: "center",
          gap: 14,
          opacity: 0.9,
        }}
      >
        <div
          style={{
            width: 16,
            height: 16,
            borderRadius: "50%",
            background: C.green,
            boxShadow: `0 0 12px ${C.green}`,
            border: `2px solid ${C.ink}`,
          }}
        />
        <div
          style={{
            fontFamily: anton,
            fontSize: 30,
            letterSpacing: 3,
            color: C.paper,
            textShadow: "0 2px 8px rgba(0,0,0,0.8)",
          }}
        >
          LE VEILLEUR
        </div>
        <div
          style={{
            fontFamily: "system-ui, sans-serif",
            fontSize: 15,
            fontWeight: 700,
            letterSpacing: 2,
            color: C.goldBrand,
            textShadow: "0 2px 8px rgba(0,0,0,0.8)",
            marginTop: 4,
          }}
        >
          · COMICS GROUP
        </div>
      </div>

      {/* chapter counter top-right */}
      <div
        style={{
          position: "absolute",
          top: 46,
          right: 56,
          fontFamily: "system-ui, sans-serif",
          fontSize: 22,
          fontWeight: 700,
          letterSpacing: 2,
          color: C.paper,
          opacity: 0.72,
          textShadow: "0 2px 8px rgba(0,0,0,0.8)",
        }}
      >
        {String(idx + 1).padStart(2, "0")} / {String(starts.length).padStart(2, "0")}
      </div>

      {/* progress ticker along the very bottom */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          width: "100%",
          height: 6,
          background: "rgba(2,10,18,0.4)",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${progress * 100}%`,
            background: C.goldBrand,
            boxShadow: `0 0 10px ${C.goldBrand}`,
          }}
        />
      </div>
    </AbsoluteFill>
  );
};

/* ============================================================================
 * Duration bookkeeping — compute each chapter's frames from `seconds`.
 * Chapters overlap by XFADE so the fade cross-dissolves cleanly.
 * ==========================================================================*/
const chapterFrames = (ch: Chapter) =>
  Math.round((ch.seconds ?? DEFAULT_SECONDS) * FPS);

// Advance (with overlap) between consecutive chapter starts.
const STEP = (ch: Chapter) => chapterFrames(ch) - XFADE;

const STARTS: number[] = (() => {
  const s: number[] = [];
  let cur = 0;
  CHAPTERS.forEach((ch, i) => {
    s.push(cur);
    if (i < CHAPTERS.length - 1) cur += STEP(ch);
  });
  return s;
})();

// Total = last start + last chapter's full length.
export const TOUR_DURATION: number =
  STARTS[STARTS.length - 1] + chapterFrames(CHAPTERS[CHAPTERS.length - 1]);

/* ============================================================================
 * TourVideo — the composition. Renders every chapter as a Sequence with a
 * light opacity cross-fade at both ends, then the persistent brand chrome.
 * ==========================================================================*/
const FadeWrap: React.FC<{
  durationInFrames: number;
  isFirst: boolean;
  isLast: boolean;
  children: React.ReactNode;
}> = ({ durationInFrames, isFirst, isLast, children }) => {
  const frame = useCurrentFrame();
  const fadeIn = isFirst
    ? 1
    : interpolate(frame, [0, XFADE], [0, 1], { extrapolateRight: "clamp" });
  const fadeOut = isLast
    ? 1
    : interpolate(frame, [durationInFrames - XFADE, durationInFrames], [1, 0], {
        extrapolateLeft: "clamp",
      });
  return (
    <AbsoluteFill style={{ opacity: Math.min(fadeIn, fadeOut) }}>{children}</AbsoluteFill>
  );
};

export const TourVideo: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: C.abyss }}>
      {CHAPTERS.map((ch, i) => {
        const dur = chapterFrames(ch);
        return (
          <Sequence key={i} from={STARTS[i]} durationInFrames={dur} name={`${i + 1}·${ch.type}`}>
            <FadeWrap
              durationInFrames={dur}
              isFirst={i === 0}
              isLast={i === CHAPTERS.length - 1}
            >
              <RenderChapter chapter={ch} durationInFrames={dur} />
            </FadeWrap>
          </Sequence>
        );
      })}
      <BrandChrome starts={STARTS} total={TOUR_DURATION} />
    </AbsoluteFill>
  );
};
