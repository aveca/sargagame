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

/**
 * SCENE 10 — OUTRO CTA (Substack newsletter vibe).
 * Starburst POP behind a giant "STACK IT" title that springs in per-letter,
 * a bold underline bar whose width springs from 0, then the subscribe line.
 */
export const Scene10: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // --- Underline swipe: width springs 0 -> full, starts after the title lands.
  const underlineSpring = spring({
    frame: frame - 30,
    fps,
    config: { damping: 14, mass: 0.7 },
  });
  const underlineW = interpolate(underlineSpring, [0, 1], [0, 620]);

  // --- Subscribe pill: pops in last.
  const subSpring = spring({
    frame: frame - 52,
    fps,
    config: { damping: 13, mass: 0.6 },
  });
  const subScale = interpolate(subSpring, [0, 1], [0.6, 1]);
  const subOp = interpolate(subSpring, [0, 0.4], [0, 1], {
    extrapolateRight: "clamp",
  });

  // --- Arrow nudge (loops) drawing the eye to the subscribe line.
  const arrowNudge = Math.sin(frame * 0.28) * 10;

  // --- Whole-scene pulse so the CTA "breathes" like a live button.
  const pulse = 1 + Math.sin(frame * 0.18) * 0.012;

  // --- Blinking "LIVE" dot for extra kinetic energy.
  const dotOn = frame % 24 < 14;

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(120% 90% at 50% 38%, ${COLORS.paper} 40%, #f4e6bf 100%)`,
        overflow: "hidden",
      }}
    >
      {/* comic dot texture, drifting */}
      <Halftone color={COLORS.ink} size={30} opacity={0.1} speed={0.35} />

      {/* radial motion streaks pushing energy outward */}
      <SpeedLines color={COLORS.ink} count={40} />

      {/* explosion behind the title */}
      <div style={{ transform: "translateY(-140px)" }}>
        <Starburst color={COLORS.orange} points={20} spin={0.5} scale={0.92} />
      </div>

      {/* thick comic frame border */}
      <AbsoluteFill
        style={{
          margin: 34,
          border: `14px solid ${COLORS.ink}`,
          borderRadius: 40,
          boxShadow: `inset 0 0 0 8px ${COLORS.paper}, inset 0 0 0 20px ${COLORS.ink}`,
          pointerEvents: "none",
        }}
      />

      {/* main stack, centered with safe margins */}
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          padding: "0 80px",
          transform: `scale(${pulse})`,
        }}
      >
        {/* kicker */}
        <div
          style={{
            fontFamily: bangers,
            fontSize: 62,
            color: COLORS.red,
            WebkitTextStroke: `3px ${COLORS.ink}`,
            paintOrder: "stroke fill",
            letterSpacing: 4,
            transform: "rotate(-3deg)",
            marginBottom: 26,
            opacity: interpolate(frame, [4, 18], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          DON'T MISS THE GROOVE
        </div>

        {/* THE CTA — big per-letter spring title */}
        <ComicText
          text="STACK IT"
          fontFamily={anton}
          size={230}
          color={COLORS.yellow}
          stroke={COLORS.ink}
          stagger={4}
          from="flip"
          delay={4}
          letterSpacing={6}
        />

        {/* animated underline swipe bar */}
        <div
          style={{
            marginTop: 24,
            height: 30,
            width: underlineW,
            background: COLORS.red,
            border: `6px solid ${COLORS.ink}`,
            borderRadius: 18,
            boxShadow: `10px 10px 0 ${COLORS.ink}`,
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* shine sweep travelling along the bar */}
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              width: 90,
              left: `${((frame * 4) % 160) - 40}%`,
              background:
                "linear-gradient(90deg, transparent, rgba(255,255,255,0.7), transparent)",
              transform: "skewX(-18deg)",
            }}
          />
        </div>

        {/* subscribe line — required exact wording */}
        <div
          style={{
            marginTop: 70,
            transform: `scale(${subScale})`,
            opacity: subOp,
            display: "flex",
            alignItems: "center",
            gap: 22,
          }}
        >
          {/* blinking LIVE dot */}
          <span
            style={{
              width: 30,
              height: 30,
              borderRadius: "50%",
              background: dotOn ? COLORS.green : "#a9b39c",
              border: `5px solid ${COLORS.ink}`,
              boxShadow: dotOn ? `0 0 22px ${COLORS.green}` : "none",
              flexShrink: 0,
            }}
          />
          <div
            style={{
              fontFamily: bangers,
              fontSize: 58,
              color: COLORS.paper,
              background: COLORS.ink,
              WebkitTextStroke: `1px ${COLORS.ink}`,
              padding: "20px 40px",
              borderRadius: 22,
              letterSpacing: 2,
              boxShadow: `12px 12px 0 ${COLORS.blue}`,
              whiteSpace: "nowrap",
            }}
          >
            NEW DROP EVERY WEEK{"  "}·{"  "}SUBSCRIBE
          </div>
        </div>

        {/* nudging arrow under the subscribe pill */}
        <svg
          width={90}
          height={110}
          viewBox="0 0 90 110"
          style={{
            marginTop: 30,
            transform: `translateY(${arrowNudge}px)`,
            opacity: subOp,
          }}
        >
          <path
            d="M45 8 L45 74 M18 50 L45 82 L72 50"
            fill="none"
            stroke={COLORS.ink}
            strokeWidth={14}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
