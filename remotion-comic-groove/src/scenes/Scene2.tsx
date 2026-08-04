import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { COLORS } from "../theme";
import { anton } from "../fonts";
import { GrooveFloor, ComicText, SpeedLines, Halftone } from "../primitives";

/**
 * SCENE 2 — "THE GROUND".
 * The neon GrooveFloor scrolls toward the viewer while the two-line title
 * "ON THE" / "GROUND" launches UP out of the floor (ComicText from="bottom").
 * Hero of the "groove ground" motif. ~60 frames @30fps.
 */
export const Scene2: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Camera "impact" settle — a quick punch-in that eases out, so the whole
  // scene reads like it just slammed onto the ground.
  const impact = spring({ frame, fps, config: { damping: 14, mass: 0.8 } });
  const camScale = interpolate(impact, [0, 1], [1.14, 1]);

  // A single ground-shake shudder right as the letters break the surface.
  const shakeEnv = interpolate(frame, [6, 14, 24], [0, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const shakeX = Math.sin(frame * 2.3) * 10 * shakeEnv;
  const shakeY = Math.cos(frame * 2.9) * 7 * shakeEnv;

  // The floor speeds up (rush toward viewer) then settles into a steady groove.
  const floorSpeed = interpolate(frame, [0, 18, 60], [16, 9, 8], {
    extrapolateRight: "clamp",
  });

  // Glow pulse under the horizon that swells when the title lands.
  const glowPulse = interpolate(
    Math.sin(frame * 0.5),
    [-1, 1],
    [0.55, 0.95]
  );

  // Speed-lines burst — punchy at the start, fades to let the floor breathe.
  const speedOp = interpolate(frame, [0, 6, 22], [0, 0.85, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Bottom "dust kick" arc — a bright rim of light where letters erupt.
  const dust = interpolate(frame, [8, 18, 34], [0, 1, 0.35], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.ink, overflow: "hidden" }}>
      {/* deep vertical wash so the horizon glows and the ground reads dark */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(120% 80% at 50% 88%, ${COLORS.purple}55 0%, transparent 55%), linear-gradient(to bottom, ${COLORS.ink} 0%, #14121f 46%, ${COLORS.ink} 100%)`,
        }}
      />

      {/* camera rig: everything shares the impact punch-in + ground shake */}
      <AbsoluteFill
        style={{
          transform: `translate(${shakeX}px, ${shakeY}px) scale(${camScale})`,
          transformOrigin: "50% 82%",
        }}
      >
        {/* THE GROUND — hero neon floor rushing at the viewer */}
        <GrooveFloor
          color={COLORS.cyan}
          glow={COLORS.purple}
          speed={floorSpeed}
        />

        {/* subtle halftone in the sky for comic grain */}
        <Halftone color={COLORS.cyan} size={30} opacity={0.08} speed={0.25} />

        {/* radial burst behind the title as it launches */}
        <AbsoluteFill style={{ opacity: speedOp }}>
          <SpeedLines color={COLORS.yellow} count={40} />
        </AbsoluteFill>

        {/* the light-line seam where the letters break the ground */}
        <div
          style={{
            position: "absolute",
            left: "8%",
            right: "8%",
            top: "56%",
            height: 8,
            borderRadius: 8,
            background: `linear-gradient(90deg, transparent, ${COLORS.cyan}, ${COLORS.paper}, ${COLORS.cyan}, transparent)`,
            filter: "blur(1px)",
            opacity: dust,
            boxShadow: `0 0 60px ${COLORS.cyan}, 0 0 120px ${COLORS.purple}`,
            transform: `scaleX(${0.7 + dust * 0.3})`,
          }}
        />

        {/* TITLE STACK — both lines launch UP from the ground */}
        <AbsoluteFill
          style={{
            justifyContent: "center",
            alignItems: "center",
            paddingBottom: "6%",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 6,
              filter: `drop-shadow(0 0 40px ${COLORS.purple}${Math.round(
                glowPulse * 90
              )
                .toString(16)
                .padStart(2, "0")})`,
            }}
          >
            {/* line 1: smaller kicker, erupts first */}
            <ComicText
              text="ON THE"
              fontFamily={anton}
              size={150}
              color={COLORS.paper}
              stroke={COLORS.ink}
              from="bottom"
              stagger={2}
              delay={2}
              letterSpacing={6}
            />
            {/* line 2: the BIG payoff word, erupts a beat later in neon */}
            <ComicText
              text="GROUND"
              fontFamily={anton}
              size={240}
              color={COLORS.yellow}
              stroke={COLORS.ink}
              from="bottom"
              stagger={3}
              delay={9}
              letterSpacing={2}
            />
          </div>
        </AbsoluteFill>
      </AbsoluteFill>

      {/* fixed foreground vignette to seat the whole scene */}
      <AbsoluteFill
        style={{
          pointerEvents: "none",
          background: `radial-gradient(130% 100% at 50% 40%, transparent 55%, ${COLORS.ink}cc 100%)`,
        }}
      />

      {/* thick comic ink frame */}
      <AbsoluteFill
        style={{
          pointerEvents: "none",
          border: `14px solid ${COLORS.ink}`,
          boxShadow: `inset 0 0 0 6px ${COLORS.paper}22`,
        }}
      />
    </AbsoluteFill>
  );
};
