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
import { Halftone, Panel } from "../primitives";

// Nine onomatopoeia words in the REQUIRED order, laid out in a 3x3 grid.
const WORDS = ["POW", "BAM", "ZAP", "BOOM", "WHAM", "POP", "ZING", "KA!", "BLAM"];

// Per-cell color, cycled through the comic palette (avoid two identical neighbours).
const CELL_COLORS = [
  COLORS.red,
  COLORS.blue,
  COLORS.yellow,
  COLORS.green,
  COLORS.orange,
  COLORS.purple,
  COLORS.cyan,
  COLORS.red,
  COLORS.blue,
];

/* Bespoke jagged "impact burst" that flashes behind each panel as it pops in. */
const CellBurst: React.FC<{ color: string; delay: number }> = ({
  color,
  delay,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 9, mass: 0.5 } });
  const scale = interpolate(s, [0, 1], [0.2, 1.25]);
  const op = interpolate(frame - delay, [0, 4, 16], [0, 0.9, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const pts = 14;
  const path = Array.from({ length: pts * 2 })
    .map((_, i) => {
      const a = (Math.PI / pts) * i;
      const r = i % 2 === 0 ? 150 : 96;
      return `${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r).toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg
      viewBox="-160 -160 320 320"
      style={{
        position: "absolute",
        inset: "-30%",
        width: "160%",
        height: "160%",
        transform: `scale(${scale}) rotate(${(frame - delay) * 4}deg)`,
        opacity: op,
        pointerEvents: "none",
      }}
    >
      <polygon points={path} fill={color} stroke={COLORS.ink} strokeWidth={6} strokeLinejoin="round" />
    </svg>
  );
};

/* One grid cell = impact burst + the shared Panel primitive, tilted per index. */
const GridCell: React.FC<{ word: string; color: string; delay: number }> = ({
  word,
  color,
  delay,
}) => {
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <CellBurst color={PALETTE[(delay + 2) % PALETTE.length]} delay={delay} />
      <Panel word={word} color={color} fontFamily={bangers} delay={delay} />
    </div>
  );
};

export const Scene3: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Whole grid gently overshoots into place, then a subtle breathing shudder.
  const enter = spring({ frame, fps, config: { damping: 14, mass: 0.7 } });
  const gridScale = interpolate(enter, [0, 1], [0.86, 1]);
  const shudder = Math.sin(frame * 0.5) * 0.4 * interpolate(enter, [0, 1], [0, 1]);

  // Title strap slides down from the top.
  const titleS = spring({ frame: frame - 2, fps, config: { damping: 13 } });
  const titleY = interpolate(titleS, [0, 1], [-140, 0]);

  const STAGGER = 6; // frames between each panel pop → ~54f to fill, fits ~80f budget.

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.paper, overflow: "hidden" }}>
      {/* Halftone comic texture drifting behind everything. */}
      <Halftone color={COLORS.ink} size={30} opacity={0.14} speed={0.25} />
      <Halftone color={COLORS.red} size={64} opacity={0.06} speed={-0.15} />

      {/* Thick comic page border. */}
      <AbsoluteFill
        style={{
          border: `18px solid ${COLORS.ink}`,
          borderRadius: 8,
          pointerEvents: "none",
        }}
      />

      {/* Title strap. */}
      <div
        style={{
          position: "absolute",
          top: 150,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          transform: `translateY(${titleY}px) rotate(-2deg)`,
        }}
      >
        <div
          style={{
            fontFamily: anton,
            fontSize: 116,
            letterSpacing: 4,
            color: COLORS.yellow,
            background: COLORS.ink,
            padding: "10px 46px",
            WebkitTextStroke: `2px ${COLORS.ink}`,
            textShadow: `7px 8px 0 ${COLORS.red}`,
            border: `6px solid ${COLORS.paper}`,
            boxShadow: `12px 12px 0 ${COLORS.ink}`,
            whiteSpace: "nowrap",
          }}
        >
          FIGHT!
        </div>
      </div>

      {/* The 3x3 comic panel grid. */}
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gridTemplateRows: "repeat(3, 1fr)",
            gap: 26,
            width: 920,
            height: 920,
            marginTop: 90,
            transform: `scale(${gridScale}) rotate(${shudder}deg)`,
            transformOrigin: "center center",
          }}
        >
          {WORDS.map((word, i) => (
            <GridCell
              key={word}
              word={word}
              color={CELL_COLORS[i]}
              delay={i * STAGGER}
            />
          ))}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
