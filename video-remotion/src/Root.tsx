import "./index.css";
import { Composition } from "remotion";
import { Brief, BriefProps } from "./Brief";
import { Vision, VisionProps } from "./Vision";

// Durée pilotée par les props (somme des scènes du storyboard) — le pont
// scripts/video/make-brief-remotion.cjs fournit props.json par région.
export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Brief"
        component={Brief}
        width={1080}
        height={1920}
        fps={30}
        defaultProps={
          {
            wordmark: "SARGASSES MARTINIQUE",
            scenes: [
              {
                id: "demo",
                type: "card",
                durF: 90,
                voice: null,
                img: null,
                card: { overline: "DEMO", title: "Brief\nplage" },
              },
            ],
            cues: [],
          } as BriefProps
        }
        calculateMetadata={({ props }) => ({
          durationInFrames: Math.max(
            30,
            (props.scenes as BriefProps["scenes"]).reduce(
              (a, s) => a + s.durF,
              0,
            ),
          ),
        })}
      />
      {/* Vidéo de vision de marque « Le Veilleur » — manifeste, pas un brief
          quotidien data-driven. Pont : scripts/video/make-vision.cjs */}
      <Composition
        id="Vision"
        component={Vision}
        width={1080}
        height={1920}
        fps={30}
        defaultProps={
          {
            scenes: [
              {
                id: "demo",
                type: "card",
                durF: 90,
                voice: null,
                img: null,
                glyph: true,
                card: { overline: "DEMO", title: "Le Veilleur" },
              },
            ],
            cues: [],
          } as VisionProps
        }
        calculateMetadata={({ props }) => ({
          durationInFrames: Math.max(
            30,
            (props.scenes as VisionProps["scenes"]).reduce(
              (a, s) => a + s.durF,
              0,
            ),
          ),
        })}
      />
    </>
  );
};
