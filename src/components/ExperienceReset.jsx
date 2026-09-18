/**
 * ExperienceReset — PRODUCT UX RESET (2026-09-15)
 * Nouvelle IA mobile-first : ACCUEIL / PLAGES / CARTE / MA PLAGE / PASS
 * 100 % data réelle (allBeaches + sargData). Zéro invention.
 * Rollback global : ?newia=0 (géré par l'appelant).
 */
import { useMemo, useState } from 'react';
import { haversineKm, findAlternatives } from '../lib/beach-decision.js';

export const GOLD = '#FFC72C';
const INK = '#0d0b14';

function _t(lang, fr, en, es) { return lang === 'es' ? es : lang === 'en' ? en : fr; }

export function statusMeta(status, lang) {
  if (status === 'clean') return { label: _t(lang, 'Propre', 'Clean', 'Limpia'), bg: '#E4F6EC', fg: '#0B6B3A', dot: '#00B086' };
  if (status === 'moderate') return { label: _t(lang, 'Risque', 'Caution', 'Riesgo'), bg: '#FFF3D6', fg: '#8a5a00', dot: '#E8A800' };
  if (status === 'avoid') return { label: _t(lang, 'À éviter', 'Avoid', 'Evitar'), bg: '#FDE7DF', fg: '#A32E12', dot: '#E8512A' };
  return { label: _t(lang, 'Bientôt', 'Soon', 'Pronto'), bg: '#eee', fg: '#555', dot: '#999' };
}

function freshness(ts, lang) {
  if (!ts) return null;
  const h = (Date.now() - new Date(ts).getTime()) / 3.6e6;
  if (h < 0) return null;
  if (h < 12) return _t(lang, `Satellite il y a ${Math.max(1, Math.round(h))} h`, `Satellite ${Math.max(1, Math.round(h))}h ago`, `Satélite hace ${Math.max(1, Math.round(h))} h`);
  if (h < 48) return _t(lang, `Mis à jour il y a ${Math.round(h)} h`, `Updated ${Math.round(h)}h ago`, `Actualizado hace ${Math.round(h)} h`);
  return _t(lang, `Données de ${Math.round(h / 24)} j — restez prudent`, `Data ${Math.round(h / 24)}d old`, `Datos de hace ${Math.round(h / 24)} d`);
}

function distOf(b, userPos) {
  if (!userPos || b.lat == null || b.lng == null) return null;
  try {
    const d = haversineKm(userPos.lat ?? userPos.latitude, userPos.lng ?? userPos.longitude, b.lat, b.lng);
    return Number.isFinite(d) ? d : null;
  } catch { return null; }
}

const shell = { maxWidth: 520, margin: '0 auto', padding: '204px 12px calc(96px + env(safe-area-inset-bottom))', fontFamily: "'Bricolage Grotesque',system-ui,sans-serif", color: '#FFFDF6' };
// VISUAL RESCUE (2026-09-18) : la carte est BLANCHE (#fff) mais le texte nu héritait
// le ink-PAPIER du shell (#FFFDF6, prévu pour le fond sombre) → contraste ~1.02,
// noms/communes/scores INVISIBLES sur Accueil + Plages + Ma Plage (repro Playwright
// local+prod, CR=1.02). On ancre l'encre ici ; la seule carte sombre (HomeDashboard
// hero ligne 101) pose déjà son color:#fff explicite. Rollback global : ?newia=0.
const card = { background: '#fff', color: INK, border: `2px solid ${INK}`, borderRadius: 16, boxShadow: '3px 3px 0 ' + INK, padding: 12 };
const btnGold = { minHeight: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', background: GOLD, color: INK, border: `2.5px solid ${INK}`, borderRadius: 14, boxShadow: `3px 3px 0 ${INK}`, fontWeight: 800, fontSize: 'clamp(15px,4.2vw,17px)', cursor: 'pointer', padding: '12px 16px' };
const btnGhost = { minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: '#fff', color: INK, border: `2px solid ${INK}`, borderRadius: 12, fontWeight: 700, fontSize: 14, cursor: 'pointer', padding: '10px 12px' };
const pill = (m) => ({ display: 'inline-flex', alignItems: 'center', gap: 6, background: m.bg, color: m.fg, borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 800 });
const h2 = { fontFamily: "'Anton',sans-serif", fontWeight: 400, fontSize: 'clamp(20px,5.6vw,26px)', lineHeight: 1.05, margin: '18px 2px 8px', letterSpacing: '.2px', color: '#FFFDF6' };

/* ── ARMURE THÈME (VISUAL RESCUE 2026-09-18) ──
   body.theme-comic (100 % du trafic) force `.theme-comic button{background/color/
   border/box-shadow !important}` (0,1,1) → CTA or repeints en blanc + états actifs
   des filtres (fond INK / GOLD inline) écrasés → actif indiscernable de l'inactif
   (repro Playwright : 11/11 chips blancs). Pattern repo : doublé-classe (0,2,0),
   valeurs = les inline d'origine (zéro redesign), noms SANS "cta" (catch-all
   .theme-comic [class*="cta"]). Les boutons btnGhost (blanc/encre/bord 2px) sont
   déjà quasi identiques sous le skin → non armurés (skin conservé).
   Rollback global : ?newia=0 (tout l'XP off). */
const XP_ARMOR = `
.xp-gold.xp-gold{background:#FFC72C!important;color:#0d0b14!important;border:2.5px solid #0d0b14!important;box-shadow:3px 3px 0 #0d0b14!important;border-radius:14px!important;text-shadow:none!important}
.xp-dark.xp-dark{background:#0d0b14!important;color:#fff!important;border:2.5px solid #0d0b14!important;box-shadow:none!important;border-radius:12px!important;text-shadow:none!important}
.xp-seg-on.xp-seg-on{background:#0d0b14!important;color:#fff!important}
.xp-sort-on.xp-sort-on{background:#FFC72C!important;color:#0d0b14!important}
`;

function ScoreBar({ score }) {
  if (score == null) return null;
  const pct = Math.max(0, Math.min(100, Math.round(score)));
  const c = pct >= 68 ? '#00B086' : pct >= 40 ? '#E8A800' : '#E8512A';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
      <div style={{ flex: 1, height: 8, borderRadius: 99, background: '#eee', border: '1px solid #ddd', overflow: 'hidden' }}>
        <div style={{ width: pct + '%', height: '100%', background: c }} />
      </div>
      <span style={{ fontWeight: 800, fontSize: 13 }}>{pct}</span>
    </div>
  );
}

function BeachCard({ b, lang, userPos, isFav, inCompare, onOpen, onFav, onCompare, showAlt }) {
  const m = statusMeta(b.status, lang);
  const d = distOf(b, userPos);
  const alts = showAlt ? findAlternatives(b, showAlt, { lang, maxAlternatives: 1 }) : [];
  return (
    <article style={{ ...card, marginBottom: 10 }} data-testid="xp-beach-card" data-beach={b.id}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 'clamp(15px,4.4vw,17px)', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.name}</div>
          {!!b.commune && <div style={{ fontSize: 12, opacity: .7 }}>{b.commune}{d != null ? ` · ${d < 1 ? '<1' : d.toFixed(1)} km` : ''}</div>}
        </div>
        <span style={pill(m)}><span style={{ width: 8, height: 8, borderRadius: 99, background: m.dot }} />{m.label}</span>
      </div>
      <ScoreBar score={b.score} />
      {!!b.reason && <div style={{ fontSize: 13, marginTop: 6, opacity: .85 }}>{b.reason}</div>}
      {!!alts.length && <div style={{ fontSize: 12, marginTop: 6 }}>↗ {_t(lang, 'Alternative', 'Alternative', 'Alternativa')} : <b>{alts[0].beach.name}</b> ({alts[0].distanceKm} km)</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button type="button" onClick={() => onOpen?.(b)} className="xp-gold xp-gold" style={{ ...btnGold, flex: 1.4 }} data-testid="xp-open">{_t(lang, 'Voir la fiche →', 'Open →', 'Ver ficha →')}</button>
        <button type="button" onClick={() => onFav?.(b)} aria-pressed={!!isFav} title="favori" style={{ ...btnGhost, flex: '0 0 48px', minWidth: 48, fontSize: 18 }}>{isFav ? '★' : '☆'}</button>
        <button type="button" onClick={() => onCompare?.(b)} aria-pressed={!!inCompare} title="comparer" style={{ ...btnGhost, flex: '0 0 48px', minWidth: 48 }}>⇄</button>
      </div>
    </article>
  );
}

/* ── ACCUEIL : situation du jour + meilleure + découverte ── */
export function HomeDashboard({ lang = 'fr', allBeaches = [], sargData, favorites = [], userPos, islandName, onOpenBeach, onGo, onPremium, track }) {
  const [q, setQ] = useState('');
  const data = useMemo(() => {
    const list = (allBeaches || []).filter(b => b.status && b.score != null);
    const clean = list.filter(b => b.status === 'clean').sort((a, b2) => (b2.score || 0) - (a.score || 0));
    const avoid = list.filter(b => b.status === 'avoid').sort((a, b2) => (b2.score || 0) - (a.score || 0));
    const best = clean[0] || null;
    const worst = avoid[avoid.length - 1] || avoid[0] || null;
    const res = q.trim().length >= 2 ? list.filter(b => (b.name + ' ' + (b.commune || '')).toLowerCase().includes(q.trim().toLowerCase())).slice(0, 5) : [];
    return { list, clean, avoid, best, worst, res, counts: { clean: clean.length, mod: list.filter(b => b.status === 'moderate').length, avoid: avoid.length, total: list.length } };
  }, [allBeaches, q]);
  const fresh = freshness(sargData?.erddapTimestamp || sargData?.updatedAt, lang);
  const favBeaches = useMemo(() => (favorites || []).map(id => allBeaches.find(b => b.id === id)).filter(Boolean).slice(0, 3), [favorites, allBeaches]);
  return (
    <div style={shell} data-testid="xp-home">
      <style>{XP_ARMOR}</style>
      <div style={{ ...card, background: 'linear-gradient(135deg,#0B2230,#123a4d)', color: '#fff', borderColor: INK }}>
        <div style={{ fontSize: 12, fontWeight: 800, opacity: .8 }}>{_t(lang, 'OÙ EN EST-ON AUJOURD\u2019HUI ?', 'TODAY\u2019S SITUATION', 'SITUACIÓN DE HOY')}</div>
        <div style={{ fontFamily: "'Anton',sans-serif", fontSize: 'clamp(24px,7vw,32px)', lineHeight: 1 }}>{islandName || _t(lang, 'La situation du jour', "Today's outlook", 'Situación de hoy')}</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          <span style={pill({ bg: '#E4F6EC', fg: '#0B6B3A' })}>● {data.counts.clean} {_t(lang, 'propres', 'clean', 'limpias')}</span>
          <span style={pill({ bg: '#FFF3D6', fg: '#8a5a00' })}>● {data.counts.mod} {_t(lang, 'à surveiller', 'to watch', 'a vigilar')}</span>
          <span style={pill({ bg: '#FDE7DF', fg: '#A32E12' })}>● {data.counts.avoid} {_t(lang, 'à éviter', 'to avoid', 'a evitar')}</span>
        </div>
        {!!fresh && <div style={{ fontSize: 12, marginTop: 6, opacity: .85 }}>{fresh} · {_t(lang, 'Mesuré au satellite, pas deviné.', 'Satellite-measured, not guessed.', 'Medido por satélite.')}</div>}
        {!!data.best && (
          <div style={{ marginTop: 10, background: GOLD, color: INK, borderRadius: 12, padding: 10, border: `2px solid ${INK}` }}>
            <div style={{ fontSize: 12, fontWeight: 800 }}>★ {_t(lang, 'MEILLEUR CHOIX DU JOUR', 'TOP PICK TODAY', 'MEJOR OPCIÓN DE HOY')}</div>
            <div style={{ fontWeight: 800, fontSize: 'clamp(16px,4.6vw,19px)' }}>{data.best.name}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button type="button" className="xp-dark xp-dark" style={{ ...btnGhost, flex: 1, background: INK, color: '#fff', borderColor: INK }} onClick={() => { try { track?.('sg_home_best_open', { beach_id: data.best.id }); } catch {} onOpenBeach?.(data.best); }} data-testid="xp-best-open">{_t(lang, 'J\u2019y vais →', 'Go →', 'Voy →')}</button>
              <button type="button" style={{ ...btnGhost, flex: 1 }} onClick={() => onGo?.('list')} data-testid="xp-best-more">{_t(lang, 'Voir les autres', 'See others', 'Ver otras')}</button>
            </div>
          </div>
        )}
        <button type="button" className="xp-gold xp-gold" style={{ ...btnGold, marginTop: 10 }} onClick={() => onGo?.('map')} data-testid="xp-explore">{_t(lang, 'Explorer la carte →', 'Explore the map →', 'Explorar el mapa →')}</button>
      </div>

      <h2 style={h2}>{_t(lang, 'Quelle plage veux-tu découvrir ?', 'Which beach today?', '¿Qué playa quieres descubrir?')}</h2>
      <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder={_t(lang, 'Rechercher une plage, une commune…', 'Search a beach…', 'Buscar una playa…')} aria-label="search"
        style={{ width: '100%', minHeight: 48, borderRadius: 12, border: `2px solid ${INK}`, padding: '10px 12px', fontSize: 16 }} data-testid="xp-search" />
      {!!data.res.length && data.res.map(b => (
        <button key={b.id} type="button" onClick={() => onOpenBeach?.(b)} style={{ ...btnGhost, width: '100%', marginTop: 6, justifyContent: 'space-between' }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</span><span>→</span>
        </button>
      ))}

      <h2 style={h2}>{_t(lang, 'À explorer', 'To explore', 'Para explorar')}</h2>
      {data.clean.slice(0, 3).map(b => (
        <BeachCard key={b.id} b={b} lang={lang} userPos={userPos} showAlt={allBeaches}
          isFav={(favorites || []).includes(b.id)} onOpen={onOpenBeach} onFav={(x) => onGo?.('fav', x)} onCompare={(x) => onGo?.('compare', x)} />
      ))}
      {!!data.worst && (
        <div style={{ ...card, marginBottom: 10, background: '#FFF7F0' }}>
          <div style={{ fontWeight: 800, fontSize: 14 }}>⚠ {_t(lang, 'Plage à éviter en ce moment', 'Beach to avoid now', 'Playa a evitar ahora')} : {data.worst.name}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button type="button" style={{ ...btnGhost, flex: 1 }} onClick={() => onOpenBeach?.(data.worst)}>{_t(lang, 'Pourquoi ? →', 'Why? →', '¿Por qué? →')}</button>
            <button type="button" style={{ ...btnGhost, flex: 1 }} onClick={() => onGo?.('list')}>{_t(lang, 'Où aller plutôt', 'Where instead', 'Dónde ir')}</button>
          </div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" style={{ ...btnGhost, flex: 1 }} onClick={() => onGo?.('list')} data-testid="xp-all">🌊 {_t(lang, 'Toutes les plages', 'All beaches', 'Todas las playas')}</button>
        <button type="button" style={{ ...btnGhost, flex: 1 }} onClick={() => onGo?.('map')} data-testid="xp-map">🗺 {_t(lang, 'Carte', 'Map', 'Mapa')}</button>
      </div>

      {!!favBeaches.length && (
        <>
          <h2 style={h2}>{_t(lang, 'Tes suivis', 'Your spots', 'Tus seguidas')}</h2>
          {favBeaches.map(b => { const m = statusMeta(b.status, lang); return (
            <button key={b.id} type="button" onClick={() => onOpenBeach?.(b)} style={{ ...btnGhost, width: '100%', marginBottom: 6, justifyContent: 'space-between' }}>
              <span>★ {b.name}</span><span style={pill(m)}>{m.label}</span>
            </button>); })}
          <button type="button" className="xp-gold xp-gold" style={{ ...btnGold, marginTop: 4 }} onClick={() => onGo?.('suivi')} data-testid="xp-suivi">📍 {_t(lang, 'Ouvrir Ma Plage →', 'Open My Beaches →', 'Abrir Mis playas →')}</button>
        </>
      )}
      <div style={{ ...card, marginTop: 14, background: '#FFFBEB' }}>
        <div style={{ fontWeight: 800 }}>🔭 {_t(lang, 'Le Veilleur surveille pour toi', 'The Watcher keeps watch', 'El Vigía vigila por ti')}</div>
        <div style={{ fontSize: 13, marginTop: 4 }}>{_t(lang, 'Alertes quand ta plage change, prévisions 7 jours et comparateur avec le Pass.', 'Alerts when your beach changes, 7-day forecast and compare with Pass.', 'Alertas cuando tu playa cambia, pronóstico 7 días y comparador con el Pass.')}</div>
        <button type="button" className="xp-gold xp-gold" style={{ ...btnGold, marginTop: 8 }} onClick={() => onPremium?.('home')} data-testid="xp-pass">⭐ {_t(lang, 'Voir le Pass →', 'See Pass →', 'Ver el Pass →')}</button>
      </div>
    </div>
  );
}

/* ── PLAGES : vrai produit (recherche / filtres / tri / favoris / comparer) ── */
export function PlagesExplorer({ lang = 'fr', allBeaches = [], favorites = [], compareIds = [], userPos, onOpenBeach, onToggleFav, onToggleCompare, track }) {
  const [q, setQ] = useState('');
  const [f, setF] = useState('all');
  const [sort, setSort] = useState('score');
  const [onlyFav, setOnlyFav] = useState(false);
  const [act, setAct] = useState('all');
  const list = useMemo(() => {
    let L = (allBeaches || []).filter(b => b.status && b.score != null);
    if (f !== 'all') L = L.filter(b => b.status === f);
    if (onlyFav) L = L.filter(b => (favorites || []).includes(b.id));
    if (act === 'kids') L = L.filter(b => b.kids);
    if (act === 'snorkel') L = L.filter(b => b.snorkel);
    if (act === 'parking') L = L.filter(b => b.parking);
    if (q.trim().length >= 2) L = L.filter(b => (b.name + ' ' + (b.commune || '')).toLowerCase().includes(q.trim().toLowerCase()));
    const withD = L.map(b => ({ b, d: distOf(b, userPos) }));
    if (sort === 'score') withD.sort((a, c) => (c.b.score || 0) - (a.b.score || 0));
    else if (sort === 'dist') withD.sort((a, c) => (a.d ?? 9999) - (c.d ?? 9999));
    else withD.sort((a, c) => String(a.b.name).localeCompare(String(c.b.name)));
    return withD.map(x => x.b);
  }, [allBeaches, q, f, sort, onlyFav, act, favorites, userPos]);
  const seg = (id, label) => (
    <button key={id} type="button" onClick={() => { setF(id); try { track?.('sg_plages_filter', { f: id }); } catch {} }}
      className={f === id ? 'xp-seg-on xp-seg-on' : undefined}
      style={{ minHeight: 44, padding: '8px 12px', borderRadius: 999, border: `2px solid ${INK}`, background: f === id ? INK : '#fff', color: f === id ? '#fff' : INK, fontWeight: 800, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>{label}</button>
  );
  return (
    <div style={shell} data-testid="xp-plages">
      <style>{XP_ARMOR}</style>
      <div style={{ fontFamily: "'Anton',sans-serif", fontSize: 'clamp(24px,7vw,32px)', color: '#FFFDF6' }}>{_t(lang, 'Plages', 'Beaches', 'Playas')} <span style={{ fontSize: 13, fontFamily: "'Bricolage Grotesque',sans-serif", fontWeight: 700, opacity: .7 }}>· {list.length}</span></div>
      <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder={_t(lang, 'Rechercher…', 'Search…', 'Buscar…')}
        style={{ width: '100%', minHeight: 48, borderRadius: 12, border: `2px solid ${INK}`, padding: '10px 12px', fontSize: 16, marginTop: 8 }} data-testid="xp-plages-search" />
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '8px 2px', WebkitOverflowScrolling: 'touch' }}>
        {seg('all', _t(lang, 'Toutes', 'All', 'Todas'))}{seg('clean', _t(lang, 'Propres', 'Clean', 'Limpias'))}{seg('moderate', _t(lang, 'Risque', 'Caution', 'Riesgo'))}{seg('avoid', _t(lang, 'À éviter', 'Avoid', 'Evitar'))}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {[['score', _t(lang, 'Top score', 'Top score', 'Top')], ['dist', _t(lang, 'Distance', 'Distance', 'Distancia')], ['nom', _t(lang, 'A→Z', 'A→Z', 'A→Z')]].map(([id, l]) => (
          <button key={id} type="button" onClick={() => setSort(id)} className={sort === id ? 'xp-sort-on xp-sort-on' : undefined} style={{ minHeight: 44, padding: '8px 12px', borderRadius: 12, border: `2px solid ${INK}`, background: sort === id ? GOLD : '#fff', color: INK, fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>{l}</button>
        ))}
        <button type="button" onClick={() => setOnlyFav(v => !v)} aria-pressed={onlyFav} className={onlyFav ? 'xp-sort-on xp-sort-on' : undefined} style={{ minHeight: 44, padding: '8px 12px', borderRadius: 12, border: `2px solid ${INK}`, background: onlyFav ? GOLD : '#fff', color: INK, fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>★ {_t(lang, 'Suivies', 'Saved', 'Seguidas')}</button>
        {[['all', _t(lang, 'Toutes', 'All', 'Todas')], ['kids', 'Kids'], ['snorkel', 'Snorkel'], ['parking', 'Parking']].map(([id, l]) => (
          <button key={id} type="button" onClick={() => setAct(id)} className={act === id ? 'xp-seg-on xp-seg-on' : undefined} style={{ minHeight: 44, padding: '8px 10px', borderRadius: 12, border: `2px solid ${INK}`, background: act === id ? INK : '#fff', color: act === id ? '#fff' : INK, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>{l}</button>
        ))}
      </div>
      <div style={{ marginTop: 10 }}>
        {!list.length && <div style={{ ...card, textAlign: 'center' }}>{_t(lang, 'Aucune plage avec ces filtres. Élargis la recherche.', 'No beach matches. Widen filters.', 'Ninguna playa coincide.')}</div>}
        {list.slice(0, 40).map(b => (
          <BeachCard key={b.id} b={b} lang={lang} userPos={userPos} showAlt={allBeaches}
            isFav={(favorites || []).includes(b.id)} inCompare={(compareIds || []).includes(b.id)}
            onOpen={onOpenBeach} onFav={onToggleFav} onCompare={onToggleCompare} />
        ))}
        {list.length > 40 && <div style={{ textAlign: 'center', fontSize: 12, opacity: .7, padding: 8 }}>{_t(lang, `+ ${list.length - 40} autres — affine ta recherche`, `+ ${list.length - 40} more`, `+ ${list.length - 40} más`)}</div>}
      </div>
    </div>
  );
}

/* ── COMPARATEUR (2–3 plages, données réelles uniquement) ── */
export function CompareSheet({ lang = 'fr', beaches = [], userPos, onClose, onOpenBeach, onToggleFav, favorites = [] }) {
  if (!beaches.length) return null;
  const best = [...beaches].sort((a, b) => (b.score || 0) - (a.score || 0))[0];
  const row = { display: 'flex', justifyContent: 'space-between', gap: 8, padding: '7px 0', borderTop: '1px solid #eee', fontSize: 13 };
  return (
    <div role="dialog" aria-label="compare" style={{ position: 'fixed', inset: 0, zIndex: 1400, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={onClose} data-testid="xp-compare">
      <div style={{ width: '100%', maxWidth: 560, maxHeight: '88dvh', overflowY: 'auto', background: '#FFFDF6', border: `2.5px solid ${INK}`, borderBottom: 'none', borderRadius: '22px 22px 0 0', padding: '12px 12px calc(16px + env(safe-area-inset-bottom))' }} onClick={e => e.stopPropagation()}>
        <style>{XP_ARMOR}</style>
        <div style={{ width: 44, height: 5, borderRadius: 99, background: '#ddd', margin: '0 auto 8px' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ fontFamily: "'Anton',sans-serif", fontSize: 'clamp(19px,5.4vw,24px)' }}>⇄ {_t(lang, 'Comparer', 'Compare', 'Comparar')} ({beaches.length}/3)</div>
          <button type="button" onClick={onClose} style={{ ...btnGhost, minWidth: 44 }} aria-label="close">✕</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${beaches.length},1fr)`, gap: 8, marginTop: 8 }}>
          {beaches.map(b => { const m = statusMeta(b.status, lang); const d = distOf(b, userPos); return (
            <div key={b.id} style={{ ...card, padding: 10, borderColor: b.id === best?.id ? INK : '#999', background: b.id === best?.id ? '#FFF6D6' : '#fff' }}>
              <div style={{ fontWeight: 800, fontSize: 13, lineHeight: 1.2, minHeight: 32, overflow: 'hidden' }}>{b.id === best?.id ? '★ ' : ''}{b.name}</div>
              <div><span style={pill(m)}>{m.label}</span></div>
              <div style={row}><span>Score</span><b>{b.score ?? '—'}</b></div>
              <div style={row}><span>{_t(lang, 'Confiance', 'Confidence', 'Confianza')}</span><b>{b.confidence ?? '—'}</b></div>
              <div style={row}><span>km</span><b>{d != null ? d.toFixed(1) : '—'}</b></div>
              <div style={row}><span>Kids</span><b>{b.kids ? '✓' : '—'}</b></div>
              <div style={row}><span>Snorkel</span><b>{b.snorkel ? '✓' : '—'}</b></div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <button type="button" style={{ ...btnGhost, flex: 1, minWidth: 44 }} onClick={() => onOpenBeach?.(b)}>→</button>
                <button type="button" style={{ ...btnGhost, flex: 1, minWidth: 44 }} onClick={() => onToggleFav?.(b)}>{(favorites || []).includes(b.id) ? '★' : '☆'}</button>
              </div>
            </div>); })}
        </div>
        {!!best && <button type="button" className="xp-gold xp-gold" style={{ ...btnGold, marginTop: 10 }} onClick={() => onOpenBeach?.(best)}>{_t(lang, `Ouvrir le meilleur : ${best.name} →`, `Open best: ${best.name} →`, `Abrir la mejor: ${best.name} →`)}</button>}
        <div style={{ fontSize: 12, opacity: .7, marginTop: 6, textAlign: 'center' }}>{_t(lang, 'Scores et statuts = mesure satellite du jour.', 'Scores = today\u2019s satellite reading.', 'Puntuaciones = medición satelital de hoy.')}</div>
      </div>
    </div>
  );
}

/* ── Routeur lazy (default export pour lazyWithRetry) ── */
export default function XpRouter(props) {
  const { view = 'home', compareIds = [], allBeaches = [], onCloseCompare, ...rest } = props;
  if (view === 'plages') return <PlagesExplorer {...rest} allBeaches={allBeaches} compareIds={compareIds} />;
  if (view === 'suivi') return <SuiviDashboard {...rest} allBeaches={allBeaches} />;
  if (view === 'compare') {
    const sel = (compareIds || []).map(id => allBeaches.find(b => b.id === id)).filter(Boolean);
    if (!sel.length) return null;
    return <CompareSheet {...rest} beaches={sel} onClose={onCloseCompare} />;
  }
  return <HomeDashboard {...rest} allBeaches={allBeaches} />;
}
export function SuiviDashboard({ lang = 'fr', allBeaches = [], favorites = [], sargData, alertsOn, onToggleAlerts, onOpenBeach, onGoPlages, onPremium, isPremium, track }) {
  const favs = useMemo(() => (favorites || []).map(id => allBeaches.find(b => b.id === id)).filter(Boolean), [favorites, allBeaches]);
  const fresh = freshness(sargData?.erddapTimestamp || sargData?.updatedAt, lang);
  const visited = useMemo(() => { try { return JSON.parse(localStorage.getItem('sg_last_beaches') || '[]').slice(0, 5); } catch { return []; } }, []);
  return (
    <div style={shell} data-testid="xp-suivi">
      <style>{XP_ARMOR}</style>
      <div style={{ fontFamily: "'Anton',sans-serif", fontSize: 'clamp(24px,7vw,32px)', color: '#FFFDF6' }}>📍 {_t(lang, 'Ma Plage', 'My Beaches', 'Mis playas')}</div>
      {!!fresh && <div style={{ fontSize: 12, opacity: .75, color: '#FFFDF6' }}>{fresh}</div>}
      {!favs.length && (
        <div style={{ ...card, textAlign: 'center', marginTop: 10 }}>
          <div style={{ fontSize: 44 }}>🏖</div>
          <div style={{ fontWeight: 800, fontSize: 'clamp(17px,5vw,21px)' }}>{_t(lang, 'Suis ta première plage', 'Follow your first beach', 'Sigue tu primera playa')}</div>
          <div style={{ fontSize: 13, opacity: .8, margin: '4px auto 10px', maxWidth: 300 }}>{_t(lang, 'État du jour, évolution, alertes quand ça change, alternatives quand c\u2019est rouge.', 'Daily status, alerts on change, alternatives when red.', 'Estado diario, alertas y alternativas.')}</div>
          <button type="button" className="xp-gold xp-gold" style={btnGold} onClick={() => onGoPlages?.()} data-testid="xp-suivi-cta">{_t(lang, 'Choisir mes plages →', 'Pick my beaches →', 'Elegir mis playas →')}</button>
        </div>
      )}
      {favs.map(b => {
        const m = statusMeta(b.status, lang);
        const alts = findAlternatives(b, allBeaches, { lang, maxAlternatives: 2 });
        return (
          <div key={b.id} style={{ ...card, marginTop: 10 }} data-testid="xp-suivi-card" data-beach={b.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
              <div><div style={{ fontWeight: 800, fontSize: 'clamp(16px,4.6vw,19px)' }}>★ {b.name}</div>
                <div style={{ fontSize: 12, opacity: .7 }}>{b.commune || ''} · {_t(lang, 'Confiance', 'Confidence', 'Confianza')} {b.confidence ?? '—'}</div></div>
              <span style={pill(m)}>{m.label}</span>
            </div>
            <ScoreBar score={b.score} />
            {!!alts.length && <div style={{ fontSize: 12, marginTop: 6 }}>↗ {_t(lang, 'Si ça tourne mal', 'If it turns', 'Si empeora')} : {alts.map(a => a.beach.name).join(' · ')}</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button type="button" className="xp-gold xp-gold" style={{ ...btnGold, flex: 1 }} onClick={() => onOpenBeach?.(b)}>{_t(lang, 'Ouvrir →', 'Open →', 'Abrir →')}</button>
              <button type="button" style={{ ...btnGhost, flex: 1, minWidth: 44 }} onClick={() => { try { track?.('sg_suivi_alert_toggle', { beach_id: b.id }); } catch {} onToggleAlerts?.(); }}>{alertsOn ? '🔔' : '🔕'} {alertsOn ? 'ON' : 'OFF'}</button>
            </div>
          </div>
        );
      })}
      {!!visited.length && (
        <>
          <h2 style={h2}>{_t(lang, 'Vues récemment', 'Recently viewed', 'Vistas hace poco')}</h2>
          {visited.map(id => { const b = allBeaches.find(x => x.id === id); if (!b) return null; return (
            <button key={id} type="button" onClick={() => onOpenBeach?.(b)} style={{ ...btnGhost, width: '100%', marginBottom: 6, justifyContent: 'space-between' }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.name}</span><span>→</span>
            </button>); })}
        </>
      )}
      <div style={{ ...card, marginTop: 12, background: isPremium ? '#EAFBEF' : '#FFFBEB' }}>
        <div style={{ fontWeight: 800 }}>{isPremium ? '✅ ' + _t(lang, 'Pass actif — surveillance étendue', 'Pass active', 'Pass activo') : '⭐ ' + _t(lang, 'Va plus loin avec le Pass', 'Go further with Pass', 'Ve más lejos con el Pass')}</div>
        <div style={{ fontSize: 13, marginTop: 4 }}>{_t(lang, 'Alertes multi-plages, 7 jours, comparateur complet, historique.', 'Multi-beach alerts, 7 days, full compare, history.', 'Alertas multi-playa, 7 días, comparador, historial.')}</div>
        {!isPremium && <button type="button" className="xp-gold xp-gold" style={{ ...btnGold, marginTop: 8 }} onClick={() => onPremium?.('suivi')}>{_t(lang, 'Voir le Pass →', 'See Pass →', 'Ver el Pass →')}</button>}
      </div>
    </div>
  );
}
