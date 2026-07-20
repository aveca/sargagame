import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { COLORS, PALETTE } from "../theme";
import { anton, bangers } from "../fonts";
import { Chromatic, SpeedLines } from "../primitives";

/* ============================================================================
 * Scene8 — GLITCH STROBE TITLE
 * Three stacked words that RGB color-cycle EVERY frame, a scanline overlay,
 * and animated letter-tracking on the last word ("TRACK"). ~66 frames @30fps.
 * ========================================================================== */

// Deterministic per-frame color pick — strobes through the palette fast.
const cycleColor = (frame: number, seed: number) =>
  PALETTE[(frame + seed) % PALETTE.length];

// A single stacked, strobing, per-letter word row.
const StrobeWord: React.FC<{
  text: string;
  delay: number;
  seed: number;
  tracking: number; // extra px between letters (animated on last word)
  size: number;
}> = ({ text, delay, seed, tracking, size }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const strokeW = Math.max(3, size * 0.03);

  // Word slams in from the side, alternating direction per row via seed parity.
  const s = spring({
    frame: frame - delay,
    fps,
    config: { damping: 13, mass: 0.7 },
  });
  const slideFrom = seed % 2 === 0 ? -260 : 260;
  const x = interpolate(s, [0, 1], [slideFrom, 0]);
  const op = interpolate(s, [0, 0.4], [0, 1], { extrapolateRight: "clamp" });

  // Occasional horizontal "glitch jump" so the whole row snaps sideways.
  const glitchOn = (frame + seed * 7) % 11 === 0;
  const glitchX = glitchOn ? (seed % 2 === 0 ? -22 : 22) : 0;

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        flexWrap: "nowrap",
        opacity: op,
        transform: `translateX(${x + glitchX}px)`,
      }}
    >
      {text.split("").map((ch, i) => {
        // Each letter strobes a DIFFERENT palette color each frame.
        const col = cycleColor(frame, seed + i * 2);
        // Vertical micro-jitter per letter keeps the ink alive.
        const jy = Math.sin((frame + i * 3) * 0.9) * 3;
        return (
          <span
            key={i}
            style={{
              fontFamily: anton,
              fontSize: size,
              lineHeight: 0.9,
              color: col,
              WebkitTextStroke: `${strokeW}px ${COLORS.ink}`,
              paintOrder: "stroke fill",
              textShadow: `5px 6px 0 ${COLORS.ink}`,
              marginLeft: i === 0 ? 0 : tracking,
              transform: `translateY(${jy}px)`,
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

export const Scene8: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Background pulses subtly between ink and a hair-brighter ink each frame.
  const bgFlash = frame % 6 === 0 ? "#16161f" : COLORS.ink;

  // Scanline drift downward.
  const scan = (frame * 4) % 8;

  // Animated letter-tracking for the LAST word ("TRACK"): expands then settles,
  // with a fast wobble so the spacing keeps breathing.
  const trackBase = spring({
    frame: frame - 22,
    fps,
    config: { damping: 14 },
  });
  const trackWobble = Math.sin(frame * 0.55) * 10;
  const lastTracking = interpolate(trackBase, [0, 1], [-30, 46]) + trackWobble;

  // Whole-title zoom breathing for kinetic energy.
  const zoom = 1 + Math.sin(frame * 0.18) * 0.02;

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(120% 90% at 50% 42%, #1b1b26 0%, ${bgFlash} 62%, ${COLORS.ink} 100%)`,
        justifyContent: "center",
        alignItems: "center",
        overflow: "hidden",
      }}
    >
      {/* radial speed streaks for kinetic push */}
      <SpeedLines color={cycleColor(frame, 0)} count={40} />

      {/* the strobing stacked title */}
      <div
        style={{
          position: "relative",
          transform: `scale(${zoom})`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 6,
          padding: "0 80px",
          textAlign: "center",
        }}
      >
        <StrobeWord text="CAPTURE" delay={0} seed={0} tracking={2} size={188} />
        <StrobeWord text="SENSE" delay={11} seed={1} tracking={4} size={188} />

        {/* Last word gets Chromatic RGB-split ghost UNDER the strobing letters,
            plus its own animated letter-tracking. */}
        <div style={{ position: "relative", width: "100%" }}>
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              opacity: 0.85,
              pointerEvents: "none",
            }}
          >
            <Chromatic text="TRACK" fontFamily={bangers} size={196} />
          </div>
          <StrobeWord
            text="TRACK"
            delay={22}
            seed={2}
            tracking={lastTracking}
            size={196}
          />
        </div>
      </div>

      {/* SCANLINE OVERLAY — thin horizontal lines drifting down over everything */}
      <AbsoluteFill
        style={{
          backgroundImage:
            "repeating-linear-gradient(to bottom, rgba(0,0,0,0) 0px, rgba(0,0,0,0) 3px, rgba(0,0,0,0.28) 4px, rgba(0,0,0,0.28) 8px)",
          backgroundPosition: `0 ${scan}px`,
          mixBlendMode: "multiply",
          pointerEvents: "none",
        }}
      />

      {/* faint RGB scanline shimmer for VHS feel */}
      <AbsoluteFill
        style={{
          backgroundImage:
            "repeating-linear-gradient(to bottom, rgba(40,224,255,0.05) 0px, rgba(255,45,85,0.05) 2px, rgba(139,92,255,0.05) 4px)",
          mixBlendMode: "screen",
          opacity: 0.6,
          pointerEvents: "none",
        }}
      />

      {/* vignette to seat the strobe in the ink */}
      <AbsoluteFill
        style={{
          boxShadow: "inset 0 0 340px 90px rgba(0,0,0,0.75)",
          pointerEvents: "none",
        }}
      />
    </AbsoluteFill>
  );
};
