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
import { GrooveFloor, Halftone, Walker, SpeedLines } from "../primitives";

/* ----------------------------------------------------------------------------
 * Scene6 — WALK THE GROOVE.
 * The Walker bobs along the neon GrooveFloor while a two-line title stamps in.
 * Parallax: far starfield drifts slow, mid speed-streaks push faster, the
 * groove grid scrolls fastest toward the viewer — the eye reads forward motion.
 * -------------------------------------------------------------------------- */
export const Scene6: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Title springs: KEEP drops from top, IT MOVING slides in from the right.
  const keepS = spring({
    frame: frame - 4,
    fps,
    config: { damping: 12, mass: 0.7 },
  });
  const moveS = spring({
    frame: frame - 12,
    fps,
    config: { damping: 13, mass: 0.8 },
  });
  const keepY = interpolate(keepS, [0, 1], [-260, 0]);
  const keepRot = interpolate(keepS, [0, 1], [-10, -3]);
  const moveX = interpolate(moveS, [0, 1], [520, 0]);
  const moveRot = interpolate(moveS, [0, 1], [12, 2.5]);

  // Whole-title breathing pulse so it never sits still.
  const pulse = 1 + Math.sin(frame * 0.28) * 0.02;

  // Far parallax star / halftone drift (slow layer).
  const starDrift = -frame * 0.9;

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(180deg, ${COLORS.blue} 0%, ${COLORS.ink} 78%)`,
        overflow: "hidden",
      }}
    >
      {/* FAR parallax: drifting star specks up in the "sky". */}
      <AbsoluteFill style={{ transform: `translateX(${starDrift}px)` }}>
        <svg viewBox="0 0 1080 1920" width="100%" height="100%">
          {Array.from({ length: 46 }).map((_, i) => {
            const x = (i * 173) % 1080;
            const y = (i * 97) % 760;
            const r = 2 + (i % 3);
            const tw = interpolate((frame + i * 7) % 40, [0, 20, 40], [0.25, 0.85, 0.25]);
            return (
              <circle
                key={i}
                cx={x}
                cy={y}
                r={r}
                fill={i % 4 === 0 ? COLORS.cyan : COLORS.paper}
                opacity={tw}
              />
            );
          })}
        </svg>
      </AbsoluteFill>

      {/* Soft halftone haze on the sky, slow drift = depth. */}
      <Halftone color={COLORS.cyan} size={30} opacity={0.1} speed={0.35} />

      {/* MID parallax: faint radial speed streaks behind everything. */}
      <AbsoluteFill style={{ opacity: 0.28 }}>
        <SpeedLines color={COLORS.cyan} count={30} />
      </AbsoluteFill>

      {/* FAST parallax: the neon groove ground scrolling toward camera. */}
      <GrooveFloor color={COLORS.cyan} glow={COLORS.purple} speed={9} />

      {/* The little character, bobbing along the groove. */}
      <Walker />

      {/* Ground-contact "footstep" pop ring under the Walker for punch. */}
      <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center" }}>
        <div
          style={{
            position: "absolute",
            bottom: "31%",
            width: 160,
            height: 40,
            borderRadius: "50%",
            background: "radial-gradient(closest-side, rgba(40,224,255,0.55), transparent)",
            transform: `scaleX(${1.1 + Math.abs(Math.sin(frame * 0.4)) * 0.5})`,
            filter: "blur(2px)",
          }}
        />
      </AbsoluteFill>

      {/* TITLE BLOCK — two stacked lines, centered, inside safe margins. */}
      <AbsoluteFill
        style={{
          justifyContent: "flex-start",
          alignItems: "center",
          paddingTop: 320,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            transform: `scale(${pulse})`,
          }}
        >
          {/* Line 1 — KEEP */}
          <div
            style={{
              fontFamily: anton,
              fontSize: 230,
              lineHeight: 0.9,
              color: COLORS.yellow,
              WebkitTextStroke: `9px ${COLORS.ink}`,
              paintOrder: "stroke fill",
              textShadow: `10px 12px 0 ${COLORS.ink}`,
              transform: `translateY(${keepY}px) rotate(${keepRot}deg)`,
              opacity: interpolate(keepS, [0, 0.3], [0, 1], {
                extrapolateRight: "clamp",
              }),
              whiteSpace: "nowrap",
            }}
          >
            KEEP
          </div>

          {/* Line 2 — IT MOVING (comic display face, on a red slab) */}
          <div
            style={{
              marginTop: -18,
              transform: `translateX(${moveX}px) rotate(${moveRot}deg)`,
              opacity: interpolate(moveS, [0, 0.3], [0, 1], {
                extrapolateRight: "clamp",
              }),
              background: COLORS.red,
              border: `10px solid ${COLORS.ink}`,
              borderRadius: 22,
              padding: "8px 40px 20px",
              boxShadow: `14px 14px 0 ${COLORS.ink}`,
            }}
          >
            <div
              style={{
                fontFamily: bangers,
                fontSize: 168,
                lineHeight: 1,
                color: COLORS.paper,
                letterSpacing: 6,
                WebkitTextStroke: `5px ${COLORS.ink}`,
                paintOrder: "stroke fill",
                whiteSpace: "nowrap",
              }}
            >
              IT MOVING
            </div>
          </div>
        </div>
      </AbsoluteFill>

      {/* Thin inked vignette frame to seal the comic panel edges. */}
      <AbsoluteFill
        style={{
          boxShadow: `inset 0 0 0 14px ${COLORS.ink}, inset 0 0 180px rgba(0,0,0,0.55)`,
          pointerEvents: "none",
        }}
      />
    </AbsoluteFill>
  );
};
