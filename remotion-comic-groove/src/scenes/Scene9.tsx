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
 * Scene 9 — GIANT 3D FLIP BADGE.
 * A massive "3D" flips in on the X axis (ComicText from="flip") over an inked
 * comic badge + starburst, halftone behind, radial speed lines, and a punchy
 * "IN YOUR FACE" kicker that slams up from below. ~48 frames @30fps.
 * -------------------------------------------------------------------------- */
export const Scene9: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Whole-badge slam-in: springs up to full scale, then a subtle idle throb.
  const slam = spring({ frame, fps, config: { damping: 11, mass: 0.8 } });
  const badgeScale = interpolate(slam, [0, 1], [0.2, 1]);
  const throb = 1 + Math.sin(frame * 0.5) * 0.014;

  // Badge tilt settles from a hard cock to a jaunty comic lean.
  const tilt = interpolate(slam, [0, 1], [-24, -6]);

  // Kicker "IN YOUR FACE" slams up + settles, delayed behind the flip.
  const kick = spring({ frame: frame - 14, fps, config: { damping: 13, mass: 0.7 } });
  const kickY = interpolate(kick, [0, 1], [140, 0]);
  const kickOp = interpolate(frame - 14, [0, 6], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const kickTilt = interpolate(kick, [0, 1], [10, -2]);

  // Impact flash on the frame the flip lands.
  const flash = interpolate(frame, [3, 9], [0.5, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 50% 42%, #3af0b0 0%, ${COLORS.green} 46%, #0f9e66 100%)`,
        justifyContent: "center",
        alignItems: "center",
        overflow: "hidden",
      }}
    >
      {/* comic dot texture behind everything */}
      <Halftone color={COLORS.ink} size={30} opacity={0.16} speed={0.25} />

      {/* radial whoosh lines pushing the badge toward the viewer */}
      <SpeedLines color={COLORS.ink} count={40} />

      {/* explosion pop behind the badge */}
      <Starburst color={COLORS.yellow} points={18} spin={0.5} scale={1.12} />

      {/* inner starburst layer for depth */}
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        <div style={{ transform: `scale(${badgeScale})`, opacity: 0.85 }}>
          <Starburst color={COLORS.orange} points={12} spin={-0.7} scale={0.72} />
        </div>
      </AbsoluteFill>

      {/* -------- the badge stack -------- */}
      <div
        style={{
          position: "relative",
          transform: `scale(${badgeScale * throb}) rotate(${tilt}deg)`,
          transformOrigin: "center center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 24,
        }}
      >
        {/* ink disc behind the giant word for punch + contrast */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            width: 720,
            height: 720,
            transform: "translate(-50%, -54%)",
            borderRadius: "50%",
            background: COLORS.ink,
            boxShadow: `0 0 0 22px ${COLORS.paper}, 0 0 0 40px ${COLORS.ink}, 26px 34px 0 rgba(0,0,0,0.32)`,
            zIndex: 0,
          }}
        />

        {/* GIANT 3D — flips in on X axis, per-letter spring */}
        <div style={{ position: "relative", zIndex: 2 }}>
          <ComicText
            text="3D"
            fontFamily={anton}
            size={420}
            color={COLORS.yellow}
            stroke={COLORS.ink}
            stagger={5}
            from="flip"
            letterSpacing={-14}
          />
        </div>

        {/* kicker banner "IN YOUR FACE" — slams up under the badge */}
        <div
          style={{
            position: "relative",
            zIndex: 2,
            transform: `translateY(${kickY}px) rotate(${kickTilt}deg)`,
            opacity: kickOp,
          }}
        >
          <div
            style={{
              background: COLORS.red,
              border: `9px solid ${COLORS.ink}`,
              borderRadius: 18,
              padding: "14px 42px",
              boxShadow: `12px 12px 0 ${COLORS.ink}`,
              fontFamily: bangers,
              fontSize: 116,
              lineHeight: 1,
              color: COLORS.paper,
              WebkitTextStroke: `3px ${COLORS.ink}`,
              letterSpacing: 6,
              whiteSpace: "nowrap",
            }}
          >
            IN YOUR FACE
          </div>
        </div>
      </div>

      {/* impact flash overlay */}
      <AbsoluteFill
        style={{
          background: COLORS.paper,
          opacity: flash,
          pointerEvents: "none",
        }}
      />

      {/* subtle vignette for focus */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(circle at 50% 46%, transparent 52%, rgba(0,0,0,0.28) 100%)",
          pointerEvents: "none",
        }}
      />
    </AbsoluteFill>
  );
};
