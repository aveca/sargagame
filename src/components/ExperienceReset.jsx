/**
 * ExperienceReset — PRODUCT UX RESET (2026-09-15)
 * Nouvelle IA mobile-first : ACCUEIL / PLAGES / CARTE / MA PLAGE / PASS
 * 100 % data réelle (allBeaches + sargData). Zéro invention.
 * Rollback global : ?newia=0 (géré par l'appelant).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { haversineKm, findAlternatives } from '../lib/beach-decision.js';
import { off as sgmOff } from '../lib/sgMotion.js';
import { INTENTS, intentBeaches, intentById } from '../lib/intents.js';
import { journeyFor } from '../lib/journey.js';
import { beachImageUrl, beachMedia } from '../lib/beach-media.js';
import { evidenceFor, sourceShort } from '../lib/intent-evidence.js';
import { PlanCard, planOff } from './PlanCard.jsx';
import { Icon } from '../lib/sg-icons.jsx';
import useEmblaCarousel from 'embla-carousel-react';

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
@media(min-width:1024px){
[data-testid="xp-home"]{max-width:1000px !important;display:grid !important;grid-template-columns:1fr 1fr !important;gap:0 18px !important;align-items:start !important}
[data-testid="xp-home"]>div:first-of-type,[data-testid="xp-home"]>h2,[data-testid="xp-home"]>input,[data-testid="xp-home"]>[data-testid="xp-home-best"]{grid-column:1/-1 !important}
}
@media(prefers-reduced-motion:reduce){
[data-testid="xp-home"] *{animation:none !important;transition:none !important}
}
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

function BeachCard({ b, lang, userPos, isFav, inCompare, onOpen, onFav, onCompare, showAlt, img = null }) {
  const m = statusMeta(b.status, lang);
  const d = distOf(b, userPos);
  const alts = showAlt ? findAlternatives(b, showAlt, { lang, maxAlternatives: 1 }) : [];
  return (
    <article style={{ ...card, marginBottom: 10, overflow: 'hidden' }} data-testid="xp-beach-card" data-beach={b.id}>
      {/* Photo RÉELLE du lieu (2026-09-25E) : catalogue uniquement, jamais de
          stock. Sans asset → la carte reste texte (état D). */}
      {!!img && (
        <img src={img} alt={`${b.name} — ${b.commune || ''}`} loading="lazy" width="800" height="450"
          style={{ display: 'block', width: 'calc(100% + 24px)', height: 120, objectFit: 'cover', margin: '-12px -12px 10px', borderBottom: `2px solid ${INK}` }}
          onError={e => { e.currentTarget.style.display = 'none' }} />
      )}
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

/* ── HOME WOW — « LE POULS DE LA MER » (2026-09-24) ──────────────────────────
   Workstream HOME/DISCOVERY uniquement. L'interaction signature de Sargagame :
   LA LIGNE DE BALISES — chaque bouée = 1 plage réelle, posée ouest→est
   (longitude réelle, jamais inventée), trio couleur+forme+mot = statut satellite.
   On GLISSE la mer (drag/scroll-snap) : la bouée centrée gonfle et révèle son
   score ; la carte en dessous expose l'ÉTAT LIVE (fraîcheur réelle, confiance,
   raison réelle) ; l'ACTION = ouvrir la fiche. Données 100 % existantes
   (status/score/confidence/commune/lat/lng/reason) — zéro invention, zéro dep.
   Rollback produit : ?sgwow=0 → ancien HomeDashboard (conservé, non retouché). */
const WOW_ARMOR = `
.wow-live-dot{width:9px;height:9px;border-radius:99px;background:#22C55E;display:inline-block;animation:wowpulse 4.2s ease-in-out infinite;box-shadow:0 0 8px rgba(34,197,94,.8)}
@keyframes wowpulse{0%,100%{opacity:1}50%{opacity:.3}}
.wow-rail{display:flex;overflow-x:auto;scroll-snap-type:x proximity;padding:8px calc(50% - 30px) 4px;scrollbar-width:none;-webkit-overflow-scrolling:touch;cursor:grab;touch-action:pan-x pan-y}
.wow-rail::-webkit-scrollbar{display:none}
.wow-rail.wow-grabbing{cursor:grabbing}
.wow-buoy.wow-buoy{background:none!important;border:none!important;box-shadow:none!important;text-shadow:none!important;padding:2px 6px!important;min-height:0!important;min-width:56px!important;width:56px;display:flex;flex-direction:column;align-items:center;gap:3px;scroll-snap-align:center;cursor:pointer;flex:0 0 auto}
.wow-buoy .wow-dot{transition:transform .22s ease,filter .22s ease;display:block}
.wow-buoy[data-on="1"] .wow-dot{transform:scale(1.26);filter:drop-shadow(0 0 7px rgba(255,199,44,.55))}
.wow-buoy .wow-num{font-family:'JetBrains Mono',ui-monospace,SFMono-Regular,monospace;font-size:10px;font-weight:800;color:rgba(255,253,246,.45);transition:color .22s ease,font-size .22s ease}
.wow-buoy[data-on="1"] .wow-num{font-size:13px;color:#FFC72C}
.wow-chip.wow-chip{border:2px solid rgba(13,11,20,.85)!important;box-shadow:2px 2px 0 rgba(13,11,20,.85)!important;text-shadow:none!important;border-radius:999px!important;padding:8px 12px!important;margin:0!important;font-weight:800;font-size:13px;display:inline-flex;align-items:center;gap:7px;cursor:pointer;min-height:44px}
.wow-chip-clean.wow-chip-clean{background:#00B086!important;color:#05281c!important}
.wow-chip-mod.wow-chip-mod{background:#E8A800!important;color:#231a00!important}
.wow-chip-avoid.wow-chip-avoid{background:#E8512A!important;color:#fff!important}
.wow-focus-in{animation:wowpop .24s ease}
@keyframes wowpop{from{opacity:.3;transform:translateY(6px)}to{opacity:1;transform:none}}
.wow-sea-link.wow-sea-link{background:rgba(255,199,44,.1)!important;color:#FFE08A!important;border:1.5px dashed rgba(255,199,44,.55)!important;box-shadow:none!important;border-radius:12px!important;text-shadow:none!important;padding:12px 14px!important;font-weight:800;font-size:14px;min-height:48px;cursor:pointer;width:100%}
.wow-intent.wow-intent{background:#fff!important;color:#0d0b14!important;border:2px solid #0d0b14!important;box-shadow:2px 2px 0 #0d0b14!important;text-shadow:none!important;border-radius:999px!important;padding:8px 13px!important;margin:0!important;font-weight:800;font-size:13px;display:inline-flex;align-items:center;gap:6px;cursor:pointer;min-height:44px}
.wow-intent-on.wow-intent-on{background:#0d0b14!important;color:#FFC72C!important;border-color:#0d0b14!important}
@media (prefers-reduced-motion: reduce){.wow-live-dot{animation:none!important}}
@media(min-width:640px){[data-testid="xp-home"]{--wow-top:calc(150px + env(safe-area-inset-top))}}
@media(min-width:1024px){
 [data-testid="xp-home"]{--wow-top:calc(118px + env(safe-area-inset-top))}
 .wow-home.wow-home{display:grid!important;grid-template-columns:1fr 1fr!important;gap:0 20px!important;align-items:start!important;max-width:1000px!important}
 .wow-home .wow-live{grid-column:1/-1}
 .wow-home .wow-railwrap{grid-column:1/-1}
 .wow-home .wow-focuswrap{grid-column:1}
 .wow-home .wow-tripwrap{grid-column:2}
}
`;
/* Le haut du home doit dégager la RegionNav FIXE par-dessus (z2001) :
   ≤640px ≈ barre + 3 lignes de chips (lot 6) ; la valeur 204px existante est
   conservée en mobile. Le vide 204px sur tablette/desktop était un bug connu. */
const wowShell = { ...shell, padding: 'var(--wow-top, calc(204px + env(safe-area-inset-top))) 12px calc(96px + env(safe-area-inset-bottom))' };

function BuoyGlyph({ status, on }) {
  const fill = status === 'clean' ? '#00B086' : status === 'moderate' ? '#E8A800' : status === 'avoid' ? '#E8512A' : '#8b97a0';
  const inkS = { stroke: '#0d0b14', strokeWidth: 2.6, strokeLinecap: 'round', fill: 'none' };
  return (
    <svg className="wow-dot" width="34" height="40" viewBox="0 0 34 40" aria-hidden="true">
      <path d="M17 4 V1.5" stroke="#FDFCF7" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="17" cy="17" r="13" fill={fill} stroke={on ? '#FFC72C' : '#FDFCF7'} strokeWidth={on ? 3 : 2.5} />
      {status === 'clean' && <g transform="translate(17,17)"><path d="M-6 .5 l4 5 l8.5 -11" {...inkS} /></g>}
      {status === 'moderate' && <g transform="translate(17,17)"><circle r="8.5" fill="none" stroke="#0d0b14" strokeWidth="2.4" /><path d="M0 -8.5 A8.5 8.5 0 0 1 0 8.5 Z" fill="#0d0b14" /></g>}
      {status === 'avoid' && <g transform="translate(17,17)"><path d="M-5.5 -5.5 L5.5 5.5 M5.5 -5.5 L-5.5 5.5" {...inkS} /></g>}
      {status !== 'clean' && status !== 'moderate' && status !== 'avoid' && <g transform="translate(17,17)"><circle r="2.6" fill="#0d0b14" /></g>}
      <ellipse cx="17" cy="36.5" rx="9" ry="2" fill="rgba(255,216,132,.22)" />
    </svg>
  );
}

/* Petite icône de FORME dans les pills (trio couleur+forme+mot, jamais couleur seule) */
function StatusShape({ status, size = 12 }) {
  const c = 'currentColor';
  if (status === 'clean') return <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden="true"><path d="M1.5 6.5 l3 3 l6 -7" fill="none" stroke={c} strokeWidth="2.4" strokeLinecap="round" /></svg>;
  if (status === 'moderate') return <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="4.6" fill="none" stroke={c} strokeWidth="1.8" /><path d="M6 1.4 A4.6 4.6 0 0 1 6 10.6 Z" fill={c} /></svg>;
  if (status === 'avoid') return <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 2.5 L9.5 9.5 M9.5 2.5 L2.5 9.5" stroke={c} strokeWidth="2.4" strokeLinecap="round" fill="none" /></svg>;
  return <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="2.2" fill={c} /></svg>;
}

const _prefersReduced = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; } };

/* LA LIGNE DE BALISES — rail horizontal draggable, snap au centre, la bouée
   centrée devient la plage « en focus ». Desktop : drag souris + molette. */
function SeaRail({ rail, activeIdx, onFocus, onOpen, lang, track, ctrlRef }) {
  const ref = useRef(null);
  const rafRef = useRef(0);
  const dragRef = useRef(null);
  const suppressUntil = useRef(0);
  const activeRef = useRef(activeIdx);
  activeRef.current = activeIdx;
  const onFocusRef = useRef(onFocus);
  onFocusRef.current = onFocus;

  const scrollToIdx = (i, smooth) => {
    const el = ref.current; if (!el) return;
    const c = el.children[i]; if (!c) return;
    el.scrollTo({ left: c.offsetLeft + c.offsetWidth / 2 - el.clientWidth / 2, behavior: (_prefersReduced() || !smooth) ? 'auto' : 'smooth' });
    onFocusRef.current(i);
  };
  /* Contrôleur impératif pour le parent (chips "seek") */
  useEffect(() => { if (ctrlRef) { ctrlRef.current = { scrollToIdx }; return () => { ctrlRef.current = null; }; } });

  /* Centre détecté au scroll (throttle rAF, setState seulement si l'index change) */
  const onScroll = () => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const el = ref.current; if (!el) return;
      const mid = el.scrollLeft + el.clientWidth / 2;
      let best = 0, bd = Infinity;
      for (let i = 0; i < el.children.length; i++) {
        const c = el.children[i];
        const d = Math.abs(c.offsetLeft + c.offsetWidth / 2 - mid);
        if (d < bd) { bd = d; best = i; }
      }
      if (best !== activeRef.current) onFocusRef.current(best);
    });
  };

  /* Drag souris desktop (le tactile est natif) + molette horizontale */
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const onWheel = (e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { e.preventDefault(); el.scrollLeft += e.deltaY; } };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => { el.removeEventListener('wheel', onWheel); cancelAnimationFrame(rafRef.current); };
  }, []);

  /* Position initiale = meilleure plage (scroll instantané, sans anim). Fige la
     1re valeur de focus au mount ; les focus suivants viennent du geste. */
  useEffect(() => { if (rail.length) scrollToIdx(activeRef.current, false); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [rail.length === 0]);

  const onPointerDown = (e) => {
    if (e.pointerType !== 'mouse') return;
    const el = ref.current; if (!el) return;
    dragRef.current = { x: e.clientX, sl: el.scrollLeft, moved: false };
    try { el.setPointerCapture(e.pointerId); } catch (_) {}
  };
  const onPointerMove = (e) => {
    const dr = dragRef.current; const el = ref.current;
    if (!dr || !el) return;
    const dx = e.clientX - dr.x;
    if (Math.abs(dx) > 5) dr.moved = true;
    el.scrollLeft = dr.sl - dx;
    if (dr.moved) el.classList.add('wow-grabbing');
  };
  const endDrag = () => {
    if (dragRef.current && dragRef.current.moved) {
      suppressUntil.current = Date.now() + 120;
      try { track?.('sg_home_rail_drag', { n: rail.length }); } catch (_) {}
    }
    dragRef.current = null;
    ref.current?.classList.remove('wow-grabbing');
  };

  return (
    <div className="wow-railwrap" style={{ margin: '10px -12px 0', borderBottom: '2px dashed rgba(255,216,132,.35)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 14px 2px', fontSize: 10, fontWeight: 800, letterSpacing: '.14em', color: 'rgba(255,216,132,.55)' }} aria-hidden="true">
        <span>{_t(lang, 'OUEST', 'WEST', 'OESTE')}</span><span>{_t(lang, 'EST', 'EAST', 'ESTE')}</span>
      </div>
      <div ref={ref} className="wow-rail" data-testid="wow-rail" role="group"
        aria-label={_t(lang, 'Ligne des balises — glisser pour explorer les plages', 'Buoy line — drag to explore beaches', 'Línea de boyas — desliza para explorar')}
        onScroll={onScroll} onPointerDown={onPointerDown} onPointerMove={onPointerMove}
        onPointerUp={endDrag} onPointerCancel={endDrag}
        onKeyDown={(e) => { if (e.key === 'ArrowRight') scrollToIdx(Math.min(rail.length - 1, activeRef.current + 1), true); if (e.key === 'ArrowLeft') scrollToIdx(Math.max(0, activeRef.current - 1), true); }}
        tabIndex={0}>
        {rail.map((b, i) => (
          <button key={b.id} type="button" data-buoy-i={i} data-beach={b.id} data-testid="wow-buoy"
            className="wow-buoy wow-buoy" data-on={i === activeIdx ? '1' : undefined}
            aria-label={`${b.name} — ${statusMeta(b.status, lang).label}`}
            onClickCapture={(e) => { if (Date.now() < suppressUntil.current) { e.preventDefault(); e.stopPropagation(); } }}
            onClick={() => { if (i === activeRef.current) { try { track?.('sg_home_rail_open', { beach_id: b.id }); } catch (_) {} onOpen?.(b); } else scrollToIdx(i, true); }}>
            <BuoyGlyph status={b.status} on={i === activeIdx} />
            <span className="wow-num">{b.score != null ? Math.round(b.score) : '·'}</span>
          </button>
        ))}
      </div>
      <div style={{ textAlign: 'center', fontSize: 11, color: 'rgba(255,253,246,.55)', padding: '4px 16px 6px' }}>
        {_t(lang, 'Glisse la mer — chaque bouée = une plage mesurée aujourd’hui', 'Drag the sea — each buoy = a beach measured today', 'Desliza el mar — cada boya = una playa medida hoy')}
      </div>
    </div>
  );
}

/* ── ACCUEIL : situation du jour + meilleure + découverte ── */
export function HomeDashboard({ lang = 'fr', allBeaches = [], sargData, favorites = [], userPos, islandName, onOpenBeach, onGo, onPremium, track, onPlanTrip }) {
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
        {data.best ? (

          <div style={{ marginTop: 10, background: GOLD, color: INK, borderRadius: 12, padding: 10, border: `2px solid ${INK}` }}>
            <div style={{ fontSize: 12, fontWeight: 800 }}>★ {_t(lang, 'MEILLEUR CHOIX DU JOUR', 'TOP PICK TODAY', 'MEJOR OPCIÓN DE HOY')}</div>
            <div style={{ fontWeight: 800, fontSize: 'clamp(16px,4.6vw,19px)' }}>{data.best.name}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button type="button" className="xp-dark xp-dark" style={{ ...btnGhost, flex: 1, background: INK, color: '#fff', borderColor: INK }} onClick={() => { try { track?.('sg_home_best_open', { beach_id: data.best.id }); } catch {} onOpenBeach?.(data.best); }} data-testid="xp-best-open">{_t(lang, 'J\u2019y vais →', 'Go →', 'Voy →')}</button>
              <button type="button" style={{ ...btnGhost, flex: 1 }} onClick={() => onGo?.('list')} data-testid="xp-best-more">{_t(lang, 'Voir les autres', 'See others', 'Ver otras')}</button>
            </div>
          </div>

        ) : (
          <div data-testid="xp-home-best" style={{ marginTop: 10, background: '#FFF7D6', color: INK, borderRadius: 12, padding: 10, border: `2px solid ${INK}` }}>
            <div style={{ fontSize: 12, fontWeight: 800 }}>★ {_t(lang, 'MEILLEUR CHOIX DU JOUR', 'TOP PICK TODAY', 'MEJOR OPCIÓN DE HOY')}</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>{_t(lang, 'Aucune plage propre confirmée aujourd’hui. Vérifie les plages et choisis ton plan B.', 'No clean beach is confirmed today. Check the beaches and choose your Plan B.', 'Ninguna playa limpia está confirmada hoy. Revisa las playas y elige tu plan B.')}</div>
            <button type="button" style={{ ...btnGhost, width: '100%', marginTop: 8 }} onClick={() => onGo?.('list')} data-testid="xp-best-more">{_t(lang, 'Voir les plages →', 'See beaches →', 'Ver las playas →')}</button>
          </div>
        )}
        <button type="button" className="xp-gold xp-gold" style={{ ...btnGold, marginTop: 10 }} onClick={() => onGo?.('map')} data-testid="xp-explore">{_t(lang, 'Explorer la carte →', 'Explore the map →', 'Explorar el mapa →')}</button>
        {/* TRIP — « planifier mon séjour » (MASTER 2026-09-22, rollback ?tripplan=0).
            Entrée intencionnelle home : la promesse « quelles plages ce séjour ». */}
        {!!onPlanTrip && (() => { try { return !/[?&]tripplan=0(?:&|$)/.test(window.location.search) } catch (_) { return true } })() && (
          <button type="button" data-testid="trip-open" onClick={() => { try { track?.('sg_trip_open', { source: 'xp_home' }); } catch {} onPlanTrip(); }}
            style={{ display: 'block', width: '100%', marginTop: 8, background: 'none', border: '1.5px dashed rgba(255,199,44,.55)', borderRadius: 12, padding: '12px 14px', color: '#FFE08A', fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
            {_t(lang, '🗓 Planifier mon séjour — la meilleure plage chaque jour →', '🗓 Plan my stay — best beach each day →', '🗓 Planificar mi estancia — mejor playa cada día →')}
          </button>
        )}
      </div>

      <HomeLower lang={lang} q={q} setQ={setQ} data={data} allBeaches={allBeaches} userPos={userPos}
        favorites={favorites} onOpenBeach={onOpenBeach} onGo={onGo} onPremium={onPremium} track={track} />
    </div>
  );
}

/* ── Bas du home PARTAGÉ (wow + ancien) : recherche / À explorer / pire /
      favoris / Pass. Extrait 2026-09-24 — rendu identique à l'original,
      le rollback ?sgwow=0 garde l'ancien home au pixel près. ── */
function HomeLower({ lang, q, setQ, data, allBeaches, userPos, favorites, onOpenBeach, onGo, onPremium, track, imageMap = null }) {
  const favBeaches = useMemo(() => (favorites || []).map(id => allBeaches.find(b => b.id === id)).filter(Boolean).slice(0, 3), [favorites, allBeaches]);
  return (
    <>
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
          img={beachImageUrl(b.id, imageMap)}
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
        <button type="button" className="xp-gold xp-gold" style={{ ...btnGold, marginTop: 8 }} onClick={() => { try { track?.('sg_perfect_trip_paywall_open', { source: 'home_veilleur_card' }); } catch (_) {} onPremium?.('home'); }} data-testid="xp-pass">⭐ {_t(lang, 'Voir le Pass →', 'See Pass →', 'Ver el Pass →')}</button>
      </div>
    </>
  );
}

/* ── HOME WOW : LIVE STATE (strip + chips seek) → DISCOVERY (ligne de balises)
      → REVEAL (carte focus croisée au drag) → ACTION (fiche / trip / carte). ── */
export function HomeWow({ lang = 'fr', allBeaches = [], sargData, favorites = [], userPos, islandName, onOpenBeach, onGo, onPremium, track, onPlanTrip, forecastById = null, imageMap = null, heroVids = null, isPremium = false }) {
  const [q, setQ] = useState('');
  const [focusIdx, setFocusIdx] = useState(null);   // null = pas encore touché → bestIdx
  /* PERFECT BEACH TRIP (2026-09-24B) — intentions utilisateur → plages RÉELLES.
     Rollback : ?sgintent=0 (chips absentes). Aucune intention inventée : chaque
     intent se résout via intents.js (flags plage / statut live / coords réels). */
  const [intent, setIntent] = useState(null);
  const intentOff = (() => { try { return /[?&]sgintent=0(?:&|$)/.test(window.location.search); } catch (_) { return false; } })();
  const lastTracked = useRef(null);
  const railCtrl = useRef(null);
  const data = useMemo(() => {
    const list = (allBeaches || []).filter(b => b.status && b.score != null);
    const clean = list.filter(b => b.status === 'clean').sort((a, b2) => (b2.score || 0) - (a.score || 0));
    const avoid = list.filter(b => b.status === 'avoid').sort((a, b2) => (b2.score || 0) - (a.score || 0));
    const best = clean[0] || null;
    const worst = avoid[avoid.length - 1] || avoid[0] || null;
    const res = q.trim().length >= 2 ? list.filter(b => (b.name + ' ' + (b.commune || '')).toLowerCase().includes(q.trim().toLowerCase())).slice(0, 5) : [];
    return { list, clean, avoid, best, worst, res, counts: { clean: clean.length, mod: list.filter(b => b.status === 'moderate').length, avoid: avoid.length, total: list.length } };
  }, [allBeaches, q]);
  /* Rail sous intention : filtré par donnée réelle ; sans intention → tout. */
  const intentList = useMemo(() => (intent ? intentBeaches(intent, data.list, { islandBeaches: data.list }) : data.list), [intent, data.list]);
  const intentBest = useMemo(() => (intentList.filter(b => b.status === 'clean').sort((a, b) => (b.score || 0) - (a.score || 0))[0] || intentList[0] || null), [intentList]);
  /* « Plan du jour » = meilleure plage dans l'intention courante (ou globale) —
     semaine + alternative via journeyFor (même moteur que rail/trip/spine). */
  const planJourney = useMemo(() => {
    if (planOff() || !intentBest || !forecastById) return null;
    try { return journeyFor({ beach: intentBest, forecastById, allBeaches, lang, isPremium }); } catch (_) { return null; }
  }, [intentBest, forecastById, allBeaches, lang, isPremium]);
  /* Ordre réel : ouest → est (longitude), plages sans coords à la fin par score */
  const rail = useMemo(() => [...intentList].sort((a, b) =>
    ((a.lng == null ? 1e9 : a.lng) - (b.lng == null ? 1e9 : b.lng)) || ((b.score || 0) - (a.score || 0))), [intentList]);
  const bestIdx = useMemo(() => { const ref = intent ? intentBest : data.best; return ref ? Math.max(0, rail.findIndex(b => b.id === ref.id)) : 0 }, [rail, intent, intentBest, data.best]);
  const activeIdx = Math.max(0, Math.min(focusIdx ?? bestIdx, rail.length - 1));
  const active = rail.length ? rail[activeIdx] : null;
  const fresh = freshness(sargData?.erddapTimestamp || sargData?.updatedAt, lang);

  if (!data.list.length) return <HomeDashboard lang={lang} allBeaches={allBeaches} sargData={sargData} favorites={favorites} userPos={userPos} islandName={islandName} onOpenBeach={onOpenBeach} onGo={onGo} onPremium={onPremium} track={track} onPlanTrip={onPlanTrip} />;

  /* Focus : d'où qu'il vienne (drag / clic / seek). Le 1er focus (positionnement
     initial sur le top pick) n'est PAS tracké — pas un geste de découverte. */
  const focus = (i) => {
    setFocusIdx(i);
    const b = rail[i];
    if (!b) return;
    if (lastTracked.current == null) { lastTracked.current = b.id; return; }
    if (lastTracked.current !== b.id) {
      lastTracked.current = b.id;
      try { track?.('sg_home_rail_focus', { beach_id: b.id, status: b.status, i }); } catch (_) {}
    }
  };
  const seek = (status) => {
    const i = rail.findIndex(b => b.status === status);
    if (i >= 0) { try { track?.('sg_home_rail_seek', { status }); } catch (_) {} railCtrl.current?.scrollToIdx?.(i, true); }
  };

  const aM = active ? statusMeta(active.status, lang) : null;
  const aD = active ? distOf(active, userPos) : null;
  const aTop = !!(active && data.best && active.id === data.best.id);
  const aAlt = active && active.status === 'avoid' ? findAlternatives(active, rail, { lang, maxAlternatives: 1 })[0] : null;
  const aFav = active && (favorites || []).includes(active.id);
  const tripAllowed = (() => { try { return !/[?&]tripplan=0(?:&|$)/.test(window.location.search); } catch (_) { return true; } })();
  /* SGM (2026-09-24) : la home parle la grammaire de motion centralisée —
     reveal du pouls au 1er paint, canal statut = verdict RÉEL de la bouée
     centrée (couleur = donnée), CTA en sgm-focus APRÈS la révélation.
     Rollback ?sgmotion=0 / reduced-motion : contenu identique, motion off. */
  const SGM = !sgmOff();

  return (
    <div style={wowShell} className="wow-home" data-testid="xp-home">
      <style>{XP_ARMOR}{WOW_ARMOR}</style>

      {/* 0 · CINÉMATIQUE 3.0 (2026-09-25I) — la grande image d'abord : photo
          RÉELLE du meilleur spot (catalogue uniquement), statut live,
          copy d'invitation, UNE action primaire (event existant
          sg_home_best_open). Rollback ?sgcine=0 → layout D inchangé. */}
      {(() => {
        try { if (/[?&]sgcine=0(?:&|$)/.test(window.location.search)) return null } catch (_) {}
        const heroBeach = intentBest || data.best
        const heroImg = heroBeach ? beachImageUrl(heroBeach.id, imageMap) : null
        if (!heroBeach || !heroImg) return null
        const hm = statusMeta(heroBeach.status, lang)
        /* AHA (2026-09-25J) : 3 raisons RÉELLES (evidenceFor, jamais d'absolu)
           + plan B réel (journey). L'utilisateur comprend en <5 s pourquoi
           CETTE plage. */
        const ev = evidenceFor(intent || 'top', heroBeach, lang)
        const reasons = !ev.blocked ? ev.evidence.slice(0, 3) : []
        const planB = planJourney && planJourney.backup ? planJourney.backup : null
        const reduceMotion = (() => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches || sgmOff() } catch (_) { return false } })()
        /* Shared-transition (skill motion) : l'image s'étend (WAAPI 220 ms)
           PUIS la fiche s'ouvre. Garde-fou : jamais de piège (timeout 400),
           reduced-motion = ouverture directe, focus géré par le dialog. */
        const openCine = (e) => {
          try { track?.('sg_home_best_open', { beach_id: heroBeach.id, src: 'cine_hero' }); } catch (_) {}
          const go = () => onOpenBeach?.(heroBeach)
          if (reduceMotion) return go()
          try {
            const img = e?.currentTarget?.closest?.('[data-testid="cine-hero"]')?.querySelector('.t3-hero-media')
            const anim = img?.animate?.(
              [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(1.07)', opacity: .55 }],
              { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' })
            if (!anim || !anim.onfinish) return go()
            let done = false
            anim.onfinish = () => { if (!done) { done = true; go() } }
            setTimeout(() => { if (!done) { done = true; go() } }, 400)
          } catch (_) { go() }
        }
        const scrollPlan = () => {
          try {
            const el = document.querySelector('[data-testid="plan-card"]')
            if (el) el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
          } catch (_) {}
        }
        return (
          <section data-testid="cine-hero" data-beach={heroBeach.id} className={SGM ? 'sgm-reveal' : undefined}
            style={{ marginBottom: 10 }} aria-label={_t(lang, 'Meilleur spot du jour', "Today's top pick", 'Mejor spot de hoy')}>
            <div className="t3-hero t3-hero-full">
              <img src={heroImg} alt={`${heroBeach.name} — ${heroBeach.commune || ''}`} className={`t3-hero-media${SGM ? ' sgm-zoom' : ''}`}
                fetchpriority="high" decoding="async" width="800" height="500"
                onError={e => { e.currentTarget.style.display = 'none' }} />
              <div className="t3-hero-shade" aria-hidden="true" />
              <div className="t3-hero-body">
                <span className="t3-hero-kicker"><span className="wow-live-dot" aria-hidden="true" />{_t(lang, 'EN DIRECT', 'LIVE', 'EN VIVO')}{fresh ? ` · ${fresh}` : ''}</span>
                <h1 className="t3-hero-title">{_t(lang, 'Fais défiler l’île. Trouve ton moment.', 'Scroll the island. Find your moment.', 'Recorre la isla. Encuentra tu momento.')}</h1>
                <p className="t3-hero-sub">
                  {data.list.length ? _t(lang, `${data.list.length} plages observées. Voici celle qui ressort maintenant : `, `${data.list.length} beaches watched. This one stands out now: `, `${data.list.length} playas observadas. Esta destaca ahora: `) : ''}
                  <b>{heroBeach.name}</b>{heroBeach.status ? ` · ${hm.label}` : ''}
                </p>
                {!!reasons.length && (
                  <ul className="t3-reasons" data-testid="cine-reasons">
                    {reasons.map((r, i) => (
                      <li key={i}><span aria-hidden="true" style={{ color: '#7CF5D3', fontWeight: 800 }}>✓</span><span>{r.text} <b>({sourceShort(r.source, lang)})</b></span></li>
                    ))}
                  </ul>
                )}
                {!!planB && (
                  <p className="t3-planb-line" data-testid="cine-planb">
                    {_t(lang, `Plan B : ${planB.name}${planB.distanceKm != null ? ` (${planB.distanceKm} km)` : ''}`, `Plan B: ${planB.name}`, `Plan B: ${planB.name}`)}
                  </p>
                )}
                <div className="t3-hero-actions">
                  <button type="button" data-testid="cine-open" className="t3-hero-cta" onClick={openCine}>
                    {_t(lang, 'Voir mon meilleur spot →', 'See my top pick →', 'Ver mi mejor spot →')}
                  </button>
                  <button type="button" data-testid="cine-plan" className="t3-hero-ghost" onClick={scrollPlan}>
                    {_t(lang, 'Voir le plan ↓', 'See the plan ↓', 'Ver el plan ↓')}
                  </button>
                </div>
                <div className="t3-scroll-cue" aria-hidden="true">↓</div>
              </div>
            </div>
          </section>
        )
      })()}

      {/* 1 · LIVE STATE — la mer est mesurée, maintenant */}
      <section className={`wow-live${SGM ? ' sgm-reveal' : ''}`} style={{ ...card, background: 'linear-gradient(135deg,#0B2230,#123a4d)', color: '#fff', borderColor: INK }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 800, letterSpacing: '.12em' }}>
            <span className="wow-live-dot" />{_t(lang, 'EN DIRECT', 'LIVE', 'EN VIVO')}
          </span>
          {!!fresh && <span style={{ fontSize: 12, opacity: .8 }}>{fresh}</span>}
        </div>
        <div style={{ fontFamily: "'Anton',sans-serif", fontWeight: 400, fontSize: 'clamp(26px,7.4vw,34px)', lineHeight: 1.02, letterSpacing: '.2px', marginTop: 8 }}>
          {_t(lang, 'LE POULS DE LA MER', 'THE SEA\u2019S PULSE', 'EL PULSO DEL MAR')}
        </div>
        <div style={{ fontSize: 13, opacity: .85, marginTop: 2 }}>
          {(islandName || '') + ' · '}{_t(lang, 'Mesuré au satellite, pas deviné.', 'Satellite-measured, not guessed.', 'Medido por satélite.')}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
          <button type="button" className="wow-chip wow-chip wow-chip-clean wow-chip-clean" onClick={() => seek('clean')} data-testid="wow-seek-clean">
            <StatusShape status="clean" />{data.counts.clean} {_t(lang, 'propres', 'clean', 'limpias')}
          </button>
          <button type="button" className="wow-chip wow-chip wow-chip-mod wow-chip-mod" onClick={() => seek('moderate')} data-testid="wow-seek-mod">
            <StatusShape status="moderate" />{data.counts.mod} {_t(lang, 'à surveiller', 'to watch', 'a vigilar')}
          </button>
          <button type="button" className="wow-chip wow-chip wow-chip-avoid wow-chip-avoid" onClick={() => seek('avoid')} data-testid="wow-seek-avoid">
            <StatusShape status="avoid" />{data.counts.avoid} {_t(lang, 'à éviter', 'to avoid', 'a evitar')}
          </button>
        </div>
      </section>

      {/* 1.5 · INTENT — « Quel genre de journée veux-tu ? » : filtre le rail
          par demande utilisateur (données réelles uniquement, cf. intents.js). */}
      {!intentOff && (
        <section data-testid="intent-row" aria-label={_t(lang, 'Quel genre de journée veux-tu ?', 'What kind of day do you want?', '¿Qué tipo de día quieres?')}
          style={{ ...card, background: '#fff', marginTop: 10, padding: '12px 12px 10px' }}>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.06em', textTransform: 'uppercase', opacity: .7, marginBottom: 8 }}>
            {_t(lang, 'Quel genre de journée veux-tu ?', 'What kind of day do you want?', '¿Qué tipo de día quieres?')}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {INTENTS.map(it => {
              const n = intentBeaches(it.id, data.list, { islandBeaches: data.list }).length;
              const on = intent === it.id;
              return (
                <button key={it.id} type="button" data-testid={`intent-${it.id}`} aria-pressed={on}
                  className={on ? 'wow-intent-on wow-intent wow-intent-on' : 'wow-intent wow-intent'}
                  onClick={() => {
                    const next = on ? null : it.id;
                    setIntent(next);
                    setFocusIdx(null);
                    try { track?.('sg_intent_select', { intent: it.id, on: next ? 1 : 0, beaches: n }); } catch (_) {}
                  }}>
                  <Icon name={it.icon} size={14} /> {_t(lang, it.fr, it.en, it.es)} <span style={{ opacity: .65, fontWeight: 800 }}>{n}</span>
                </button>
              );
            })}
          </div>
          {intent && !intentList.length && (
            <div style={{ fontSize: 12, marginTop: 8, color: '#8a5a00' }}>
              {_t(lang, 'Aucune plage ne remonte avec les données actuelles pour ce critère — vérifie demain.', 'No beach matches this criterion with current data — check tomorrow.', 'Ninguna playa coincide con este criterio hoy.')}
            </div>
          )}
          {/* RECOMMANDATION concierge — toujours la VRAIE meilleure plage de
              l'intention (photo réelle du lieu si cataloguée), jamais de stock. */}
          {intent && !!intentBest && (() => {
            const it = intentById(intent)
            const img = beachImageUrl(intentBest.id, imageMap)
            /* Preuve explicable (2026-09-25F) : 1re raison réelle + source.
               Jamais de score affiché comme verdict (le verdict = statut). */
            const ev = evidenceFor(intent, intentBest, lang)
            const why = !ev.blocked && ev.evidence.length > 1 ? ev.evidence[1] : (!ev.blocked && ev.evidence.length ? ev.evidence[0] : null)
            return (
              <div data-testid="intent-reco" style={{ marginTop: 10, display: 'flex', gap: 10, alignItems: 'center', background: '#FFF8E1', border: `2px solid ${INK}`, borderRadius: 12, padding: 10 }}>
                {img && <img src={img} alt={intentBest.name} loading="lazy" width="800" height="450" style={{ width: 64, height: 64, borderRadius: 10, objectFit: 'cover', border: `2px solid ${INK}`, flex: '0 0 auto' }} onError={e => { e.currentTarget.style.display = 'none' }} />}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: '#8a5a00' }}>{_t(lang, `Meilleur spot ${it ? it.fr : ''}`, `Best ${it ? it.en : ''} spot`, `Mejor spot ${it ? it.es : ''}`)}</div>
                  <div style={{ fontWeight: 800, fontSize: 15, lineHeight: 1.15 }}>{intentBest.name}</div>
                  <div style={{ fontSize: 11.5, opacity: .7 }}>{intentBest.commune || ''}{intentBest.status ? ` · ${statusMeta(intentBest.status, lang).label}` : ''}</div>
                  {!!why && <div data-testid="intent-reco-why" style={{ fontSize: 11.5, opacity: .8, marginTop: 2, fontStyle: 'italic' }}>✓ {why.text} <span style={{ opacity: .65, fontStyle: 'normal' }}>({sourceShort(why.source, lang)})</span></div>}
                </div>
                <button type="button" data-testid="intent-reco-open" className="xp-gold xp-gold" style={{ ...btnGold, flex: '0 0 auto', width: 'auto', minHeight: 44, padding: '9px 16px', fontSize: 13 }}
                  onClick={() => { try { track?.('sg_recommendation_open', { beach_id: intentBest.id, intent, source: 'intent_strip' }) } catch (_) {} onOpenBeach?.(intentBest) }}>
                  {_t(lang, 'Voir →', 'Open →', 'Ver →')}
                </button>
              </div>
            )
          })()}
        </section>
      )}

      {/* 2 · DISCOVERY — la ligne de balises (drag) */}
      <SeaRail rail={rail} activeIdx={activeIdx} onFocus={focus} onOpen={onOpenBeach} lang={lang} track={track} ctrlRef={railCtrl} />

      {/* 3 · REVEAL + 4 · ACTION — la carte de la bouée centrée */}
      <div className="wow-focuswrap">
        {active ? (
          <section key={active.id} className="wow-focus-in" style={{ ...card, marginBottom: 10, borderTop: '3px solid var(--sgm-c)' }} aria-live="polite" data-testid="wow-focus" data-beach={active.id} data-sgm-status={active.status}>
            {/* PHOTO RÉELLE du lieu (registry beach-media : photo only si
                cataloguée ; jamais de stock) — appele la décision avant le texte. */}
            {(() => { const url = beachImageUrl(active.id, imageMap); return url ? <img src={url} alt={`${active.name} — ${active.commune || ''}`} loading="lazy" width="800" height="450" style={{ display: 'block', width: '100%', height: 148, objectFit: 'cover', borderRadius: 10, border: `2px solid ${INK}`, marginBottom: 10 }} onError={e => { e.currentTarget.style.display = 'none' }} /> : null })()}
            {aTop && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: GOLD, color: INK, border: `2px solid ${INK}`, borderRadius: 999, padding: '3px 10px', fontSize: 11, fontWeight: 800, marginBottom: 6 }}>★ {_t(lang, 'MEILLEUR CHOIX DU JOUR', 'TOP PICK TODAY', 'MEJOR OPCIÓN DE HOY')}</span>}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 'clamp(17px,4.8vw,20px)', lineHeight: 1.15 }}>{active.name}</div>
                <div style={{ fontSize: 12, opacity: .7, marginTop: 1 }}>{active.commune || ''}{aD != null ? ` · ${aD < 1 ? '<1' : aD.toFixed(1)} km` : ''}</div>
              </div>
              <span style={pill(aM)}><StatusShape status={active.status} />{aM.label}</span>
            </div>
            <ScoreBar score={active.score} />
            <div style={{ display: 'flex', gap: 10, fontSize: 12, marginTop: 6, opacity: .8, flexWrap: 'wrap' }}>
              <span>{_t(lang, 'Confiance', 'Confidence', 'Confianza')} <b>{active.confidence ?? '—'}</b></span>
            </div>
            {!!active.reason && <div style={{ fontSize: 13, marginTop: 4, opacity: .85 }}>{active.reason}</div>}
            {!!aAlt && <div style={{ fontSize: 12, marginTop: 6 }}>↗ {_t(lang, 'Alternative', 'Alternative', 'Alternativa')} : <b>{aAlt.beach.name}</b> ({aAlt.distanceKm} km)</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button type="button" className={`xp-gold xp-gold${SGM ? ' sgm-focus' : ''}`} style={SGM ? { ...btnGold, flex: 1.4, animationDelay: '.45s' } : { ...btnGold, flex: 1.4 }} data-testid="xp-best-open"
                onClick={() => { try { track?.('sg_home_best_open', { beach_id: active.id, src: 'wow_focus', top: aTop }); } catch (_) {} onOpenBeach?.(active); }}>
                {_t(lang, 'J\u2019y vais →', 'Go →', 'Voy →')}
              </button>
              <button type="button" onClick={() => onGo?.('fav', active)} aria-pressed={!!aFav} title="favori" style={{ ...btnGhost, flex: '0 0 48px', minWidth: 48, fontSize: 18 }}>{aFav ? '★' : '☆'}</button>
              <button type="button" onClick={() => onGo?.('compare', active)} title="comparer" style={{ ...btnGhost, flex: '0 0 48px', minWidth: 48 }}>⇄</button>
            </div>
          </section>
        ) : (
          <div data-testid="xp-home-best" style={{ ...card, marginBottom: 10, background: '#FFF7D6' }}>
            <div style={{ fontSize: 12, fontWeight: 800 }}>★ {_t(lang, 'MEILLEUR CHOIX DU JOUR', 'TOP PICK TODAY', 'MEJOR OPCIÓN DE HOY')}</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>{_t(lang, 'Aucune plage propre confirmée aujourd’hui. Vérifie les plages et choisis ton plan B.', 'No clean beach is confirmed today. Check the beaches and choose your Plan B.', 'Ninguna playa limpia está confirmada hoy. Revisa las playas y elige tu plan B.')}</div>
            <button type="button" style={{ ...btnGhost, width: '100%', marginTop: 8 }} onClick={() => onGo?.('list')} data-testid="xp-best-more">{_t(lang, 'Voir les plages →', 'See beaches →', 'Ver las playas →')}</button>
          </div>
        )}
      </div>

      {/* 3.5 · PLAN DU JOUR — résultat émotionnel : plage + semaine réelle +
          alternative réelle + bons-à-savoir factuels (photo réelle si le
          catalogue en a une). Rollback ?sgplan=0 (PlanCard.planOff). */}
      {intentBest && !planOff() && (
        <PlanCard lang={lang} beach={intentBest} journey={planJourney} isPremium={isPremium}
          imageUrl={beachImageUrl(intentBest.id, imageMap)} media={beachMedia(intentBest.id, { imageMap, heroVids })} fresh={fresh}
          onOpenBeach={onOpenBeach} onOpenAlt={onOpenBeach} track={track} />
      )}

      {/* TRIP + CARTE (colonne droite desktop) */}
      <div className="wow-tripwrap" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
        {!!onPlanTrip && tripAllowed && (
          <button type="button" data-testid="trip-open" onClick={() => { try { track?.('sg_trip_open', { source: 'xp_home' }); if (intentBest && !planOff()) track?.('sg_plan_add', { beach_id: intentBest.id, intent: intent || null }); } catch (_) {} onPlanTrip(); }}
            className="wow-sea-link wow-sea-link" style={{ fontFamily: 'inherit' }}>
            {_t(lang, '🗓 Planifier mon séjour — la meilleure plage chaque jour →', '🗓 Plan my stay — best beach each day →', '🗓 Planificar mi estancia — mejor playa cada día →')}
          </button>
        )}
        <button type="button" data-testid="xp-explore" className="wow-sea-link wow-sea-link" onClick={() => onGo?.('map')} style={{ fontFamily: 'inherit' }}>
          {_t(lang, '🗺 Explorer la carte →', '🗺 Explore the map →', '🗺 Explorar el mapa →')}
        </button>
      </div>

      <HomeLower lang={lang} q={q} setQ={setQ} data={data} allBeaches={allBeaches} userPos={userPos}
        favorites={favorites} onOpenBeach={onOpenBeach} onGo={onGo} onPremium={onPremium} track={track} imageMap={imageMap} />
    </div>
  );
}

/* ── PLAGES : vrai produit (recherche / filtres / tri / favoris / comparer) ── */
export function PlagesExplorer({ lang = 'fr', allBeaches = [], favorites = [], compareIds = [], userPos, onOpenBeach, onToggleFav, onToggleCompare, track, imageMap = null }) {
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
            img={beachImageUrl(b.id, imageMap)}
            isFav={(favorites || []).includes(b.id)} inCompare={(compareIds || []).includes(b.id)}
            onOpen={onOpenBeach} onFav={onToggleFav} onCompare={onToggleCompare} />
        ))}
        {list.length > 40 && <div style={{ textAlign: 'center', fontSize: 12, opacity: .7, padding: 8 }}>{_t(lang, `+ ${list.length - 40} autres — affine ta recherche`, `+ ${list.length - 40} more`, `+ ${list.length - 40} más`)}</div>}
      </div>
    </div>
  );
}

/* ── COMPARATEUR (2–3 plages, données réelles uniquement) ── */
export function CompareSheet({ lang = 'fr', beaches = [], userPos, onClose, onOpenBeach, onToggleFav, favorites = [], imageMap = null }) {
  /* Dismiss non-destructif (2026-09-25I) : ✕ masque la feuille SANS vider
     la sélection (l'ancien onClose vidait → impossible d'accumuler 2-3
     plages, la feuille couvrant la liste dès le 1er ajout). « Effacer »
     garde l'ancien comportement (vide via onClose). Hooks AVANT tout
     return (règle React). */
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => { setDismissed(false) }, [beaches.length]);
  /* SWIPE A↔B : hook AVANT tout return (règle React). */
  const cineSwipe = (() => { try { return !/[?&]sgcine=0(?:&|$)/.test(window.location.search) } catch (_) { return true } })();
  const [emblaRef] = useEmblaCarousel({ align: 'start', containScroll: 'trimSnaps' });
  if (!beaches.length || dismissed) return null;
  const best = [...beaches].sort((a, b) => (b.score || 0) - (a.score || 0))[0];
  /* Synthèse honnête (2026-09-25I) : écart de score réel + statuts réels.
     Jamais d'affirmation sans les deux scores. */
  const ranked = [...beaches].sort((a, b) => (b.score || 0) - (a.score || 0));
  const synth = ranked.length >= 2 && ranked[0].score != null && ranked[1].score != null
    ? { first: ranked[0], second: ranked[1], gap: Math.round(ranked[0].score - ranked[1].score) } : null;
  const row = { display: 'flex', justifyContent: 'space-between', gap: 8, padding: '7px 0', borderTop: '1px solid #eee', fontSize: 13 };
  const slide = (b, m, d, img) => (
    <div key={b.id} className="t3-compare-slide" style={{ ...card, padding: 10, borderColor: b.id === best?.id ? INK : '#999', background: b.id === best?.id ? '#FFF6D6' : '#fff', flex: cineSwipe ? '0 0 78%' : undefined, minWidth: 0 }}>
      {!!img && <img src={img} alt={b.name} loading="lazy" width="400" height="300" style={{ display: 'block', width: 'calc(100% + 20px)', height: 84, objectFit: 'cover', margin: '-10px -10px 8px', borderRadius: '14px 14px 0 0' }} onError={e => { e.currentTarget.style.display = 'none' }} />}
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
    </div>
  );
  return (
    <div role="dialog" aria-label="compare" style={{ position: 'fixed', inset: 0, zIndex: 1400, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={() => setDismissed(true)} data-testid="xp-compare">
      <div className={sgmOff() ? undefined : 'sgm-sheet'} style={{ width: '100%', maxWidth: 560, maxHeight: '88dvh', overflowY: 'auto', background: '#FFFDF6', border: `2.5px solid ${INK}`, borderBottom: 'none', borderRadius: '22px 22px 0 0', padding: '12px 12px calc(16px + env(safe-area-inset-bottom))' }} onClick={e => e.stopPropagation()}>
        <style>{XP_ARMOR}</style>
        <div style={{ width: 44, height: 5, borderRadius: 99, background: '#ddd', margin: '0 auto 8px' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ fontFamily: "'Anton',sans-serif", fontSize: 'clamp(19px,5.4vw,24px)' }}>⇄ {_t(lang, 'Comparer', 'Compare', 'Comparar')} ({beaches.length}/3)</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" onClick={onClose} style={{ ...btnGhost, minWidth: 44, fontSize: 12 }} data-testid="xp-compare-clear">{_t(lang, 'Effacer', 'Clear', 'Borrar')}</button>
            <button type="button" onClick={() => setDismissed(true)} style={{ ...btnGhost, minWidth: 44 }} aria-label="close">✕</button>
          </div>
        </div>
        {cineSwipe ? (
          <div ref={emblaRef} data-testid="xp-compare-rail" style={{ overflow: 'hidden', margin: '8px -12px 0', padding: '0 12px 4px' }}
            aria-label={_t(lang, 'Balayer pour comparer', 'Swipe to compare', 'Desliza para comparar')}>
            <div style={{ display: 'flex', gap: 8 }}>
              {beaches.map(b => { const m = statusMeta(b.status, lang); return slide(b, m, distOf(b, userPos), beachImageUrl(b.id, imageMap)) })}
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${beaches.length},1fr)`, gap: 8, marginTop: 8 }}>
            {beaches.map(b => { const m = statusMeta(b.status, lang); return slide(b, m, distOf(b, userPos), beachImageUrl(b.id, imageMap)) })}
          </div>
        )}
        {!!best && <button type="button" className="xp-gold xp-gold" style={{ ...btnGold, marginTop: 10 }} onClick={() => onOpenBeach?.(best)}>{_t(lang, `Ouvrir le meilleur : ${best.name} →`, `Open best: ${best.name} →`, `Abrir la mejor: ${best.name} →`)}</button>}
        {!!synth && (
          <div data-testid="xp-compare-synth" style={{ fontSize: 13, marginTop: 8, background: '#FFF6D6', border: `2px solid ${INK}`, borderRadius: 12, padding: '9px 12px' }}>
            {_t(lang, `Pour aujourd'hui : ${synth.first.name} devant ${synth.second.name} — ${synth.gap} pts d'écart (${statusMeta(synth.first.status, lang).label} vs ${statusMeta(synth.second.status, lang).label}).`, `Today: ${synth.first.name} ahead of ${synth.second.name} — ${synth.gap} pts apart.`, `Hoy: ${synth.first.name} por delante de ${synth.second.name} — ${synth.gap} pts.`)}
          </div>
        )}
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
  /* HOME = WOW « Pouls de la mer » par défaut ; rollback produit ?sgwow=0 →
     ancien dashboard (conservé). Même data-testid xp-home sur les 2 chemins. */
  const wowOff = (() => { try { return /[?&]sgwow=0(?:&|$)/.test(window.location.search); } catch (_) { return false; } })();
  return wowOff ? <HomeDashboard {...rest} allBeaches={allBeaches} /> : <HomeWow {...rest} allBeaches={allBeaches} />;
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
