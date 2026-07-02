import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { COLORS } from "../theme";
import { anton, bangers } from "../fonts";
import { ComicText, Halftone, Starburst, SpeedLines } from "../primitives";

/* ----------------------------------------------------------------------------
 * SCENE 1 — OPENING LOGO BURST
 * "GROOVE" explodes onto a yellow field with a spinning comic Starburst behind
 * it, radial speed lines, halftone texture, and a small tagline beneath.
 * Frame budget ~70 @ 30fps.
 * -------------------------------------------------------------------------- */
export const Scene1: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Whole-logo "impact" scale: overshoot punch then settle.
  const punch = spring({ frame, fps, config: { damping: 8, mass: 0.7 } });
  const logoScale = interpolate(punch, [0, 1], [0.4, 1]);

  // A quick camera-shake on impact (frames ~4-14) for comic energy.
  const shakeAmp = interpolate(frame, [4, 14], [22, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const shakeX = Math.sin(frame * 2.1) * shakeAmp;
  const shakeY = Math.cos(frame * 2.7) * shakeAmp;

  // Tagline plate: springs up + fades in a beat after the title.
  const tag = spring({ frame: frame - 26, fps, config: { damping: 13 } });
  const tagY = interpolate(tag, [0, 1], [70, 0]);
  const tagOp = interpolate(tag, [0, 1], [0, 1]);
  const tagRot = interpolate(tag, [0, 1], [-6, -3]);

  // Idle wobble on the whole logo so it never goes fully static.
  const wobble = Math.sin(frame * 0.18) * 1.6;

  // A white "flash" pop right on impact.
  const flash = interpolate(frame, [0, 4, 12], [0.9, 0.55, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 50% 42%, ${COLORS.orange} 0%, ${COLORS.yellow} 55%, #f0a800 100%)`,
        overflow: "hidden",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {/* halftone comic texture */}
      <Halftone color={COLORS.ink} size={30} opacity={0.14} speed={0.18} />

      {/* radial speed lines behind everything */}
      <SpeedLines color={COLORS.ink} count={40} />

      {/* thick ink comic frame border */}
      <div
        style={{
          position: "absolute",
          inset: 34,
          border: `14px solid ${COLORS.ink}`,
          borderRadius: 28,
          boxShadow: `inset 0 0 0 8px ${COLORS.paper}`,
          pointerEvents: "none",
        }}
      />

      {/* logo cluster: starburst + title, shaken + scaled as one unit */}
      <div
        style={{
          position: "absolute",
          top: "42%",
          left: "50%",
          transform: `translate(-50%, -50%) translate(${shakeX}px, ${shakeY}px) scale(${logoScale}) rotate(${wobble}deg)`,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        {/* explosion behind the word */}
        <div style={{ position: "absolute", width: 1080, height: 1080, left: -540, top: -540 }}>
          <Starburst color={COLORS.red} points={18} spin={0.7} scale={1.05} />
        </div>
        {/* second, tighter burst for depth */}
        <div style={{ position: "absolute", width: 1080, height: 1080, left: -540, top: -540 }}>
          <Starburst color={COLORS.yellow} points={22} spin={-0.9} scale={0.72} />
        </div>

        {/* the word GROOVE */}
        <div style={{ position: "relative", zIndex: 2 }}>
          <ComicText
            text="GROOVE"
            fontFamily={anton}
            size={210}
            color={COLORS.paper}
            stroke={COLORS.ink}
            stagger={3}
            from="flip"
            delay={2}
            letterSpacing={-2}
          />
        </div>
      </div>

      {/* tagline plate beneath the logo */}
      <div
        style={{
          position: "absolute",
          top: "66%",
          left: "50%",
          transform: `translate(-50%, 0) translateY(${tagY}px) rotate(${tagRot}deg)`,
          opacity: tagOp,
          background: COLORS.ink,
          border: `8px solid ${COLORS.paper}`,
          borderRadius: 18,
          padding: "22px 46px",
          boxShadow: `12px 12px 0 rgba(0,0,0,0.4)`,
        }}
      >
        <span
          style={{
            fontFamily: bangers,
            fontSize: 84,
            color: COLORS.cyan,
            letterSpacing: 6,
            WebkitTextStroke: `2px ${COLORS.ink}`,
            paintOrder: "stroke fill",
            whiteSpace: "nowrap",
          }}
        >
          COOL MOTION REEL
        </span>
      </div>

      {/* impact flash */}
      <AbsoluteFill
        style={{
          background: COLORS.paper,
          opacity: flash,
          pointerEvents: "none",
          mixBlendMode: "screen",
        }}
      />
    </AbsoluteFill>
  );
};
