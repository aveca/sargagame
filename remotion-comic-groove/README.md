# Comic Groove — 10-scene 3D pop-culture motion reel

A self-contained [Remotion](https://remotion.dev) project. Vertical 1080×1920 (9:16),
~19s (577 frames @ 30fps), comic-book / pop-culture energy on a neon "groove" ground.

## Run it

```bash
cd remotion-comic-groove
npm install
npm run dev        # opens Remotion Studio — scrub / preview the reel
```

Render to MP4:

```bash
npm run render     # -> out/comic-groove.mp4  (H.264)
```

Single still (for a thumbnail):

```bash
npm run still      # -> out/frame.png  (frame 200)
```

> First `npm install` pulls Chromium for rendering (Remotion bundles it). No other setup.

## The 10 scenes

| # | Scene | Motion | Transition IN |
|---|-------|--------|---------------|
| 1 | **GROOVE** hero | starburst + per-letter 3D spring | — |
| 2 | **ON THE GROUND** | neon perspective floor scrolls, letters launch up | slide ↑ (spring) |
| 3 | **Panel grid** | 9 comic panels pop in (POW/BAM/ZAP…) | wipe ← |
| 4 | **POW!** | speed lines + 3D letter flip | flip |
| 5 | **SPIN IT** | spinning vinyl record | clockWipe |
| 6 | **KEEP IT MOVING** | character walks the groove floor | fade |
| 7 | **"no play. / no lunch."** | typewriter speech bubbles *(your line)* | slide → |
| 8 | **CAPTURE / SENSE / TRACK** | RGB color-cycle + letter-tracking + scanlines *(your words)* | iris |
| 9 | **3D** | giant flip badge | flip |
| 10 | **STACK IT** | CTA + underline swipe (Substack nod) | wipe ↓ |

## Where to edit

- **Copy / scene order / colors** → `src/ComicClip.tsx` (each scene is a small component; the `SCENES` / `TRANS` arrays at the top set durations and auto-compute the composition length).
- **Reusable effects** → `src/primitives.tsx` (`GrooveFloor`, `ComicText`, `Starburst`, `SpeedLines`, `Vinyl`, `SpeechBubble`, `Panel`, `Walker`, `Chromatic`, `Halftone`).
- **Palette / fps / resolution** → `src/theme.ts`. Switch to 1920×1080 by swapping `WIDTH`/`HEIGHT`.
- **Fonts** → `src/fonts.ts` (Bangers + Anton via `@remotion/google-fonts`).

## Notes

- `Chromatic` (RGB-split text) is included in `primitives.tsx` if you want a glitchier
  scene 8 — swap it in for the `ComicText` rows.
- To add a real 3D cube transition: `npm i @remotion-dev/cube-presentation`, then
  `import { cube } from "@remotion-dev/cube-presentation"` and use `cube({ direction: "from-left" })`.
- This project is standalone and **not** wired into the surrounding repo.
