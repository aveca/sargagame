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
import { Halftone, SpeechBubble } from "../primitives";

/**
 * SCENE 7 — "SPEECH BUBBLES"
 * Two comic bubbles type themselves out one after the other.
 *  - Bubble A ("no play.")  — left-aligned, springs in at frame ~4
 *  - Bubble B ("no lunch.") — right-aligned, springs in ~40 frames later
 * Halftone dot texture drifts behind on a cyan field, with a couple of bespoke
 * comic accents (ink burst + jittery "TALK!" tag) to keep the energy up.
 * Budget: ~96 frames @ 30fps.
 */
export const Scene7: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const BUBBLE_A_DELAY = 4;
  const BUBBLE_B_DELAY = 44; // ~40 frames after the first

  // Whole-scene subtle push-in so the pair feels alive from frame 0.
  const scenePop = spring({ frame, fps, config: { damping: 16, mass: 0.9 } });
  const sceneScale = interpolate(scenePop, [0, 1], [0.9, 1]);

  // Bespoke: a small ink "burst" ring that pings when each bubble lands.
  const burst = (at: number) => {
    const s = spring({ frame: frame - at, fps, config: { damping: 8 } });
    return {
      scale: interpolate(s, [0, 1], [0.2, 1.4]),
      opacity: interpolate(frame - at, [0, 6, 22], [0, 0.9, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      }),
    };
  };
  const burstA = burst(BUBBLE_A_DELAY);
  const burstB = burst(BUBBLE_B_DELAY);

  // Bespoke: jittery "TALK!" tag that snaps in with the second bubble.
  const tagPop = spring({
    frame: frame - (BUBBLE_B_DELAY + 8),
    fps,
    config: { damping: 9, mass: 0.5 },
  });
  const tagJitter = Math.sin(frame * 0.9) * 2.5;

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(120% 90% at 50% 30%, ${COLORS.cyan} 0%, #12b9d6 70%, #0e93ab 100%)`,
        overflow: "hidden",
      }}
    >
      {/* dot texture drifting behind everything */}
      <Halftone color={COLORS.ink} size={30} opacity={0.14} speed={0.35} />

      {/* faint framing ink border so it reads like a comic panel */}
      <div
        style={{
          position: "absolute",
          inset: 46,
          border: `10px solid ${COLORS.ink}`,
          borderRadius: 34,
          opacity: 0.12,
        }}
      />

      {/* ink burst rings that ping under each bubble as it lands */}
      <svg
        viewBox="0 0 1080 1920"
        width="100%"
        height="100%"
        style={{ position: "absolute", inset: 0 }}
      >
        <g
          transform={`translate(310 720) scale(${burstA.scale})`}
          opacity={burstA.opacity}
        >
          <circle r={170} fill="none" stroke={COLORS.ink} strokeWidth={14} />
          {Array.from({ length: 12 }).map((_, i) => {
            const a = (Math.PI * 2 * i) / 12;
            return (
              <line
                key={i}
                x1={Math.cos(a) * 190}
                y1={Math.sin(a) * 190}
                x2={Math.cos(a) * 250}
                y2={Math.sin(a) * 250}
                stroke={COLORS.ink}
                strokeWidth={12}
                strokeLinecap="round"
              />
            );
          })}
        </g>
        <g
          transform={`translate(770 1180) scale(${burstB.scale})`}
          opacity={burstB.opacity}
        >
          <circle r={170} fill="none" stroke={COLORS.ink} strokeWidth={14} />
          {Array.from({ length: 12 }).map((_, i) => {
            const a = (Math.PI * 2 * i) / 12 + 0.25;
            return (
              <line
                key={i}
                x1={Math.cos(a) * 190}
                y1={Math.sin(a) * 190}
                x2={Math.cos(a) * 250}
                y2={Math.sin(a) * 250}
                stroke={COLORS.ink}
                strokeWidth={12}
                strokeLinecap="round"
              />
            );
          })}
        </g>
      </svg>

      {/* the two bubbles, stacked and offset left/right */}
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "stretch",
          padding: "0 90px",
          transform: `scale(${sceneScale})`,
          transformOrigin: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 120,
            width: "100%",
            maxWidth: 900,
            margin: "0 auto",
          }}
        >
          <SpeechBubble
            text="no play."
            fontFamily={bangers}
            color={COLORS.yellow}
            delay={BUBBLE_A_DELAY}
            align="left"
          />
          <SpeechBubble
            text="no lunch."
            fontFamily={bangers}
            color={COLORS.paper}
            delay={BUBBLE_B_DELAY}
            align="right"
          />
        </div>
      </AbsoluteFill>

      {/* bespoke "TALK!" tag snapping in near the top corner with the 2nd line */}
      <div
        style={{
          position: "absolute",
          top: 210,
          right: 120,
          transform: `scale(${interpolate(tagPop, [0, 1], [0, 1])}) rotate(${
            -10 + tagJitter
          }deg)`,
          transformOrigin: "center",
        }}
      >
        <div
          style={{
            fontFamily: anton,
            fontSize: 96,
            color: COLORS.red,
            WebkitTextStroke: `5px ${COLORS.ink}`,
            paintOrder: "stroke fill",
            textShadow: `7px 8px 0 ${COLORS.ink}`,
            letterSpacing: 2,
          }}
        >
          TALK!
        </div>
      </div>
    </AbsoluteFill>
  );
};
