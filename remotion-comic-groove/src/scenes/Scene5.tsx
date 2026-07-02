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
import { ComicText, Halftone, Starburst, Vinyl } from "../primitives";

/* ----------------------------------------------------------------------------
 * Scene5 — POP-CULTURE GROOVE.
 * A spinning Vinyl record drops in on a purple stage, halftone drifting behind,
 * a red starburst punching out from under it, and the "SPIN IT" title snapping
 * in per-letter. A tone-arm swings onto the record and pulse rings ripple out
 * on the beat.
 * -------------------------------------------------------------------------- */
export const Scene5: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Record drops in from the top and settles with a bounce.
  const drop = spring({ frame: frame - 4, fps, config: { damping: 11, mass: 0.9 } });
  const recordY = interpolate(drop, [0, 1], [-620, 0]);
  const recordScale = interpolate(drop, [0, 1], [0.55, 1]);
  // Gentle continuous "wobble" of the whole turntable to feel alive.
  const wobble = Math.sin(frame * 0.16) * 1.6;

  // Starburst behind the record pops slightly after the drop lands.
  const burst = spring({ frame: frame - 10, fps, config: { damping: 10 } });

  // Tone-arm swings onto the record.
  const arm = spring({ frame: frame - 20, fps, config: { damping: 14, mass: 1 } });
  const armRot = interpolate(arm, [0, 1], [-38, -8]);

  // Beat pulse rings — three staggered ripples that expand + fade on a loop.
  const rings = [0, 1, 2].map((k) => {
    const local = frame - 14 - k * 16;
    if (local < 0) return -1;
    return (local % 48) / 48;
  });

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(120% 90% at 50% 42%, ${COLORS.purple} 0%, #5c34c9 55%, #3a1f8f 100%)`,
        overflow: "hidden",
      }}
    >
      {/* Drifting halftone texture behind everything */}
      <Halftone color={COLORS.ink} size={30} opacity={0.16} speed={0.35} />
      <Halftone color={COLORS.paper} size={54} opacity={0.06} speed={-0.22} />

      {/* Comic explosion punching out from behind the record */}
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          transform: `translateY(60px) scale(${0.72 * burst})`,
          opacity: 0.9,
        }}
      >
        <Starburst color={COLORS.red} points={20} spin={0.5} scale={1} />
      </AbsoluteFill>

      {/* Turntable stack (rings + record + tone-arm), nudged below center
          so the title has room up top. */}
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          transform: `translateY(120px)`,
        }}
      >
        <div
          style={{
            position: "relative",
            width: 800,
            height: 800,
            transform: `translateY(${recordY}px) scale(${recordScale}) rotate(${wobble}deg)`,
          }}
        >
          {/* Beat pulse rings radiating out from the label */}
          <svg
            viewBox="-400 -400 800 800"
            width={800}
            height={800}
            style={{ position: "absolute", inset: 0 }}
          >
            {rings.map((p, i) =>
              p < 0 ? null : (
                <circle
                  key={i}
                  r={90 + p * 320}
                  fill="none"
                  stroke={COLORS.yellow}
                  strokeWidth={interpolate(p, [0, 1], [14, 2])}
                  opacity={interpolate(p, [0, 0.15, 1], [0, 0.6, 0])}
                />
              )
            )}
          </svg>

          {/* The spinning record itself */}
          <Vinyl label={COLORS.yellow} />

          {/* Tone-arm swinging onto the record */}
          <svg
            viewBox="-400 -400 800 800"
            width={800}
            height={800}
            style={{ position: "absolute", inset: 0 }}
          >
            <g transform={`translate(300 -300) rotate(${armRot})`}>
              {/* pivot base */}
              <circle r={34} fill={COLORS.ink} stroke={COLORS.paper} strokeWidth={5} />
              <circle r={16} fill="#444" />
              {/* arm */}
              <rect
                x={-14}
                y={0}
                width={28}
                height={330}
                rx={12}
                fill={COLORS.paper}
                stroke={COLORS.ink}
                strokeWidth={6}
              />
              {/* head / needle */}
              <rect
                x={-26}
                y={318}
                width={52}
                height={44}
                rx={8}
                fill={COLORS.red}
                stroke={COLORS.ink}
                strokeWidth={6}
              />
            </g>
          </svg>
        </div>
      </AbsoluteFill>

      {/* Title — top zone, punchy per-letter drop */}
      <AbsoluteFill
        style={{
          justifyContent: "flex-start",
          alignItems: "center",
          paddingTop: 210,
        }}
      >
        <div style={{ transform: "rotate(-4deg)" }}>
          <ComicText
            text="SPIN IT"
            fontFamily={anton}
            size={210}
            color={COLORS.yellow}
            stroke={COLORS.ink}
            stagger={4}
            from="flip"
            delay={6}
            letterSpacing={6}
          />
        </div>
      </AbsoluteFill>

      {/* Kicker tag near the bottom for extra pop-culture flavor */}
      <AbsoluteFill
        style={{
          justifyContent: "flex-end",
          alignItems: "center",
          paddingBottom: 150,
        }}
      >
        <div
          style={{
            transform: `scale(${interpolate(
              spring({ frame: frame - 34, fps, config: { damping: 12 } }),
              [0, 1],
              [0, 1]
            )}) rotate(3deg)`,
            fontFamily: bangers,
            fontSize: 84,
            color: COLORS.paper,
            background: COLORS.ink,
            padding: "14px 46px",
            borderRadius: 20,
            border: `6px solid ${COLORS.yellow}`,
            letterSpacing: 4,
            boxShadow: `10px 10px 0 rgba(0,0,0,0.4)`,
            WebkitTextStroke: `1px ${COLORS.ink}`,
          }}
        >
          DROP THE NEEDLE
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
