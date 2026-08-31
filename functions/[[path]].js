export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const pathname = url.pathname;

  // 1. Widget embeddable endpoint — GET /widget?token=XXX (inline handling)
  if (url.pathname === '/widget' && url.searchParams.has('token')) {
    const REGION_MAP = {
      'sargasses-martinique.com': 'mq',
      'sargasses-guadeloupe.com': 'gp',
      'sargassummiami.com': 'florida',
      'sargassumpuntacana.com': 'puntacana',
      'sargassumcancun.com': 'rivieramaya',
      'sargazotulum.com': 'tulum',
    };

    function getRegionFromToken(token) {
      try {
        const decoded = atob(token.replace(/-/g, '+').replace(/_/g, '/'));
        return REGION_MAP[decoded] || 'mq';
      } catch {
        return 'mq';
      }
    }

    const token = url.searchParams.get('token');
    const region = getRegionFromToken(token);

    try {
      const response = await fetch(`https://sargasses-martinique.com/api/copernicus/sargassum.json`);
      if (!response.ok) {
        return new Response('Données satellite indisponibles', { status: 503 });
      }
      const data = await response.json();

      if (!data?.levels) {
        return new Response('Aucune plage disponible', { status: 503 });
      }

      const lvls = Object.values(data.levels);
      const filtered = lvls.filter(b => {
        if (region === 'gp') return b.id?.startsWith('gp-');
        if (region === 'florida') return b.id?.startsWith('fl-');
        if (region === 'puntacana') return b.id?.startsWith('pc-');
        if (region === 'rivieramaya') return b.id?.startsWith('rm-');
        if (region === 'tulum') return b.id?.startsWith('tu-');
        return !b.id?.startsWith('gp-');
      });

      if (!filtered.length) {
        return new Response('Aucune plage disponible', { status: 503 });
      }

      const scored = filtered.map(b => {
        const days = data.weekly?.[b.id]?.forecast?.map(d => d.status) || [];
        let score = 100;
        days.forEach(d => { if (d === 'avoid') score -= 30; else if (d === 'moderate') score -= 15; });
        return { ...b, score: Math.max(0, score), days };
      });
      scored.sort((a, b) => b.score - a.score);
      const beach = scored[0];

      if (!beach) {
        return new Response('Aucune plage disponible', { status: 503 });
      }

      const fcDays = (data.weekly?.[beach.id]?.forecast || []).slice(0, 3);
      const beachName = beach.name || 'Plage';
      const STATUS_C = { clean: "#22C55E", moderate: "#B87A00", avoid: "#E8522A" };
      const STATUS_LABEL = {
        clean: { fr: "Propre", en: "Clean", es: "Limpia" },
        moderate: { fr: "Modéré", en: "Moderate", es: "Moderado" },
        avoid: { fr: "À éviter", en: "Avoid", es: "Evitar" },
      };
      const DAY_LABEL = [
        { fr: "Auj", en: "Now", es: "Hoy" },
        { fr: "Demain", en: "Tomorrow", es: "Mañana" },
        { fr: "J+2", en: "+2d", es: "+2d" },
      ];
      const badges = fcDays.map((d, i) => {
        const color = STATUS_C[d.status] || '#5A5A5A';
        const label = DAY_LABEL[i]?.['fr'] || `J+${i}`;
        const statusLabel = STATUS_LABEL[d.status]?.['fr'] || d.status;
        return `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px 14px;border-radius:999px;background:${color};color:white;font:700 11px/1 'Bricolage Grotesque',system-ui,sans-serif;text-transform:uppercase;letter-spacing:.5px;"><span>${label}</span><span style="font-size:10px;opacity:.9">${statusLabel}</span></div>`;
      }).join('');

      const mapSVG = `<svg viewBox="0 0 400 300" style="width:100%;height:100%;display:block;"><defs><linearGradient id="wmSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0B2230"/><stop offset="0.5" stop-color="#155A5A"/><stop offset="1" stop-color="#C97E3A"/></linearGradient><linearGradient id="wmSea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1A5852"/><stop offset="1" stop-color="#08251F"/></linearGradient></defs><rect width="400" height="300" fill="url(#wmSky)"/><ellipse cx="200" cy="180" rx="150" ry="100" fill="url(#wmSea)" opacity="0.9"/><ellipse cx="200" cy="180" rx="80" ry="50" fill="#FFC72C" opacity="0.15"/><circle cx="200" cy="180" r="20" fill="#FFC72C" opacity="0.3"/><text x="200" y="185" text-anchor="middle" font-family="'Anton',system-ui,sans-serif" font-size="24" fill="#FFC72C" opacity="0.8">🏝️</text></svg>`;

      const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SargaGame Widget — ${beachName}</title>
  <meta http-equiv="refresh" content="21600">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Bricolage Grotesque', system-ui, sans-serif; background: white; min-height: 320px; }
    .widget { width: 100%; height: 320px; border-radius: 12px; overflow: hidden; border: 2px solid #0d7f63; background: white; }
    .map-section { height: 200px; position: relative; background: linear-gradient(135deg, #0a5c4a, #0d7f63); display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 16px; }
    .map-section svg { width: 100%; height: 100%; }
    .beach-name { color: white; font: 700 16px/1.2 'Bricolage Grotesque'; text-align: center; text-shadow: 0 2px 8px rgba(0,0,0,0.3); max-width: 90%; }
    .map-label { color: rgba(255,255,255,0.8); font: 500 11px/1 'Bricolage Grotesque'; margin-top: 4px; }
    .badges-section { padding: 12px; display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; }
    .footer { padding: 8px 12px; text-align: center; border-top: 1px solid #eee; background: #fafafa; }
    .footer a { color: #0d7f63; font: 700 11px/1 'Bricolage Grotesque'; text-decoration: none; }
    .footer a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="widget">
    <div class="map-section">
      ${mapSVG}
      <div class="beach-name">${beachName}</div>
      <div class="map-label">Carte interactive — ${['Martinique','Guadeloupe','Florida','Punta Cana','Cancún','Tulum'][['mq','gp','florida','puntacana','rivieramaya','tulum'].indexOf(region)] || 'Région'}</div>
    </div>
    <div class="badges-section">
      ${badges}
    </div>
    <div class="footer">
      <a href="https://${Object.keys(REGION_MAP).find(k => REGION_MAP[k] === region) || 'sargasses-martinique.com'}/b2b" target="_blank" rel="noopener">
        Powered by SargaGame — Get this widget →
      </a>
    </div>
  </div>
</body>
</html>`;
      return new Response(html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    } catch (err) {
      console.error('Widget error:', err.message);
      return new Response('Erreur interne', { status: 500 });
    }
  }

  // 2. Laisser passer les assets statiques vers le serveur static
  const assetPatterns = /\.(js|css|png|jpg|jpeg|svg|ico|woff2?|webp|avif)$/;
  if (pathname.match(assetPatterns)) {
    return env.ASSETS.fetch(new Request(new URL(pathname, request.url), request));
  }

  // 3. Laisser passer les routes API vers Workers
  if (pathname.startsWith('/api/')) {
    return env.ASSETS.fetch(new Request(new URL(pathname, request.url), request));
  }

  // 4. Laisser passer les routes widget vers la Function dédiée
  if (pathname.startsWith('/widget')) {
    return env.ASSETS.fetch(new Request(new URL(pathname, request.url), request));
  }

  // 5. SPA fallback : servir index.html pour tout le reste
  return env.ASSETS.fetch(new Request(new URL('/index.html', request.url), request));
}