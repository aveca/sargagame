import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { COLORS } from "../theme";
import { bangers } from "../fonts";
import { ComicText, SpeedLines, Starburst, Halftone } from "../primitives";

/* Scene4 — IMPACT HIT.
 * Radial speed lines + spinning starburst + a giant "POW!" that flips in in 3D.
 * ~45 frames @30fps: everything lands hard and fast in the first ~18 frames,
 * then a subtle punch-recoil settle. Bespoke: shockwave ring, ink shards. */
export const Scene4: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Hard camera "impact shake" that decays fast (kinetic hit feel).
  const hit = spring({ frame, fps, config: { damping: 8, mass: 0.5 } });
  const shakeAmp = interpolate(hit, [0, 1], [30, 0]);
  const shakeX = Math.sin(frame * 2.7) * shakeAmp;
  const shakeY = Math.cos(frame * 3.1) * shakeAmp;

  // Whole-frame zoom punch: slams in oversize then settles.
  const zoom = interpolate(hit, [0, 1], [1.25, 1]);

  // Shockwave ring expands + fades.
  const ringP = interpolate(frame, [0, 24], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const ringR = interpolate(ringP, [0, 1], [40, 760]);
  const ringOp = interpolate(ringP, [0, 0.15, 1], [0, 0.9, 0]);
  const ringW = interpolate(ringP, [0, 1], [46, 4]);

  // White flash on the very first frames for the "smack".
  const flash = interpolate(frame, [0, 2, 8], [0.85, 0.5, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Ink shard bursts (bespoke SVG triangles flying outward).
  const shards = Array.from({ length: 12 });

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.red, overflow: "hidden" }}>
      {/* halftone comic texture */}
      <Halftone color={COLORS.ink} size={30} opacity={0.16} speed={0.3} />

      {/* everything that shakes lives inside this transform */}
      <AbsoluteFill
        style={{
          transform: `translate(${shakeX}px, ${shakeY}px) scale(${zoom})`,
        }}
      >
        {/* radial motion streaks */}
        <SpeedLines color={COLORS.ink} count={52} />

        {/* spinning explosion behind the title */}
        <Starburst color={COLORS.yellow} points={18} spin={0.9} scale={1.05} />

        {/* bespoke shockwave ring */}
        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
          <svg viewBox="-540 -960 1080 1920" width="100%" height="100%">
            <circle
              cx={0}
              cy={0}
              r={ringR}
              fill="none"
              stroke={COLORS.paper}
              strokeWidth={ringW}
              opacity={ringOp}
            />
            <circle
              cx={0}
              cy={0}
              r={ringR * 0.72}
              fill="none"
              stroke={COLORS.ink}
              strokeWidth={ringW * 0.6}
              opacity={ringOp * 0.7}
            />
          </svg>
        </AbsoluteFill>

        {/* bespoke ink shards flying out radially */}
        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
          <svg viewBox="-540 -960 1080 1920" width="100%" height="100%">
            {shards.map((_, i) => {
              const a = (2 * Math.PI * i) / shards.length + 0.2;
              const sp = spring({
                frame: frame - 2,
                fps,
                config: { damping: 14, mass: 0.7 },
              });
              const dist = interpolate(sp, [0, 1], [0, 520 + (i % 3) * 90]);
              const cx = Math.cos(a) * dist;
              const cy = Math.sin(a) * dist;
              const sz = 34 + (i % 4) * 10;
              const op = interpolate(frame, [0, 6, 30, 42], [0, 1, 1, 0], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              });
              const rot = frame * (6 + (i % 3) * 4) + i * 30;
              return (
                <g
                  key={i}
                  transform={`translate(${cx} ${cy}) rotate(${rot})`}
                  opacity={op}
                >
                  <polygon
                    points={`0,${-sz} ${sz * 0.7},${sz * 0.6} ${-sz * 0.7},${sz * 0.6}`}
                    fill={i % 2 ? COLORS.ink : COLORS.paper}
                    stroke={COLORS.ink}
                    strokeWidth={4}
                    strokeLinejoin="round"
                  />
                </g>
              );
            })}
          </svg>
        </AbsoluteFill>

        {/* THE giant POW! — flips in in 3D */}
        <AbsoluteFill
          style={{
            justifyContent: "center",
            alignItems: "center",
            padding: "0 80px",
          }}
        >
          <ComicText
            text="POW!"
            fontFamily={bangers}
            size={340}
            color={COLORS.paper}
            stroke={COLORS.ink}
            from="flip"
            stagger={2}
            delay={1}
            letterSpacing={-6}
          />
        </AbsoluteFill>
      </AbsoluteFill>

      {/* impact flash — sits above everything, decays to nothing fast */}
      <AbsoluteFill
        style={{ backgroundColor: COLORS.paper, opacity: flash, pointerEvents: "none" }}
      />

      {/* thick comic ink frame border for panel energy */}
      <AbsoluteFill
        style={{
          border: `18px solid ${COLORS.ink}`,
          boxSizing: "border-box",
          pointerEvents: "none",
        }}
      />
    </AbsoluteFill>
  );
};
