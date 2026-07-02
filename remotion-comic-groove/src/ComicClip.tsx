import React from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import {
  TransitionSeries,
  linearTiming,
  springTiming,
} from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import { flip } from "@remotion/transitions/flip";
import { clockWipe } from "@remotion/transitions/clock-wipe";
import { iris } from "@remotion/transitions/iris";

import { COLORS } from "./theme";

// Each scene was authored as its own self-contained module (one agent per scene).
import { Scene1 } from "./scenes/Scene1";
import { Scene2 } from "./scenes/Scene2";
import { Scene3 } from "./scenes/Scene3";
import { Scene4 } from "./scenes/Scene4";
import { Scene5 } from "./scenes/Scene5";
import { Scene6 } from "./scenes/Scene6";
import { Scene7 } from "./scenes/Scene7";
import { Scene8 } from "./scenes/Scene8";
import { Scene9 } from "./scenes/Scene9";
import { Scene10 } from "./scenes/Scene10";

/* ------------------------------------------------------------------ timing */
// Scene lengths + transition lengths drive the composition duration so the
// <Composition durationInFrames> in Root.tsx can never drift out of sync.
export const SCENES = [70, 60, 80, 45, 78, 66, 96, 66, 48, 104];
export const TRANS = [15, 14, 16, 12, 15, 14, 16, 12, 22];
export const CLIP_DURATION =
  SCENES.reduce((a, b) => a + b, 0) - TRANS.reduce((a, b) => a + b, 0);

const spr = (d: number) =>
  springTiming({ durationInFrames: d, config: { damping: 200 } });
const lin = (d: number) => linearTiming({ durationInFrames: d });

/* ------------------------------------------------------------- assembled */
export const ComicClip: React.FC = () => {
  const { width, height } = useVideoConfig();
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.ink }}>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={SCENES[0]}>
          <Scene1 />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={slide({ direction: "from-bottom" })}
          timing={spr(TRANS[0])}
        />
        <TransitionSeries.Sequence durationInFrames={SCENES[1]}>
          <Scene2 />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={wipe({ direction: "from-right" })}
          timing={lin(TRANS[1])}
        />
        <TransitionSeries.Sequence durationInFrames={SCENES[2]}>
          <Scene3 />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition presentation={flip()} timing={lin(TRANS[2])} />
        <TransitionSeries.Sequence durationInFrames={SCENES[3]}>
          <Scene4 />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={clockWipe({ width, height })}
          timing={lin(TRANS[3])}
        />
        <TransitionSeries.Sequence durationInFrames={SCENES[4]}>
          <Scene5 />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition presentation={fade()} timing={lin(TRANS[4])} />
        <TransitionSeries.Sequence durationInFrames={SCENES[5]}>
          <Scene6 />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={slide({ direction: "from-left" })}
          timing={spr(TRANS[5])}
        />
        <TransitionSeries.Sequence durationInFrames={SCENES[6]}>
          <Scene7 />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={iris({ width, height })}
          timing={spr(TRANS[6])}
        />
        <TransitionSeries.Sequence durationInFrames={SCENES[7]}>
          <Scene8 />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition presentation={flip()} timing={lin(TRANS[7])} />
        <TransitionSeries.Sequence durationInFrames={SCENES[8]}>
          <Scene9 />
        </TransitionSeries.Sequence>

        <TransitionSeries.Transition
          presentation={wipe({ direction: "from-top" })}
          timing={spr(TRANS[8])}
        />
        <TransitionSeries.Sequence durationInFrames={SCENES[9]}>
          <Scene10 />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};
