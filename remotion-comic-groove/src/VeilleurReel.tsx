import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Sequence,
} from "remotion";
import { anton } from "./fonts";

/* ------------------------------------------------------------------ palette
 * "Le Veilleur" — golden-hour ocean, calm, cinematic, honest, insider.
 * Palette kept LOCAL (do NOT edit theme.ts). */
const C = {
  sky3: "#F2B05E",
  glint: "#FFD884",
  sky2: "#C97E3A",
  seaT: "#1A5852",
  sky1: "#155A5A",
  sky0: "#0B2230",
  abyss: "#020A12",
  gold: "#E8A800",
  goldL: "#FFC72C",
  teal: "#009E8E",
  tealL: "#1EC8B0",
  green: "#22C55E",
  paper: "#FDFCF7",
  ink: "#0D0D0D",
};

const SIZE = 900;
const CX = SIZE / 2;

/* Triangle wave 0->1->0 over the full duration so frame 0 ≈ last frame.
 * Uses a smooth cosine so the descent/resurface feels calm, not linear. */
const triangle = (frame: number, dur: number) =>
  (1 - Math.cos((frame / dur) * Math.PI * 2)) / 2;

/* Calm fade-in/hold/fade-out envelope for a text beat. */
const beat = (
  frame: number,
  start: number,
  end: number,
  fadeIn = 12,
  fadeOut = 12
) =>
  interpolate(
    frame,
    [start, start + fadeIn, end - fadeOut, end],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

/* --------------------------------------------------------------- the sonde */
const Sonde: React.FC<{ depth: number; breathe: number }> = ({
  depth,
  breathe,
}) => {
  // Drifts gently DOWN as depth increases, back up on resurface.
  const drift = interpolate(depth, [0, 1], [0, 74]);
  const y = 300 + drift + breathe;
  // Halo softens a touch in the deep.
  const haloOpacity = interpolate(depth, [0, 1], [0.28, 0.16]);
  const beamOpacity = interpolate(depth, [0, 1], [0.18, 0.34]);
  return (
    <g transform={`translate(${CX} ${y})`}>
      <circle r="120" fill={`rgba(30,200,176,${haloOpacity})`} />
      {/* downward sensor beam — it looks DOWN at the sea */}
      <polygon
        points="0,26 -66,240 66,240"
        fill={`rgba(255,216,132,${beamOpacity})`}
      />
      {/* solar panels */}
      <rect
        x="-86"
        y="-8"
        width="56"
        height="30"
        rx="3"
        fill="#1b4763"
        transform="rotate(-7 -58 7)"
      />
      <rect
        x="30"
        y="-8"
        width="56"
        height="30"
        rx="3"
        fill="#1b4763"
        transform="rotate(7 58 7)"
      />
      {/* body */}
      <path
        d="M0 -30 C20 -30 32 -20 32 0 C32 24 22 42 0 42 C-22 42 -32 24 -32 0 C-32 -20 -20 -30 0 -30 Z"
        fill="#102622"
        stroke={C.glint}
        strokeWidth="1.3"
      />
      {/* lens */}
      <circle cx="0" cy="8" r="22" fill="#16b9c9" />
      <circle cx="0" cy="8" r="22" fill="none" stroke={C.gold} strokeWidth="3" />
      <circle cx="0" cy="12" r="8" fill="#03100f" />
      <circle cx="-3" cy="9" r="2.8" fill="#fff7e2" />
      {/* antenna + green tip */}
      <line x1="0" y1="-30" x2="0" y2="-46" stroke="#0e2622" strokeWidth="3" />
      <circle cx="0" cy="-49" r="4.6" fill={C.green} />
    </g>
  );
};

/* ------------------------------------------------------------------ ocean */
const Ocean: React.FC<{ depth: number; frame: number }> = ({
  depth,
  frame,
}) => {
  // Overlay darkens with depth.
  const overlayOpacity = interpolate(depth, [0, 1], [0, 0.62]);
  // Light rays fade as we descend.
  const rayOpacity = interpolate(depth, [0, 1], [0.22, 0.02]);

  // A few slow-drifting plankton dots (teal). Deterministic positions.
  const plankton = React.useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => ({
        x: 90 + ((i * 137) % 720),
        baseY: 220 + ((i * 211) % 560),
        r: 2 + (i % 3),
        speed: 6 + (i % 5) * 2,
        phase: (i * 47) % 360,
      })),
    []
  );

  return (
    <AbsoluteFill>
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        style={{ display: "block" }}
      >
        <defs>
          <linearGradient id="vr-sea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={C.sky3} />
            <stop offset="0.14" stopColor={C.glint} />
            <stop offset="0.30" stopColor={C.sky2} />
            <stop offset="0.50" stopColor={C.seaT} />
            <stop offset="0.72" stopColor={C.sky1} />
            <stop offset="0.88" stopColor={C.sky0} />
            <stop offset="1" stopColor={C.abyss} />
          </linearGradient>
          <radialGradient id="vr-glow" cx="0.5" cy="0.16" r="0.6">
            <stop offset="0" stopColor={C.glint} stopOpacity="0.55" />
            <stop offset="1" stopColor={C.glint} stopOpacity="0" />
          </radialGradient>
          <filter id="vr-soft" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="7" />
          </filter>
        </defs>

        {/* golden-hour surface -> deep teal -> abyss */}
        <rect width={SIZE} height={SIZE} fill="url(#vr-sea)" />
        {/* warm glow at the surface */}
        <rect width={SIZE} height={SIZE} fill="url(#vr-glow)" />

        {/* faint light rays from the top */}
        <g opacity={rayOpacity}>
          <polygon points="300,0 340,0 250,900 150,900" fill={C.glint} />
          <polygon points="470,0 500,0 470,900 400,900" fill={C.glint} />
          <polygon points="620,0 655,0 720,900 600,900" fill={C.glint} />
        </g>

        {/* slow-drifting plankton */}
        <g>
          {plankton.map((p, i) => {
            const dy =
              p.baseY -
              Math.sin((frame / p.speed + p.phase) * 0.08) * 10 +
              depth * 24;
            const dx =
              p.x + Math.cos((frame / p.speed + p.phase) * 0.06) * 8;
            const op = interpolate(depth, [0, 1], [0.5, 0.85]);
            return (
              <circle
                key={i}
                cx={dx}
                cy={dy}
                r={p.r}
                fill={C.tealL}
                opacity={op}
              />
            );
          })}
        </g>

        {/* the sonde (satellite), passed depth + breathe from parent below */}
      </svg>

      {/* darkening overlay that follows depth */}
      <AbsoluteFill
        style={{ backgroundColor: C.abyss, opacity: overlayOpacity }}
      />
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------ text beats */
const rise = (v: number, px = 18) => interpolate(v, [0, 1], [px, 0]);

const shadow = "0 2px 18px rgba(2,10,18,0.75), 0 1px 3px rgba(2,10,18,0.9)";

/* --------------------------------------------------------------- the reel */
export const VeilleurReel: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // depth 0 -> 1 -> 0 across the whole clip (loops on the surface).
  const depth = triangle(frame, durationInFrames);

  // Gentle "breathe" for the sonde, ~7s sinus, a few px.
  const breathe = Math.sin((frame / durationInFrames) * Math.PI * 4) * 6;

  // Calm master entrance for the sonde.
  const enter = spring({ frame, fps, config: { damping: 200 } });
  const sondeScale = interpolate(enter, [0, 1], [0.92, 1]);

  /* ---- beat opacities ---- */
  const b1 = beat(frame, 10, 60); // wordmark
  const b2 = beat(frame, 60, 115); // measured / not guessed
  const b3 = beat(frame, 110, 165); // verdict chip
  const b4 = beat(frame, 160, 205); // your beach + pill

  return (
    <AbsoluteFill style={{ backgroundColor: C.abyss, fontFamily: "system-ui" }}>
      {/* Ocean backdrop (full-bleed) */}
      <Ocean depth={depth} frame={frame} />

      {/* The sonde, in its own centered SVG so it layers above the overlay */}
      <AbsoluteFill>
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          style={{
            display: "block",
            transform: `scale(${sondeScale})`,
            transformOrigin: "center 34%",
          }}
        >
          <Sonde depth={depth} breathe={breathe} />
        </svg>
      </AbsoluteFill>

      {/* ---------------- TEXT BEATS ---------------- */}

      {/* Beat 1 — wordmark */}
      <Sequence from={0}>
        <AbsoluteFill
          style={{
            justifyContent: "flex-end",
            alignItems: "center",
            paddingBottom: 150,
            opacity: b1,
            transform: `translateY(${rise(b1)}px)`,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              fontFamily: anton,
              fontSize: 118,
              letterSpacing: 2,
              color: C.paper,
              textShadow: shadow,
              lineHeight: 0.92,
              textAlign: "center",
            }}
          >
            LE VEILLEUR
          </div>
          <div
            style={{
              marginTop: 18,
              fontSize: 28,
              fontWeight: 500,
              letterSpacing: 0.5,
              color: C.glint,
              textShadow: shadow,
              textAlign: "center",
            }}
          >
            il regarde la mer, jamais vos clients
          </div>
        </AbsoluteFill>
      </Sequence>

      {/* Beat 2 — measured at satellite, not guessed */}
      <Sequence from={0}>
        <AbsoluteFill
          style={{
            justifyContent: "flex-end",
            alignItems: "center",
            paddingBottom: 170,
            opacity: b2,
            transform: `translateY(${rise(b2)}px)`,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              fontFamily: anton,
              fontSize: 68,
              letterSpacing: 1.5,
              color: C.paper,
              textShadow: shadow,
              lineHeight: 1.02,
              textAlign: "center",
            }}
          >
            MESURÉ AU SATELLITE,
          </div>
          <div
            style={{
              fontFamily: anton,
              fontSize: 68,
              letterSpacing: 1.5,
              color: C.goldL,
              textShadow: shadow,
              lineHeight: 1.02,
              textAlign: "center",
            }}
          >
            PAS DEVINÉ.
          </div>
        </AbsoluteFill>
      </Sequence>

      {/* Beat 3 — honest, dated verdict chip */}
      <Sequence from={0}>
        <AbsoluteFill
          style={{
            justifyContent: "flex-end",
            alignItems: "center",
            paddingBottom: 150,
            opacity: b3,
            transform: `translateY(${rise(b3)}px)`,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              background: C.paper,
              border: `3px solid ${C.ink}`,
              borderRadius: 18,
              boxShadow: `8px 8px 0 ${C.ink}`,
              padding: "26px 40px",
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontSize: 24,
                fontWeight: 700,
                letterSpacing: 2,
                color: C.ink,
                opacity: 0.72,
              }}
            >
              AUJOURD&apos;HUI · LES SALINES
            </div>
            <div
              style={{
                fontFamily: anton,
                fontSize: 76,
                letterSpacing: 1,
                color: C.ink,
                marginTop: 8,
                lineHeight: 1,
              }}
            >
              MER PROPRE <span style={{ color: C.green }}>✓</span>
            </div>
          </div>
        </AbsoluteFill>
      </Sequence>

      {/* Beat 4 — your beach, every day + gold pill CTA */}
      <Sequence from={0}>
        <AbsoluteFill
          style={{
            justifyContent: "flex-end",
            alignItems: "center",
            paddingBottom: 160,
            opacity: b4,
            transform: `translateY(${rise(b4)}px)`,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              fontFamily: anton,
              fontSize: 66,
              letterSpacing: 1.5,
              color: C.paper,
              textShadow: shadow,
              lineHeight: 1.02,
              textAlign: "center",
            }}
          >
            VOTRE PLAGE, CHAQUE JOUR
          </div>
          <div
            style={{
              marginTop: 26,
              background: C.goldL,
              color: C.ink,
              fontSize: 26,
              fontWeight: 700,
              letterSpacing: 0.5,
              padding: "16px 34px",
              borderRadius: 999,
              boxShadow: "0 6px 22px rgba(2,10,18,0.5)",
            }}
          >
            voir ma plage — gratuit →
          </div>
        </AbsoluteFill>
      </Sequence>
    </AbsoluteFill>
  );
};
