// « Le jour qui bascule » — Clip Remotion 25s, 9:16, sous-titré, coupe courte
// Suivent la colonne vertébrale 6 temps (B2C = B2B) :
// 1. Constat concret & personnel — sa plage, sa date
// 2. Cadeau / preuve AVANT l'ask — verdict du jour, toujours gratuit
// 3. Douleur en UNE phrase — personne n'aime découvrir les algues une fois la serviette posée
// 4. Renversement de statut — on vend un statut social, pas un abonnement
// 5. Honnêteté auditée = preuve — on publie nos erreurs sur /fiabilite/
// 6. Offre sans friction — un seul CTA self-serve, prix tôt, zéro call
// 7. Signature Le Veilleur — il regarde la mer, jamais vos clients
// 25s à 30 fps = 750 frames = 7 scènes × ~107 frames (~3.5s chacune)
// Format vertical 9:16 (1080×1920) — sous-titré, coupe courte, rythme clip
import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { loadFont } from "@remotion/google-fonts/Anton";

const { fontFamily: ANTON } = loadFont();
const INK = "#0A1714";
const GOLD = "#FFC72C";
const GOLD_LIGHT = "#FFE47A";
const TEAL = "#009E8E";
const CLEAN = "#22C55E";
const AVOID = "#E8522A";
const MODERATE = "#B87A00";

const FADE_F = 8; // ~0.27s à 30fps — fondus rapides style clip

export type Cue = { startF: number; endF: number; text: string; lang: "fr" | "en" | "es" };
export type Scene = {
  id: string;
  type: "card" | "photo";
  durF: number;
  voice: string | null;
  img: string | null;
  dark?: boolean;
  glyph?: boolean;
  overlay?: {
    overline?: string;
    title?: string;
    sub?: string;
  };
  card?: {
    overline?: string;
    title?: string;
    sub?: string;
  };
  cues?: Cue[];
};
export type LeJourQuiBasculeProps = {
  lang: "fr" | "en" | "es";
  region: string;
  beachName: string;
  date: string;
};

const t = (lang: "fr" | "en" | "es", fr: string, en: string, es: string) =>
  lang === "es" ? es : lang === "en" ? en : fr;

const Lines: React.FC<{ text?: string }> = ({ text }) => (
  <>
    {String(text || "")
      .split("\n")
      .map((l, i) => (
        <div key={i}>{l}</div>
      ))}
  </>
);

// Sky background — golden-hour gradient
const SkyBg: React.FC = () => (
  <svg
    viewBox="0 0 1080 1920"
    width="100%"
    height="100%"
    style={{ position: "absolute", inset: 0 }}
    preserveAspectRatio="xMidYMid slice"
  >
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#0B2230" />
        <stop offset=".42" stopColor="#155A5A" />
        <stop offset=".74" stopColor="#C97E3A" />
        <stop offset="1" stopColor="#F2B05E" />
      </linearGradient>
      <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#1A5852" />
        <stop offset=".55" stopColor="#0F3B34" />
        <stop offset="1" stopColor="#08251F" />
      </linearGradient>
      <radialGradient id="sun" cx="74%" cy="26%" r="46%">
        <stop offset="0" stopColor="#FFF6E0" stopOpacity=".9" />
        <stop offset=".5" stopColor="#FFD884" stopOpacity=".5" />
        <stop offset="1" stopColor="#F2B05E" stopOpacity="0" />
      </radialGradient>
    </defs>
    <rect x="0" y="0" width="1080" height="1180" fill="url(#sky)" />
    <rect x="0" y="0" width="1080" height="1180" fill="url(#sun)" />
    <rect x="0" y="1120" width="1080" height="800" fill="url(#sea)" />
  </svg>
);

// Veilleur glyph — breathing animation
const VeilleurGlyph: React.FC<{ size?: number }> = ({ size = 260 }) => {
  const frame = useCurrentFrame();
  const breathe = 1 + Math.sin(frame / 40) * 0.035;
  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      style={{
        transform: `scale(${breathe})`,
        filter: "drop-shadow(0 8px 30px rgba(0,0,0,.35))",
      }}
    >
      <defs>
        <radialGradient id="halo" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#FFE6A8" stopOpacity=".6" />
          <stop offset="1" stopColor="#FFE6A8" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g transform="translate(60 60) scale(1.1)">
        <circle cx="0" cy="0" r="42" fill="url(#halo)" />
        <rect x="-58" y="-6" width="34" height="20" rx="3" fill="#163a4f" transform="rotate(-8 -41 4)" />
        <rect x="24" y="-6" width="34" height="20" rx="3" fill="#163a4f" transform="rotate(8 41 4)" />
        <path
          d="M0 -22 C14 -22 22 -14 22 2 C22 18 14 30 0 30 C-14 30 -22 18 -22 2 C-22 -14 -14 -22 0 -22 Z"
          fill="#102622"
          stroke="#FFD884"
          strokeWidth="1.1"
          strokeOpacity=".5"
        />
        <circle cx="0" cy="4" r="15" fill="#0d3a39" />
        <circle cx="0" cy="4" r="15" fill="none" stroke="#E8A800" strokeWidth="2.4" />
        <ellipse cx="0" cy="9" rx="15" ry="9" fill="#102622" />
        <circle cx="2" cy="3" r="5.4" fill="#0a3a39" />
        <circle cx="0.5" cy="1.2" r="2" fill="#cff4ff" />
        <line x1="0" y1="-22" x2="0" y2="-34" stroke="#0e2622" strokeWidth="2.4" />
        <circle cx="0" cy="-36" r="3.4" fill="#22C55E" />
      </g>
    </svg>
  );
};

// Photo scene with Ken Burns zoom
const PhotoScene: React.FC<{ s: Scene; zoomIn: boolean }> = ({ s, zoomIn }) => {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [0, s.durF], zoomIn ? [1, 1.12] : [1.12, 1], {
    extrapolateRight: "clamp",
  });
  const o = s.overlay || {};
  return (
    <AbsoluteFill style={{ background: INK, overflow: "hidden" }}>
      <Img
        src={staticFile(s.img!)}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "center 38%",
          transform: `scale(${scale})`,
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 420,
          background: "linear-gradient(180deg,rgba(10,23,20,.55),rgba(10,23,20,0))",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 1150,
          background:
            "linear-gradient(180deg,rgba(10,23,20,0),rgba(10,23,20,.58) 38%,rgba(10,23,20,.95) 78%)",
        }}
      />
      {s.dark ? <AbsoluteFill style={{ background: "rgba(10,23,20,.34)" }} /> : null}
      <div
        style={{
          position: "absolute",
          left: 64,
          right: 64,
          bottom: 0,
          paddingBottom: 430,
          fontFamily: "Segoe UI, sans-serif",
        }}
      >
        {o.overline ? (
          <div
            style={{
              fontSize: 34,
              fontWeight: 700,
              letterSpacing: ".16em",
              color: "rgba(255,255,255,.75)",
              marginBottom: 18,
              textTransform: "uppercase",
            }}
          >
            {o.overline}
          </div>
        ) : null}
        <div
          style={{
            fontFamily: ANTON,
            fontSize: 132,
            lineHeight: 0.98,
            color: "#fff",
            textTransform: "uppercase",
            letterSpacing: ".01em",
            textShadow: "0 4px 40px rgba(0,0,0,.45)",
            marginBottom: 22,
          }}
        >
          <Lines text={o.title} />
        </div>
        {o.sub ? (
          <div style={{ fontSize: 32, color: "rgba(255,255,255,.78)", maxWidth: 880 }}>
            {o.sub}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

// Card scene with Veilleur glyph
const CardScene: React.FC<{ s: Scene }> = ({ s }) => {
  const frame = useCurrentFrame();
  const scale = interpolate(frame, [0, s.durF], [1, 1.04], { extrapolateRight: "clamp" });
  const c = s.card || {};
  return (
    <AbsoluteFill style={{ background: INK, overflow: "hidden" }}>
      <SkyBg />
      <AbsoluteFill style={{ background: "rgba(6,20,15,.22)" }} />
      <AbsoluteFill style={{ transform: `scale(${scale})` }}>
        {s.glyph ? (
          <div style={{ position: "absolute", top: 190, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
            <VeilleurGlyph />
          </div>
        ) : null}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            justifyContent: s.glyph ? "flex-end" : "center",
            alignItems: "flex-start",
            padding: s.glyph ? "0 64px 420px" : "0 64px",
            fontFamily: "Segoe UI, sans-serif",
          }}
        >
          {c.overline ? (
            <div
              style={{
                fontSize: 34,
                fontWeight: 700,
                letterSpacing: ".16em",
                color: "rgba(255,255,255,.78)",
                marginBottom: 18,
                textTransform: "uppercase",
                textShadow: "0 2px 18px rgba(0,0,0,.35)",
              }}
            >
              {c.overline}
            </div>
          ) : null}
          <div
            style={{
              fontFamily: ANTON,
              fontSize: 132,
              lineHeight: 0.98,
              color: "#fff",
              textTransform: "uppercase",
              letterSpacing: ".01em",
              textShadow: "0 4px 34px rgba(0,0,0,.4)",
            }}
          >
            <Lines text={c.title} />
          </div>
          {c.sub ? (
            <div
              style={{
                fontSize: 34,
                color: "rgba(255,255,255,.72)",
                marginTop: 24,
                maxWidth: 880,
                textShadow: "0 2px 18px rgba(0,0,0,.35)",
              }}
            >
              {c.sub}
            </div>
          ) : null}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const SceneFade: React.FC<{ durF: number; children: React.ReactNode }> = ({ durF, children }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(
    frame,
    [0, FADE_F, Math.max(FADE_F + 1, durF - FADE_F), durF],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  return <AbsoluteFill style={{ opacity, background: INK }}>{children}</AbsoluteFill>;
};

const Captions: React.FC<{ cues: Cue[]; lang: "fr" | "en" | "es" }> = ({ cues, lang }) => {
  const frame = useCurrentFrame();
  const cue = cues.find((c) => frame >= c.startF && frame < c.endF && c.lang === lang);
  if (!cue) return null;
  return (
    <div
      style={{
        position: "absolute",
        bottom: 200,
        left: 50,
        right: 50,
        textAlign: "center",
        fontFamily: "Segoe UI, sans-serif",
        fontWeight: 900,
        fontSize: 58,
        lineHeight: 1.2,
        color: "#fff",
        textShadow:
          "0 0 14px rgba(0,0,0,.75), 0 3px 6px rgba(0,0,0,.85), 0 0 3px rgba(0,0,0,.9)",
      }}
    >
      {cue.text}
    </div>
  );
};

// ─── 7 SCÈNES SUIVANT LA COLONNE VERTÉBRALE 6 TEMPS ───

const getScenes = (props: LeJourQuiBasculeProps): Scene[] => {
  const { lang, region, beachName, date } = props;
  const isFR = lang === "fr";
  const isEN = lang === "en";
  const isES = lang === "es";

  const T = (fr: string, en: string, es: string) => (isFR ? fr : isEN ? en : es);

  const DUR = 107; // ~3.57s per scene at 30fps = 750/7 ≈ 107 frames
  const CUES: Cue[] = [];

  let frameCursor = 0;
  const addCue = (startOffset: number, duration: number, text: string) => {
    CUES.push({
      startF: frameCursor + startOffset,
      endF: frameCursor + startOffset + duration,
      text,
      lang,
    });
  };

  // Scène 1 — CONSTAT CONCRET & PERSONNEL
  addCue(10, 80, T(
    `Aujourd'hui, ${props.date}. Tu regardes ${props.beachName}.`,
    `Today, ${props.date}. You're looking at ${props.beachName}.`,
    `Hoy, ${props.date}. Miras ${props.beachName}.`
  ));
  addCue(90, 80, T(
    "Le vent tourne ce soir. La mer change.",
    "The wind turns tonight. The sea changes.",
    "El viento gira esta noche. El mar cambia."
  ));
  frameCursor += 107;

  // Scène 2 — CADEAU / PREUVE AVANT L'ASK
  addCue(10, 80, T(
    "Le verdict du jour : GRATUIT. Toujours.",
    "Today's verdict: FREE. Always.",
    "El veredicto de hoy: GRATIS. Siempre."
  ));
  addCue(90, 80, T(
    "On te le donne avant de te demander quoi que ce soit.",
    "We give it to you before asking anything.",
    "Te lo damos antes de pedir nada."
  ));
  frameCursor += 107;

  // Scène 3 — DOULEUR EN UNE PHRASE
  addCue(10, 90, T(
    "Personne n'aime découvrir les algues une fois la serviette posée.",
    "No one likes discovering seaweed once the towel is down.",
    "A nadie le gusta descubrir el alga una vez puesta la toalla."
  ));
  addCue(100, 90, T(
    "C'est ça, la vraie déception.",
    "That's the real disappointment.",
    "Esa es la verdadera decepción."
  ));
  frameCursor += 107;

  // Scène 4 — RENVERSÉMENT DE STATUT
  addCue(10, 80, T(
    "Celui qui connaît la fin de l'histoire", "The one who knows the ending", "El que sabe el final"
  ));
  addCue(90, 80, T(
    "avant ses amis.", "before their friends.", "antes que sus amigos."
  ));
  frameCursor += 107;

  // Scène 5 — HONNÊTETÉ AUDITÉE = PREUVE
  addCue(10, 80, T(
    "On publie nos erreurs sur /fiabilite/.",
    "We publish our errors on /reliability/.",
    "Publicamos nuestros errores en /fiabilidad/."
  ));
  addCue(90, 80, T(
    "~76 % toutes saisons. 97 % saison calme. Vérifié.",
    "~76% all seasons. 97% calm season. Verified.",
    "~76 % todas las temporadas. 97 % temporada tranquila. Verificado."
  ));
  frameCursor += 107;

  // Scène 6 — OFFRE SANS FRICTION
  addCue(10, 80, T(
    "7 jours d'avance. Alerte dès que ça change.",
    "7 days ahead. Alert the moment it changes.",
    "7 días de adelanto. Alerta en cuanto cambia."
  ));
  addCue(90, 80, T(
    "Pass unique. 7,99 €. Sans abonnement. Sans engagement.",
    "One-time Pass. $5.99. No subscription. No commitment.",
    "Pass único. $5.99. Sin suscripción. Sin compromiso."
  ));
  frameCursor += 107;

  // Scène 7 — SIGNATURE LE VEILLEUR
  addCue(10, 80, T(
    "Il regarde la mer. Jamais vos clients.",
    "He watches the sea. Never your guests.",
    "Mira el mar. Nunca a tus clientes."
  ));
  addCue(90, 80, T(
    "Sargagame. Ta plage. Ton verdict.",
    "Sargagame. Your beach. Your verdict.",
    "Sargagame. Tu playa. Tu veredicto."
  ));

  const scenes: Scene[] = [
    // 1. CONSTAT
    {
      id: "constat",
      type: "card",
      durF: 107,
      voice: null,
      img: null,
      glyph: true,
      card: {
        overline: T("CONSTAT", "CONSTAT", "CONSTATO"),
        title: T(`Aujourd'hui, ${props.date}`, `Today, ${props.date}`, `Hoy, ${props.date}`),
        sub: T(`Tu regardes ${props.beachName}. Le vent tourne ce soir.`, `You're looking at ${props.beachName}. The wind turns tonight.`, `Miras ${props.beachName}. El viento gira esta noche.`),
      },
      cues: [],
    },
    // 2. CADEAU / PREUVE
    {
      id: "cadeau",
      type: "card",
      durF: 107,
      voice: null,
      img: null,
      card: {
        overline: T("CADEAU", "GIFT", "REGALO"),
        title: T("Verdict du jour : GRATUIT", "Today's verdict: FREE", "Veredicto: GRATIS"),
        sub: T("On te le donne avant de te demander quoi que ce soit.", "We give it to you before asking anything.", "Te lo damos antes de pedir nada."),
      },
      cues: [],
    },
    // 3. DOULEUR
    {
      id: "douleur",
      type: "card",
      durF: 107,
      voice: null,
      img: null,
      dark: true,
      card: {
        overline: T("DOULEUR", "PAIN", "DOLOR"),
        title: T("Personne n'aime découvrir les algues", "No one likes discovering seaweed", "A nadie le gusta descubrir las algas"),
        sub: T("une fois la serviette posée.", "once the towel is down.", "una vez puesta la toalla."),
      },
      cues: [],
    },
    // 4. RENVERSÉMENT
    {
      id: "renversement",
      type: "card",
      durF: 107,
      voice: null,
      img: null,
      card: {
        overline: T("RENVERSEMENT", "REVERSAL", "REVERSO"),
        title: T("Celui qui connaît la fin de l'histoire", "The one who knows the ending", "El que sabe el final"),
        sub: T("avant ses amis. Celui qui ne se trompe jamais de crique.", "before their friends. The one who never picks the wrong cove.", "antes que sus amigos. El que nunca se equivoca de cala."),
      },
      cues: [],
    },
    // 5. HONNÊTETÉ
    {
      id: "honnetete",
      type: "card",
      durF: 107,
      voice: null,
      img: null,
      glyph: true,
      card: {
        overline: T("HONNÊTETÉ", "HONESTY", "HONESTIDAD"),
        title: T("On publie nos erreurs", "We publish our errors", "Publicamos nuestros errores"),
        sub: T("~76 % toutes saisons. 97 % saison calme. Vérifié.", "~76% all seasons. 97% calm season. Verified.", "~76 % todas las temporadas. 97 % temporada tranquila. Verificado."),
      },
      cues: [],
    },
    // 6. OFFRE
    {
      id: "offre",
      type: "card",
      durF: 107,
      voice: null,
      img: null,
      card: {
        overline: T("OFFRE", "OFFER", "OFERTA"),
        title: T("7 jours d'avance. Alerte.", "7 days ahead. Alert.", "7 días de adelanto. Alerta."),
        sub: T("Pass unique. 7,99 €. Sans abonnement.", "One-time Pass. $5.99. No subscription.", "Pass único. $5.99. Sin suscripción."),
      },
      cues: [],
    },
    // 7. SIGNATURE
    {
      id: "signature",
      type: "card",
      durF: 107,
      voice: null,
      img: null,
      glyph: true,
      card: {
        overline: T("LE VEILLEUR", "THE WATCHER", "EL VIGÍA"),
        title: T("Il regarde la mer. Jamais vos clients.", "He watches the sea. Never your guests.", "Mira el mar. Nunca a tus clientes."),
        sub: T("Sargagame. Ta plage. Ton verdict.", "Sargagame. Your beach. Your verdict.", "Sargagame. Tu playa. Tu veredicto."),
      },
      cues: [],
    },
  ];

  // Add cues to each scene
  let cueIndex = 0;
  return scenes.map((s, i) => {
    const sceneCues = CUES.slice(cueIndex, cueIndex + 2);
    cueIndex += 2;
    return { ...s, cues: sceneCues };
  });
};

export const LeJourQuiBascule: React.FC<LeJourQuiBasculeProps> = (props) => {
  const scenes = getScenes(props);
  const { durationInFrames } = useVideoConfig();
  const cues = scenes.flatMap(s => s.cues || []);

  let from = 0;
  const seqs = scenes.map((s, i) => {
    const el = (
      <Sequence key={s.id} from={from} durationInFrames={s.durF} name={s.id}>
        <SceneFade durF={s.durF}>
          {s.type === "card" ? <CardScene s={s} /> : <PhotoScene s={s} zoomIn={i % 2 === 0} />}
        </SceneFade>
        {s.voice ? <Audio src={staticFile(s.voice)} /> : null}
      </Sequence>
    );
    from += s.durF;
    return el;
  });

  return (
    <AbsoluteFill style={{ background: INK }}>
      {seqs}
      <Audio
        src={staticFile("waves.mp3")}
        volume={(f) =>
          interpolate(f, [0, 15, durationInFrames - 20, durationInFrames], [0, 0.3, 0.3, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })
        }
      />
      <Captions cues={cues} lang={props.lang} />
    </AbsoluteFill>
  );
};

export default LeJourQuiBascule;