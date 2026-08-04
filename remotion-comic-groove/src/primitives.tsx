import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { COLORS } from "./theme";

/* ----------------------------------------------------------------------------
 * Halftone — comic dot texture. `speed` drifts it for subtle parallax life.
 * -------------------------------------------------------------------------- */
export const Halftone: React.FC<{
  color?: string;
  size?: number;
  opacity?: number;
  speed?: number;
}> = ({ color = "#000", size = 26, opacity = 0.12, speed = 0 }) => {
  const frame = useCurrentFrame();
  const shift = frame * speed;
  return (
    <AbsoluteFill
      style={{
        backgroundImage: `radial-gradient(${color} 22%, transparent 23%)`,
        backgroundSize: `${size}px ${size}px`,
        backgroundPosition: `${shift}px ${shift}px`,
        opacity,
      }}
    />
  );
};

/* ----------------------------------------------------------------------------
 * GrooveFloor — the recurring "ground": a neon perspective grid scrolling
 * toward the viewer. This is the "on land / ground groove" motif.
 * -------------------------------------------------------------------------- */
export const GrooveFloor: React.FC<{
  color?: string;
  glow?: string;
  speed?: number;
}> = ({ color = COLORS.cyan, glow = COLORS.purple, speed = 6 }) => {
  const frame = useCurrentFrame();
  const scroll = (frame * speed) % 124;
  return (
    <AbsoluteFill style={{ perspective: 640, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          bottom: -80,
          left: "-50%",
          width: "200%",
          height: "72%",
          transform: "rotateX(74deg)",
          transformOrigin: "bottom center",
          backgroundColor: COLORS.ink,
          backgroundImage: `
            repeating-linear-gradient(0deg, transparent 0 58px, ${color} 58px 62px),
            repeating-linear-gradient(90deg, transparent 0 58px, ${color} 58px 62px)`,
          backgroundPosition: `0px ${scroll}px, 0 0`,
          boxShadow: `0 -10px 160px ${glow}`,
          opacity: 0.9,
        }}
      />
      {/* horizon fade so the grid dissolves into the sky */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "60%",
          background: `linear-gradient(to bottom, ${COLORS.ink} 30%, transparent)`,
        }}
      />
    </AbsoluteFill>
  );
};

/* ----------------------------------------------------------------------------
 * ComicText — per-letter 3D spring entrance with an inked outline + extrude.
 * `from="flip"` rotates letters in on X; `from="bottom"` launches them up.
 * -------------------------------------------------------------------------- */
export const ComicText: React.FC<{
  text: string;
  fontFamily: string;
  size?: number;
  color?: string;
  stroke?: string;
  stagger?: number;
  from?: "bottom" | "flip";
  delay?: number;
  letterSpacing?: number;
}> = ({
  text,
  fontFamily,
  size = 180,
  color = COLORS.yellow,
  stroke = COLORS.ink,
  stagger = 3,
  from = "bottom",
  delay = 0,
  letterSpacing = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const strokeW = Math.max(2, size * 0.028);
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        flexWrap: "nowrap",
        perspective: 900,
        letterSpacing,
      }}
    >
      {text.split("").map((ch, i) => {
        const s = spring({
          frame: frame - delay - i * stagger,
          fps,
          config: { damping: 12, mass: 0.6 },
        });
        const y = interpolate(s, [0, 1], [from === "flip" ? 0 : 200, 0]);
        const rot = interpolate(s, [0, 1], [from === "flip" ? -120 : 35, 0]);
        const op = interpolate(s, [0, 0.35], [0, 1], {
          extrapolateRight: "clamp",
        });
        return (
          <span
            key={i}
            style={{
              fontFamily,
              fontSize: size,
              lineHeight: 0.92,
              color,
              WebkitTextStroke: `${strokeW}px ${stroke}`,
              paintOrder: "stroke fill",
              transform: `translateY(${y}px) rotateX(${rot}deg)`,
              opacity: op,
              textShadow: `6px 7px 0 ${stroke}`,
              display: "inline-block",
              whiteSpace: "pre",
            }}
          >
            {ch}
          </span>
        );
      })}
    </div>
  );
};

/* ----------------------------------------------------------------------------
 * Starburst — the classic "POP!" explosion behind a title. Springs in + spins.
 * -------------------------------------------------------------------------- */
export const Starburst: React.FC<{
  color?: string;
  points?: number;
  spin?: number;
  scale?: number;
}> = ({ color = COLORS.red, points = 16, spin = 0.6, scale = 1 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 9 } });
  const r1 = 300;
  const r2 = 205;
  const path = Array.from({ length: points * 2 })
    .map((_, i) => {
      const a = (Math.PI / points) * i;
      const r = i % 2 === 0 ? r1 : r2;
      return `${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r).toFixed(1)}`;
    })
    .join(" ");
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <svg
        viewBox="-320 -320 640 640"
        width={1000}
        height={1000}
        style={{ transform: `scale(${pop * scale}) rotate(${frame * spin}deg)` }}
      >
        <polygon
          points={path}
          fill={color}
          stroke={COLORS.ink}
          strokeWidth={12}
          strokeLinejoin="round"
        />
      </svg>
    </AbsoluteFill>
  );
};

/* ----------------------------------------------------------------------------
 * SpeedLines — radial motion streaks (the "WHOOSH"). Flicker keeps them alive.
 * -------------------------------------------------------------------------- */
export const SpeedLines: React.FC<{ color?: string; count?: number }> = ({
  color = COLORS.ink,
  count = 44,
}) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <svg viewBox="-540 -960 1080 1920" width="100%" height="100%">
        {Array.from({ length: count }).map((_, i) => {
          const a = (2 * Math.PI * i) / count + i * 0.015;
          const inner = 300 + (i % 3) * 26;
          const outer = 1400;
          const w = 6 + (i % 4) * 5;
          const op = interpolate((frame + i * 3) % 30, [0, 15, 30], [
            0.1,
            0.55,
            0.1,
          ]);
          return (
            <line
              key={i}
              x1={Math.cos(a) * inner}
              y1={Math.sin(a) * inner}
              x2={Math.cos(a) * outer}
              y2={Math.sin(a) * outer}
              stroke={color}
              strokeWidth={w}
              opacity={op}
            />
          );
        })}
      </svg>
    </AbsoluteFill>
  );
};

/* ----------------------------------------------------------------------------
 * Chromatic — RGB-split text (VHS / glitch pop). Offset breathes with a sine.
 * -------------------------------------------------------------------------- */
export const Chromatic: React.FC<{
  text: string;
  fontFamily: string;
  size?: number;
}> = ({ text, fontFamily, size = 200 }) => {
  const frame = useCurrentFrame();
  const off = interpolate(Math.sin(frame * 0.4), [-1, 1], [-16, 16]);
  const layer: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    fontFamily,
    fontSize: size,
    mixBlendMode: "screen",
    whiteSpace: "pre",
  };
  return (
    <div style={{ position: "relative", width: "100%", height: size * 1.4 }}>
      <div style={{ ...layer, color: "#ff2d55", transform: `translateX(${off}px)` }}>
        {text}
      </div>
      <div style={{ ...layer, color: "#00ffd0", transform: `translateX(${-off}px)` }}>
        {text}
      </div>
      <div style={{ ...layer, color: "#ffffff", transform: `translateY(${off * 0.3}px)` }}>
        {text}
      </div>
    </div>
  );
};

/* ----------------------------------------------------------------------------
 * SpeechBubble — springs in + typewriter reveal with a blinking caret + tail.
 * -------------------------------------------------------------------------- */
export const SpeechBubble: React.FC<{
  text: string;
  fontFamily: string;
  color?: string;
  delay?: number;
  align?: "left" | "right";
}> = ({ text, fontFamily, color = COLORS.paper, delay = 0, align = "left" }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame: frame - delay, fps, config: { damping: 11 } });
  const chars = Math.floor(
    interpolate(frame - delay - 6, [0, text.length * 1.6], [0, text.length], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    })
  );
  return (
    <div
      style={{
        transform: `scale(${pop})`,
        transformOrigin: `${align} bottom`,
        alignSelf: align === "right" ? "flex-end" : "flex-start",
      }}
    >
      <div
        style={{
          position: "relative",
          background: color,
          color: COLORS.ink,
          border: `8px solid ${COLORS.ink}`,
          borderRadius: 40,
          padding: "34px 46px",
          fontFamily,
          fontSize: 66,
          maxWidth: 780,
          boxShadow: `14px 14px 0 ${COLORS.ink}`,
        }}
      >
        {text.slice(0, chars)}
        <span style={{ opacity: frame % 20 < 10 ? 1 : 0 }}>|</span>
        <svg
          width={80}
          height={70}
          viewBox="0 0 80 70"
          style={{
            position: "absolute",
            left: align === "left" ? 52 : undefined,
            right: align === "right" ? 52 : undefined,
            bottom: -40,
            transform: align === "right" ? "scaleX(-1)" : undefined,
          }}
        >
          <polygon
            points="0,0 78,0 18,60"
            fill={color}
            stroke={COLORS.ink}
            strokeWidth={8}
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </div>
  );
};

/* ----------------------------------------------------------------------------
 * Panel — a comic grid cell that springs/rotates in with an onomatopoeia word.
 * -------------------------------------------------------------------------- */
export const Panel: React.FC<{
  word: string;
  color: string;
  fontFamily: string;
  delay?: number;
}> = ({ word, color, fontFamily, delay = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 10, mass: 0.5 } });
  const scale = interpolate(s, [0, 1], [0, 1]);
  const rot = interpolate(s, [0, 1], [-14, delay % 2 ? 4 : -4]);
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        transform: `scale(${scale}) rotate(${rot}deg)`,
        background: color,
        border: `8px solid ${COLORS.ink}`,
        borderRadius: 14,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        boxShadow: `10px 10px 0 rgba(0,0,0,0.35)`,
      }}
    >
      <span
        style={{
          fontFamily,
          fontSize: 108,
          color: COLORS.paper,
          WebkitTextStroke: `3px ${COLORS.ink}`,
          transform: "rotate(-4deg)",
        }}
      >
        {word}
      </span>
    </div>
  );
};

/* ----------------------------------------------------------------------------
 * Vinyl — spinning record (pop-culture groove). Constant rotation.
 * -------------------------------------------------------------------------- */
export const Vinyl: React.FC<{ label?: string }> = ({ label = COLORS.red }) => {
  const frame = useCurrentFrame();
  const spin = frame * 6;
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <svg
        viewBox="-250 -250 500 500"
        width={760}
        height={760}
        style={{ transform: `rotate(${spin}deg)` }}
      >
        <circle r={244} fill="#111" stroke={COLORS.ink} strokeWidth={6} />
        {Array.from({ length: 13 }).map((_, i) => (
          <circle key={i} r={78 + i * 13} fill="none" stroke="#333" strokeWidth={2} />
        ))}
        <circle r={72} fill={label} />
        <circle r={9} fill={COLORS.paper} />
        {/* highlight sweep so the spin reads clearly */}
        <path d="M0,-244 A244,244 0 0 1 173,-173 L0,0 Z" fill="rgba(255,255,255,0.06)" />
      </svg>
    </AbsoluteFill>
  );
};

/* ----------------------------------------------------------------------------
 * Walker — a tiny character bobbing along the groove floor (silhouette shapes).
 * -------------------------------------------------------------------------- */
export const Walker: React.FC = () => {
  const frame = useCurrentFrame();
  const bob = Math.sin(frame * 0.4) * 14;
  const stride = Math.sin(frame * 0.4) * 24;
  return (
    <div
      style={{
        position: "absolute",
        bottom: "34%",
        left: "50%",
        transform: `translateX(-50%) translateY(${bob}px)`,
      }}
    >
      <div
        style={{
          width: 120,
          height: 180,
          background: COLORS.yellow,
          border: `8px solid ${COLORS.ink}`,
          borderRadius: 24,
          position: "relative",
        }}
      >
        <div
          style={{
            width: 92,
            height: 92,
            borderRadius: "50%",
            background: COLORS.paper,
            border: `8px solid ${COLORS.ink}`,
            position: "absolute",
            top: -100,
            left: 10,
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -72,
            left: 20,
            width: 26,
            height: 82,
            background: COLORS.ink,
            transform: `rotate(${stride}deg)`,
            transformOrigin: "top center",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -72,
            right: 20,
            width: 26,
            height: 82,
            background: COLORS.ink,
            transform: `rotate(${-stride}deg)`,
            transformOrigin: "top center",
          }}
        />
      </div>
    </div>
  );
};
