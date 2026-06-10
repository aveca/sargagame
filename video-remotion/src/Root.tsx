import "./index.css";
import { Composition } from "remotion";
import { Brief, BriefProps } from "./Brief";

// Durée pilotée par les props (somme des scènes du storyboard) — le pont
// scripts/video/make-brief-remotion.cjs fournit props.json par région.
export const RemotionRoot: React.FC = () => {
  return (
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
  );
};
