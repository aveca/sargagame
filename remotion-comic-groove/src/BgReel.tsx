import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  random,
} from "remotion";
import {
  TransitionSeries,
  linearTiming,
  springTiming,
} from "@remotion/transitions";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import { clockWipe } from "@remotion/transitions/clock-wipe";
import { fade } from "@remotion/transitions/fade";

/* ============================================================================
 * BgReel — a HORIZONTAL, ambient, seamlessly-looping "album-mood" BACKGROUND
 * reel meant to sit BEHIND landing-page text. Premium-graphic-design craft:
 * bold ink, halftone, golden-hour grade, green smoke, strong transitions.
 * This is pure MOOD, not MESSAGE: it renders ZERO legible words/glyphs on
 * screen — no set labels, no verdict panel — so the landing page can overlay
 * its own copy cleanly. 1280x720 · 30fps · loops (frame 0 ≈ last frame on the
 * calm golden-hour surface).
 *
 * Palette kept LOCAL (do NOT edit theme.ts).
 * ==========================================================================*/
const C = {
  // golden-hour top->bottom gradient (reference look)
  orange: "#F4922E",
  gold: "#F7B733",
  goldBrand: "#FFC72C",
  teal: "#3E7C6A",
  deep: "#123B37",
  // smoke + accents
  smoke: "#5FBFA0",
  ink: "#0c0c0e",
  inkBrand: "#0d0d0f",
  paper: "#FDFCF7",
  live: "#22C55E",
  goldRing: "#E8A800",
  beam: "#FFD36A",
  panelBlue: "#123B57",
  body: "#16332e",
  glow: "#FFD884",
};

const W = 1280;
const H = 720;
const VB = `0 0 ${W} ${H}`;

/* ---------------------------------------------------------------- timings */
/* All sets ~2s. Slightly staggered so the loop breathes. */
const SET = 74; // ~2.5s per set at 30fps (7 sets + 6 overlaps ≈ 13s total)
const T = 22; // transition overlap (frames)

/* ============================================================================
 * Shared building blocks
 * ==========================================================================*/

/* Golden-hour vertical gradient sky (the album base). `sink` (0..1) darkens
 * it toward the deep teal/abyss for the "descent" set. */
const SkyGradient: React.FC<{ sink?: number }> = ({ sink = 0 }) => {
  // interpolate stop colors toward deeper values as we sink
  const mix = (a: string, b: string, t: number) => {
    const pa = [
      parseInt(a.slice(1, 3), 16),
      parseInt(a.slice(3, 5), 16),
      parseInt(a.slice(5, 7), 16),
    ];
    const pb = [
      parseInt(b.slice(1, 3), 16),
      parseInt(b.slice(3, 5), 16),
      parseInt(b.slice(5, 7), 16),
    ];
    const r = Math.round(pa[0] + (pb[0] - pa[0]) * t);
    const g = Math.round(pa[1] + (pb[1] - pa[1]) * t);
    const bl = Math.round(pa[2] + (pb[2] - pa[2]) * t);
    return `rgb(${r},${g},${bl})`;
  };
  const top = mix(C.orange, C.teal, sink * 0.7);
  const mid = mix(C.gold, C.deep, sink * 0.75);
  const low = mix(C.teal, "#061c1a", sink * 0.85);
  const bot = mix(C.deep, "#020a09", sink * 0.9);
  return (
    <linearGradient id="bg-sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor={top} />
      <stop offset="0.32" stopColor={mid} />
      <stop offset="0.66" stopColor={low} />
      <stop offset="1" stopColor={bot} />
    </linearGradient>
  );
};

/* Warm sun glow, upper-right. */
const SunGlow: React.FC<{ opacity?: number }> = ({ opacity = 1 }) => (
  <>
    <radialGradient id="bg-sun" cx="0.78" cy="0.2" r="0.55">
      <stop offset="0" stopColor={C.glow} stopOpacity={0.85 * opacity} />
      <stop offset="0.4" stopColor={C.gold} stopOpacity={0.28 * opacity} />
      <stop offset="1" stopColor={C.gold} stopOpacity="0" />
    </radialGradient>
    <rect width={W} height={H} fill="url(#bg-sun)" />
  </>
);

/* Halftone dot texture overlay — SVG pattern so it renders crisply and can
 * drift for subtle life. */
const HalftonePattern: React.FC<{
  drift?: number;
  size?: number;
  opacity?: number;
  color?: string;
}> = ({ drift = 0, size = 16, opacity = 0.1, color = C.ink }) => {
  const frame = useCurrentFrame();
  const shift = (frame * drift) % size;
  return (
    <>
      <pattern
        id="bg-halftone"
        x={shift}
        y={shift}
        width={size}
        height={size}
        patternUnits="userSpaceOnUse"
      >
        <circle cx={size / 2} cy={size / 2} r={size * 0.19} fill={color} />
      </pattern>
      <rect width={W} height={H} fill="url(#bg-halftone)" opacity={opacity} />
    </>
  );
};

/* Vignette + faint film grain via feturbulence for premium finish. */
const VignetteGrain: React.FC = () => (
  <>
    <radialGradient id="bg-vig" cx="0.5" cy="0.5" r="0.75">
      <stop offset="0.55" stopColor="#000000" stopOpacity="0" />
      <stop offset="1" stopColor="#000000" stopOpacity="0.34" />
    </radialGradient>
    <filter id="bg-grain">
      <feTurbulence
        type="fractalNoise"
        baseFrequency="0.9"
        numOctaves="2"
        stitchTiles="stitch"
      />
      <feColorMatrix type="saturate" values="0" />
    </filter>
    <rect width={W} height={H} fill="url(#bg-vig)" />
    <rect
      width={W}
      height={H}
      filter="url(#bg-grain)"
      opacity="0.05"
      style={{ mixBlendMode: "overlay" }}
    />
  </>
);

/* Translucent GREEN SMOKE plumes — soft blobs that drift + breathe. */
const GreenSmoke: React.FC<{ intensity?: number }> = ({ intensity = 1 }) => {
  const frame = useCurrentFrame();
  const plumes = React.useMemo(
    () =>
      Array.from({ length: 6 }, (_, i) => ({
        x: 120 + random(`sx${i}`) * (W - 240),
        y: 160 + random(`sy${i}`) * (H - 240),
        r: 120 + random(`sr${i}`) * 160,
        sp: 0.4 + random(`sp${i}`) * 0.9,
        ph: random(`sph${i}`) * Math.PI * 2,
        amp: 24 + random(`sa${i}`) * 40,
      })),
    []
  );
  return (
    <>
      <filter id="bg-smoke-blur" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="26" />
      </filter>
      <g filter="url(#bg-smoke-blur)">
        {plumes.map((p, i) => {
          const dx = p.x + Math.cos(frame * 0.012 * p.sp + p.ph) * p.amp;
          const dy = p.y + Math.sin(frame * 0.01 * p.sp + p.ph) * p.amp * 0.7;
          const breathe = 1 + Math.sin(frame * 0.03 + p.ph) * 0.12;
          const op =
            (0.14 + Math.sin(frame * 0.02 + p.ph) * 0.05) * intensity;
          return (
            <circle
              key={i}
              cx={dx}
              cy={dy}
              r={p.r * breathe}
              fill={C.smoke}
              opacity={Math.max(0.04, op)}
            />
          );
        })}
      </g>
    </>
  );
};

/* Gritty coastal ink baseline — power-line poles + palm silhouettes + wavy
 * coast, all in near-black ink. `y` lets sets place it at different heights. */
const CoastBaseline: React.FC<{ baseY?: number; parallax?: number }> = ({
  baseY = 560,
  parallax = 0,
}) => {
  const wave = (amp: number, off: number) => {
    let d = `M0 ${baseY + off}`;
    for (let x = 0; x <= W; x += 64) {
      const y =
        baseY + off + Math.sin((x / W) * Math.PI * 6 + off * 0.4) * amp;
      d += ` L${x} ${y.toFixed(1)}`;
    }
    d += ` L${W} ${H} L0 ${H} Z`;
    return d;
  };
  return (
    <g transform={`translate(${parallax} 0)`}>
      {/* palm silhouettes */}
      {[180, 520, 1040].map((px, i) => (
        <g key={i} transform={`translate(${px} ${baseY - 6})`}>
          <path
            d="M0 0 C -6 -70 -4 -120 -2 -150 C 0 -120 2 -70 4 0 Z"
            fill={C.ink}
          />
          {[-1, 1].map((s) =>
            [0, 1, 2].map((k) => (
              <path
                key={`${s}-${k}`}
                d={`M0 -150 C ${s * (36 + k * 26)} ${-160 - k * 14} ${
                  s * (74 + k * 34)
                } ${-150 - k * 6} ${s * (96 + k * 40)} ${-118 + k * 22}`}
                stroke={C.ink}
                strokeWidth={11 - k * 2}
                fill="none"
                strokeLinecap="round"
              />
            ))
          )}
        </g>
      ))}
      {/* power-line poles + wires */}
      {[340, 700, 900].map((px, i) => (
        <g key={`p${i}`}>
          <line
            x1={px}
            y1={baseY - 4}
            x2={px}
            y2={baseY - 172}
            stroke={C.ink}
            strokeWidth={10}
          />
          <line
            x1={px - 34}
            y1={baseY - 150}
            x2={px + 34}
            y2={baseY - 150}
            stroke={C.ink}
            strokeWidth={8}
          />
          <line
            x1={px - 26}
            y1={baseY - 128}
            x2={px + 26}
            y2={baseY - 128}
            stroke={C.ink}
            strokeWidth={7}
          />
        </g>
      ))}
      {/* drooping wires between poles */}
      <path
        d={`M340 ${baseY - 150} Q520 ${baseY - 120} 700 ${baseY - 150}`}
        stroke={C.ink}
        strokeWidth={3}
        fill="none"
      />
      <path
        d={`M700 ${baseY - 150} Q800 ${baseY - 128} 900 ${baseY - 150}`}
        stroke={C.ink}
        strokeWidth={3}
        fill="none"
      />
      {/* wavy inked coast baseline */}
      <path d={wave(14, 0)} fill={C.ink} />
      <path d={wave(9, 26)} fill={C.ink} opacity={0.75} />
    </g>
  );
};

/* ------------------------------------------------------------- the mascot */
/* Bold comic satellite "sonde" with a big teal lens eye, drawn around origin. */
const Sonde: React.FC<{ breathe?: number; tilt?: number }> = ({
  breathe = 0,
  tilt = 0,
}) => (
  <g transform={`rotate(${tilt}) translate(0 ${breathe})`}>
    {/* halo */}
    <circle r="200" fill={C.smoke} opacity="0.18" />
    {/* downward sensor beam */}
    <path d="M0 70 L-120 340 L120 340 Z" fill={C.beam} opacity="0.22" />
    {/* solar panels (a touch of rotation each side) */}
    <g transform="rotate(-6)">
      <rect
        x="-232"
        y="-30"
        width="150"
        height="80"
        rx="8"
        fill={C.panelBlue}
        stroke={C.inkBrand}
        strokeWidth="8"
      />
      {[0, 1, 2].map((i) => (
        <line
          key={`lp${i}`}
          x1={-232 + 37 * (i + 1)}
          y1={-30}
          x2={-232 + 37 * (i + 1)}
          y2={50}
          stroke={C.inkBrand}
          strokeWidth="4"
        />
      ))}
    </g>
    <g transform="rotate(6)">
      <rect
        x="82"
        y="-30"
        width="150"
        height="80"
        rx="8"
        fill={C.panelBlue}
        stroke={C.inkBrand}
        strokeWidth="8"
      />
      {[0, 1, 2].map((i) => (
        <line
          key={`rp${i}`}
          x1={82 + 37 * (i + 1)}
          y1={-30}
          x2={82 + 37 * (i + 1)}
          y2={50}
          stroke={C.inkBrand}
          strokeWidth="4"
        />
      ))}
    </g>
    {/* body */}
    <path
      d="M0 -110 C74 -110 118 -70 118 0 C118 92 78 156 0 156 C-78 156 -118 92 -118 0 C-118 -70 -74 -110 0 -110 Z"
      fill={C.body}
      stroke={C.inkBrand}
      strokeWidth="10"
    />
    {/* lens */}
    <defs>
      <radialGradient id="bg-lens" cx="0.4" cy="0.32" r="0.8">
        <stop offset="0" stopColor="#CFF4FF" />
        <stop offset="0.5" stopColor="#16b9c9" />
        <stop offset="1" stopColor="#052b2b" />
      </radialGradient>
    </defs>
    <circle
      cx="0"
      cy="26"
      r="80"
      fill="url(#bg-lens)"
      stroke={C.inkBrand}
      strokeWidth="10"
    />
    <circle
      cx="0"
      cy="26"
      r="80"
      fill="none"
      stroke={C.goldRing}
      strokeWidth="10"
    />
    <circle cx="0" cy="40" r="30" fill="#03100f" />
    <circle cx="-12" cy="14" r="12" fill="#fff7e2" />
    {/* antenna + green LIVE tip */}
    <line x1="0" y1="-110" x2="0" y2="-168" stroke={C.inkBrand} strokeWidth="11" />
    <circle
      cx="0"
      cy="-176"
      r="17"
      fill={C.live}
      stroke={C.inkBrand}
      strokeWidth="8"
    />
  </g>
);

/* Full-bleed SVG stage helper. */
const Stage: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill>
    <svg width={W} height={H} viewBox={VB} style={{ display: "block" }}>
      {children}
    </svg>
  </AbsoluteFill>
);

/* ============================================================================
 * SET 1 — Golden-hour ocean surface: sun glow, light rays, calm shimmer.
 * (This is the loop anchor — frame 0 lives here and the last set returns to it.)
 * ==========================================================================*/
const SetOcean: React.FC = () => {
  const frame = useCurrentFrame();
  const rays = [220, 470, 720, 980];
  return (
    <Stage>
        <defs>
          <SkyGradient />
        </defs>
        <rect width={W} height={H} fill="url(#bg-sky)" />
        <SunGlow />
        {/* light rays fanning from the sun */}
        <g opacity="0.16">
          {rays.map((x, i) => {
            const sway = Math.sin(frame * 0.02 + i) * 18;
            return (
              <polygon
                key={i}
                points={`${900},80 ${x + sway},${H} ${x + 90 + sway},${H}`}
                fill={C.glow}
              />
            );
          })}
        </g>
        {/* calm shimmering sea bands */}
        {Array.from({ length: 7 }).map((_, i) => {
          const y = 430 + i * 40;
          const w = Math.sin(frame * 0.05 + i * 0.8) * 10;
          return (
            <path
              key={i}
              d={`M0 ${y} Q ${320 + w} ${y - 12} 640 ${y} T 1280 ${y}`}
              stroke={C.glow}
              strokeWidth={2}
              fill="none"
              opacity={interpolate(i, [0, 6], [0.28, 0.05])}
            />
          );
        })}
        <GreenSmoke intensity={0.5} />
        <HalftonePattern drift={0.15} opacity={0.08} />
        <VignetteGrain />
      </Stage>
  );
};

/* ============================================================================
 * SET 2 — MASCOT front & center: gentle breathe + soft halo/beam, looking down.
 * ==========================================================================*/
const SetMascot: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 200 } });
  const breathe = Math.sin(frame * 0.06) * 10;
  const tilt = Math.sin(frame * 0.03) * 1.6;
  const scale = interpolate(enter, [0, 1], [0.94, 1]);
  return (
    <Stage>
        <defs>
          <SkyGradient />
        </defs>
        <rect width={W} height={H} fill="url(#bg-sky)" />
        <SunGlow opacity={0.9} />
        <GreenSmoke intensity={0.8} />
        <g transform={`translate(${W / 2} 300) scale(${0.92 * scale})`}>
          <Sonde breathe={breathe} tilt={tilt} />
        </g>
        <HalftonePattern drift={0.12} opacity={0.09} />
        <VignetteGrain />
      </Stage>
  );
};

/* ============================================================================
 * SET 3 — Green smoke + halftone abstract texture drift (pure mood/album).
 * ==========================================================================*/
const SetTexture: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <Stage>
        <defs>
          <SkyGradient sink={0.15} />
        </defs>
        <rect width={W} height={H} fill="url(#bg-sky)" />
        <SunGlow opacity={0.6} />
        <GreenSmoke intensity={1.35} />
        {/* second, larger drifting halftone in gold for depth */}
        <HalftonePattern
          drift={-0.22}
          size={30}
          opacity={0.07}
          color={C.goldBrand}
        />
        <HalftonePattern drift={0.2} size={14} opacity={0.1} />
        {/* soft ink ribbon sweeping across for graphic-album feel */}
        <path
          d={`M-100 ${360 + Math.sin(frame * 0.04) * 40} Q 640 ${
            260 + Math.cos(frame * 0.05) * 60
          } 1380 ${420 + Math.sin(frame * 0.03) * 40}`}
          stroke={C.ink}
          strokeWidth={5}
          fill="none"
          opacity={0.18}
        />
        <VignetteGrain />
      </Stage>
  );
};

/* ============================================================================
 * SET 4 — Gritty coastal ink baseline (poles + palms) against golden sky.
 * ==========================================================================*/
const SetCoast: React.FC = () => {
  const frame = useCurrentFrame();
  const parallax = Math.sin(frame * 0.02) * 12;
  return (
    <Stage>
        <defs>
          <SkyGradient />
        </defs>
        <rect width={W} height={H} fill="url(#bg-sky)" />
        <SunGlow />
        <GreenSmoke intensity={0.55} />
        <CoastBaseline baseY={572} parallax={parallax} />
        <HalftonePattern drift={0.15} opacity={0.09} />
        <VignetteGrain />
      </Stage>
  );
};

/* ============================================================================
 * SET 5 — Descent: gradient darkens toward deep teal/abyss with drifting
 * plankton dots, then resurfaces (sink 0->1->0 across the set).
 * ==========================================================================*/
const SetDescent: React.FC = () => {
  const frame = useCurrentFrame();
  // sink 0 -> 1 -> 0 across the set so it resurfaces before the transition out.
  const sink = (1 - Math.cos((frame / SET) * Math.PI * 2)) / 2;
  const plankton = React.useMemo(
    () =>
      Array.from({ length: 26 }, (_, i) => ({
        x: random(`px${i}`) * W,
        baseY: 120 + random(`py${i}`) * (H - 160),
        r: 1.5 + random(`pr${i}`) * 3,
        sp: 4 + random(`ps${i}`) * 6,
        ph: random(`pp${i}`) * 360,
      })),
    []
  );
  return (
    <Stage>
        <defs>
          <SkyGradient sink={sink} />
        </defs>
        <rect width={W} height={H} fill="url(#bg-sky)" />
        <SunGlow opacity={interpolate(sink, [0, 1], [0.7, 0.08])} />
        {/* drifting plankton dots, rising as we sink */}
        <g>
          {plankton.map((p, i) => {
            const dy = p.baseY - (frame * (0.3 + i / 40)) % (H + 40) + sink * 30;
            const y = ((dy % (H + 60)) + H + 60) % (H + 60);
            const dx = p.x + Math.cos((frame / p.sp + p.ph) * 0.05) * 10;
            return (
              <circle
                key={i}
                cx={dx}
                cy={y}
                r={p.r}
                fill="#1EC8B0"
                opacity={interpolate(sink, [0, 1], [0.25, 0.7])}
              />
            );
          })}
        </g>
        <GreenSmoke intensity={interpolate(sink, [0, 1], [0.4, 1])} />
        <HalftonePattern drift={0.1} opacity={0.08} />
        <VignetteGrain />
      </Stage>
  );
};

/* ============================================================================
 * SET 6 — Lens bloom: a slow, calm push-in onto the mascot's teal lens/eye
 * with bioluminescent plankton drifting up and a green smoke swirl. Purely
 * SCENIC / ambient — NO panels, NO checkmark, NO words. The push-in eases
 * back out toward the end so the fade into the golden-hour reprise closes the
 * loop cleanly.
 * ==========================================================================*/
const SetLensBloom: React.FC = () => {
  const frame = useCurrentFrame();
  // 0 -> 1 -> ~0.15: push in, hold, gently pull back before the fade out.
  const push = interpolate(
    frame,
    [0, SET * 0.45, SET * 0.75, SET],
    [0, 1, 1, 0.2],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  // camera zooms toward the lens (centered on the eye at ~y 326 in mascot space).
  const scale = interpolate(push, [0, 1], [1.0, 2.35]);
  const breathe = Math.sin(frame * 0.05) * 6;
  const iris = 30 + Math.sin(frame * 0.08) * 3; // subtle iris pulse
  // rising bioluminescent plankton in front of the lens.
  const spores = React.useMemo(
    () =>
      Array.from({ length: 30 }, (_, i) => ({
        x: random(`bx${i}`) * W,
        y: random(`by${i}`) * H,
        r: 1.2 + random(`br${i}`) * 3.2,
        sp: 0.4 + random(`bs${i}`) * 0.9,
        ph: random(`bp${i}`) * 360,
      })),
    []
  );
  return (
    <Stage>
      <defs>
        <SkyGradient sink={0.2} />
        <radialGradient id="bg-bloom" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#CFF4FF" stopOpacity="0.5" />
          <stop offset="0.5" stopColor={C.smoke} stopOpacity="0.18" />
          <stop offset="1" stopColor={C.smoke} stopOpacity="0" />
        </radialGradient>
        {/* lens gradient defined locally (Sonde isn't rendered in this set) */}
        <radialGradient id="bg-lens" cx="0.4" cy="0.32" r="0.8">
          <stop offset="0" stopColor="#CFF4FF" />
          <stop offset="0.5" stopColor="#16b9c9" />
          <stop offset="1" stopColor="#052b2b" />
        </radialGradient>
      </defs>
      <rect width={W} height={H} fill="url(#bg-sky)" />
      <SunGlow opacity={interpolate(push, [0, 1], [0.7, 0.25])} />
      <GreenSmoke intensity={interpolate(push, [0, 1], [0.7, 1.3])} />

      {/* the mascot's eye, pushed in on. Transform-origin = the lens centre. */}
      <g
        transform={`translate(${W / 2} ${326 + breathe}) scale(${scale}) translate(${
          -W / 2
        } ${-326})`}
      >
        <g transform={`translate(${W / 2} 300)`}>
          {/* soft aura bloom behind the lens */}
          <circle cx="0" cy="26" r="150" fill="url(#bg-bloom)" />
          {/* lens (reuse the mascot's eye geometry, no body/labels) */}
          <circle
            cx="0"
            cy="26"
            r="80"
            fill="url(#bg-lens)"
            stroke={C.inkBrand}
            strokeWidth="10"
          />
          <circle
            cx="0"
            cy="26"
            r="80"
            fill="none"
            stroke={C.goldRing}
            strokeWidth="10"
          />
          <circle cx="0" cy="40" r={iris} fill="#03100f" />
          {/* faint reflected ocean glint sliding across the iris */}
          <circle
            cx={-12 + Math.sin(frame * 0.04) * 6}
            cy={14 + Math.cos(frame * 0.04) * 4}
            r="12"
            fill="#fff7e2"
          />
        </g>
      </g>

      {/* bioluminescent plankton rising in the foreground */}
      <g>
        {spores.map((p, i) => {
          const rise = ((p.y - frame * (0.5 + p.sp)) % (H + 60) + H + 60) % (H + 60);
          const dx = p.x + Math.cos((frame / 12 + p.ph) * 0.08) * 14;
          const glow = 0.35 + Math.sin(frame * 0.06 + p.ph) * 0.25;
          return (
            <circle
              key={i}
              cx={dx}
              cy={rise}
              r={p.r}
              fill="#7CF3D0"
              opacity={Math.max(0.1, glow)}
            />
          );
        })}
      </g>

      <HalftonePattern drift={0.12} opacity={0.08} />
      <VignetteGrain />
    </Stage>
  );
};

/* ============================================================================
 * The reel — a TransitionSeries cycling ALL sets with strong transitions.
 * ==========================================================================*/
export const BgReel: React.FC = () => {
  const { width, height } = useVideoConfig();
  return (
    <AbsoluteFill style={{ backgroundColor: C.deep }}>
      <TransitionSeries>
        {/* SET 1 — golden-hour ocean (loop anchor) */}
        <TransitionSeries.Sequence durationInFrames={SET}>
          <SetOcean />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={slide({ direction: "from-right" })}
          timing={springTiming({ config: { damping: 200 }, durationInFrames: T })}
        />

        {/* SET 2 — mascot */}
        <TransitionSeries.Sequence durationInFrames={SET}>
          <SetMascot />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={wipe({ direction: "from-bottom" })}
          timing={linearTiming({ durationInFrames: T })}
        />

        {/* SET 3 — green smoke + halftone texture */}
        <TransitionSeries.Sequence durationInFrames={SET}>
          <SetTexture />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={slide({ direction: "from-left" })}
          timing={springTiming({ config: { damping: 200 }, durationInFrames: T })}
        />

        {/* SET 4 — coastal ink baseline */}
        <TransitionSeries.Sequence durationInFrames={SET}>
          <SetCoast />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={clockWipe({ width, height })}
          timing={linearTiming({ durationInFrames: T })}
        />

        {/* SET 5 — descent */}
        <TransitionSeries.Sequence durationInFrames={SET}>
          <SetDescent />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={wipe({ direction: "from-top" })}
          timing={linearTiming({ durationInFrames: T })}
        />

        {/* SET 6 — lens bloom (scenic, wordless) */}
        <TransitionSeries.Sequence durationInFrames={SET}>
          <SetLensBloom />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={springTiming({ config: { damping: 200 }, durationInFrames: T })}
        />

        {/* SET 1 (reprise) — back on the calm golden-hour surface so it loops.
            Short reprise; the fade FROM lens-bloom + fade INTO frame-0 close cleanly. */}
        <TransitionSeries.Sequence durationInFrames={SET}>
          <SetOcean />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};

/* Total = 7 sequences * SET - 6 transitions * T (transitions overlap). */
export const BG_DURATION = 7 * SET - 6 * T;
