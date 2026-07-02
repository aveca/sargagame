import React from "react";
import { Composition } from "remotion";
import { ComicClip, CLIP_DURATION } from "./ComicClip";
import { VeilleurReel } from "./VeilleurReel";
import { BgReel, BG_DURATION } from "./BgReel";
import { BgReelV, BGV_DURATION } from "./BgReelV";
import { TourVideo, TOUR_DURATION } from "./TourVideo";
import { FPS, WIDTH, HEIGHT } from "./theme";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="ComicGroove"
        component={ComicClip}
        durationInFrames={CLIP_DURATION}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
      <Composition
        id="VeilleurReel"
        component={VeilleurReel}
        durationInFrames={210}
        fps={30}
        width={900}
        height={900}
      />
      <Composition
        id="BgReel"
        component={BgReel}
        durationInFrames={BG_DURATION}
        fps={30}
        width={1280}
        height={720}
      />
      <Composition
        id="BgReelV"
        component={BgReelV}
        durationInFrames={BGV_DURATION}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="TourVideo"
        component={TourVideo}
        durationInFrames={TOUR_DURATION}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
