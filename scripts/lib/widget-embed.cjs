/**
 * widget-embed.cjs
 * SSR renderer for B2B iframe widgets (360x120 responsive mini-dashboard).
 */
const _statusWord = {
  clean: { fr: "PROPRE", en: "CLEAN", es: "LIMPIA" },
  moderate: { fr: "MOD\u00c9R\u00c9", en: "MODERATE", es: "MODERADA" },
  avoid: { fr: "\u00c0 \u00c9VITER", en: "AVOID", es: "EVITAR" }
};

const _colors = {
  clean: { mood: "#22C55E", halo: "#22C55E" },
  moderate: { mood: "#FFC72C", halo: "#E8A800" },
  avoid: { mood: "#E8522A", halo: "#E8522A" }
};

function formatFreshness(ts, lang) {
  if (!ts) return lang === "en" ? "recently updated" : lang === "es" ? "actualizado recientemente" : "mise \u00e0 jour r\u00e9cente";
  const h = (Date.now() - new Date(ts).getTime()) / 3.6e6;
  if (h < 12) {
    if (h < 1) {
      const min = Math.max(1, Math.round(h * 60));
      return lang === "en" ? `LIVE \u00b7 ${min} min ago` : lang === "es" ? `EN DIRECTO \u00b7 hace ${min} min` : `EN DIRECT \u00b7 il y a ${min} min`;
    }
    const hrs = Math.max(1, Math.round(h));
    return lang === "en" ? `LIVE \u00b7 ${hrs}h ago` : lang === "es" ? `EN DIRECTO \u00b7 hace ${hrs}h` : `EN DIRECT \u00b7 il y a ${hrs}h`;
  }
  return lang === "en" ? "checking..." : lang === "es" ? "verificando..." : "v\u00e9rification en cours...";
}

function renderWidget(beach, status, score, updatedAt, lang = "fr", islandCode = "mq") {
  const isMQ = islandCode.toLowerCase() === "mq";
  const domain = isMQ ? "sargasses-martinique.com" : "sargasses-guadeloupe.com";
  const siteName = isMQ ? "Sargasses <span>Martinique</span>" : "Sargasses <span>Guadeloupe</span>";
  
  const st = status || "clean";
  const colors = _colors[st] || _colors.clean;
  const moodColor = colors.mood;
  const haloColor = colors.halo;
  const verdictText = (_statusWord[st] && _statusWord[st][lang]) || _statusWord[st].fr;
  const freshnessLabel = formatFreshness(updatedAt, lang);
  
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@600;800&family=Anton&display=swap" rel="stylesheet">
  <style>
    :root {
      --green: #22C55E;
      --gold: #FFC72C;
      --coral: #E8522A;
      --ink: #06121A;
      --mut: rgba(255,255,255,0.68);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Bricolage Grotesque', sans-serif;
      color: #fff;
      overflow: hidden;
      background: linear-gradient(135deg, #0B2230 0%, #155A5A 60%, #C97E3A 100%);
      width: 100vw;
      height: 100vh;
      display: flex;
      align-items: center;
      padding: 10px 14px;
      position: relative;
    }
    .sun {
      position: absolute;
      top: -30px;
      right: 20px;
      width: 100px;
      height: 100px;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(255,216,132,0.35) 0%, rgba(255,216,132,0) 70%);
      pointer-events: none;
    }
    .sun-core {
      position: absolute;
      top: 5px;
      right: 55px;
      width: 30px;
      height: 30px;
      border-radius: 50%;
      background: #FFF1C4;
      opacity: 0.75;
      pointer-events: none;
    }
    .veilleur-container {
      width: 50px;
      height: 50px;
      flex-shrink: 0;
      margin-right: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .info {
      flex-grow: 1;
      min-width: 0;
    }
    .bname {
      font-size: 13.5px;
      font-weight: 800;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-bottom: 1px;
    }
    .verdict-row {
      display: flex;
      align-items: baseline;
      gap: 6px;
    }
    .verdict {
      font-family: Anton, sans-serif;
      font-size: 19px;
      letter-spacing: -0.01em;
      text-transform: uppercase;
      line-height: 1.1;
    }
    .score {
      font-size: 10.5px;
      color: var(--mut);
      font-weight: 600;
    }
    .fresh {
      font-size: 10px;
      color: var(--mut);
      margin-top: 2px;
    }
    .logo {
      position: absolute;
      bottom: 8px;
      right: 12px;
      font-size: 9px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--mut);
      text-decoration: none;
      opacity: 0.72;
    }
    .logo:hover {
      opacity: 1;
      color: #FFF;
    }
    .logo span {
      color: var(--gold);
    }
  </style>
</head>
<body>
  <div class="sun"></div>
  <div class="sun-core"></div>
  
  <div class="veilleur-container">
    <svg viewBox="0 0 100 100" style="width:100%; height:100%;">
      <g transform="translate(50 50) scale(0.9)">
        <circle cx="0" cy="0" r="44" fill="${haloColor}" opacity="0.12"/>
        <rect x="-42" y="-5" width="26" height="14" rx="2" fill="#163a4f"/>
        <rect x="16" y="-5" width="26" height="14" rx="2" fill="#163a4f"/>
        <path d="M0,-16 C10,-16 16,-10 16,1 C16,12 10,21 0,21 C-10,21 -16,12 -16,1 C-16,-10 -10,-16 0,-16 Z" fill="#102622" stroke="${moodColor}" stroke-width="1.2"/>
        <circle cx="0" cy="3" r="10" fill="#0d3a39"/>
        <circle cx="0" cy="3" r="10" fill="none" stroke="${moodColor}" stroke-width="1.8"/>
        <circle cx="1.5" cy="1" r="1.3" fill="#cff4ff"/>
        <line x1="0" y1="-16" x2="0" y2="-24" stroke="#0e2622" stroke-width="1.8"/>
        <circle cx="0" cy="-25" r="2.2" fill="${moodColor}"/>
      </g>
    </svg>
  </div>
  
  <div class="info">
    <div class="bname">${beach.name}</div>
    <div class="verdict-row">
      <div class="verdict" style="color: ${moodColor}">${verdictText}</div>
      <div class="score">${score != null ? `score ${score}/100` : ''}</div>
    </div>
    <div class="fresh">${freshnessLabel}</div>
  </div>
  
  <a class="logo" href="https://${domain}/" target="_blank">${siteName}</a>
</body>
</html>`;
}

module.exports = { renderWidget };
