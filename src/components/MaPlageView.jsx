/**
 * MaPlageView — « Ma Plage » view with alert state and alternatives
 * 
 * Shows the user's favorite beach with:
 * - Current verdict (human-readable)
 * - Confidence + freshness
 * - 3 alternatives if beach is moderate/avoid
 * - Alert toggle (in-app + push)
 * - CTA to premium for multi-beach / advanced alerts
 */

import { Suspense, useEffect, useMemo, useCallback } from 'react';
import { useSwipeClose } from '../useSwipeClose.js';
import { 
  useMyPlage, 
  useAlertEngine
} from '../lib/alert-engine.js';
import { EnhancedAlternativesPanel } from './EnhancedAlternativesPanel.jsx';
import { _t, COMIC, Veilleur, comicStatusColor } from '../Sargasses_PROD.jsx';
import { useWeather } from '../Sargasses_PROD.jsx';

export function MaPlageView({ 
  lang = 'fr', 
  allBeaches = [], 
  sargData, 
  userPos, 
  onClose, 
  onPremiumClick, 
  isPremium = false,
  track,
  onBeachClick,
  onEnableAlerts,
  alertsOn = false,
  onToggleAlerts
}) {
  // Handle swipe close (défini avant useSwipeClose : le hook attend onClose en 1er arg)
  const requestClose = useCallback(() => {
    onClose?.();
  }, [onClose]);

  const swipe = useSwipeClose(requestClose, { threshold: 60, guardInput: true });
  
  // Get "Ma Plage" state
  const {
    beach,
    favId,
    isFavorite,
    toggleFavorite,
    alternatives,
    verdict,
    hasBeach
  } = useMyPlage(allBeaches, lang);

  // Météo réelle (Open-Meteo, même hook que les fiches — jamais d'endpoint inventé ;
  // indisponible → chips météo simplement absents, verdict satellite inchangé).
  const weather = useWeather(beach);
  
  // Alert engine for this beach
  const { 
    checkBeachAlerts, 
    checkAllFavorites
  } = useAlertEngine(allBeaches, lang);
  
  // Check alerts on mount and when beach changes
  useEffect(() => {
    if (beach) {
      checkBeachAlerts(beach);
      checkAllFavorites();
    }
  }, [beach, allBeaches, lang]);
  
  // Check if alerts are enabled (from OneSignal)
  const alertsEnabled = alertsOn || (typeof Notification !== 'undefined' && Notification.permission === 'granted');
  
  // Track
  const trk = useCallback((name, params) => {
    try { track?.(name, params); } catch (_) {}
  }, [track]);
  
  if (!hasBeach) {
    // No favorite beach yet - show empty state
    return (
      <>
        <style>{`
          @keyframes mpFade{from{opacity:0}to{opacity:1}}
          @keyframes mpUp{from{transform:translateY(102%)}to{transform:translateY(0)}}
          .mp-sheet{background:${COMIC.cream};border:2.5px solid ${COMIC.ink};border-radius:26px 26px 0 0;box-shadow:0 -12px 44px rgba(0,0,0,.42);font-family:'Bricolage Grotesque',system-ui,sans-serif}
          .mp-empty{text-align:center;padding:40px 20px}
          .mp-empty-icon{font-size:64px;margin-bottom:16px}
          .mp-empty-title{font:800 clamp(22px,6vw,32px)/1.1 'Anton',sans-serif;color:${COMIC.ink};margin-bottom:8px}
          .mp-empty-text{font:600 14px/1.5 'Bricolage Grotesque',sans-serif;color:${COMIC.sub};max-width:280px;margin:0 auto 24px}
          .mp-btn{width:100%;display:flex;align-items:center;justify-content:center;gap:8;padding:16px;border-radius:14px;border:2.5px solid ${COMIC.ink};box-shadow:4px 4px 0 ${COMIC.ink};font:800 16px/1 'Bricolage Grotesque',sans-serif;cursor:pointer;transition:transform .08s}
          .mp-btn:active{transform:translate(4px,4px);box-shadow:0 0 0 ${COMIC.ink}}
          .mp-btn-gold{background:${COMIC.gold};color:${COMIC.ink}}
          .mp-btn-white{background:#fff;color:${COMIC.ink}}
          @media (prefers-reduced-motion:reduce){.mp-sheet{animation:none!important}}
        `}</style>
        
        <div onClick={requestClose} style={{position:'fixed',inset:0,zIndex:'var(--z-backdrop)',background:'rgba(11,7,22,.46)',backdropFilter:'blur(1.5px)',WebkitBackdropFilter:'blur(1.5px)',animation:'mpFade .25s ease both'}} />
        
        <div ref={swipe.ref} onTouchStart={swipe.onTouchStart} onTouchMove={swipe.onTouchMove} onTouchEnd={swipe.onTouchEnd}
          className="mp-sheet"
          style={{position:'fixed',left:0,right:0,bottom:0,zIndex:'var(--z-sheet)',maxHeight:'92svh',overflowY:'auto',overflowX:'hidden',
            borderTop:`4px solid ${COMIC.ink}`,borderRadius:'26px 26px 0 0',animation:'mpUp .42s cubic-bezier(.16,1,.3,1) both'}}>
          
          <div style={{width:44,height:5,borderRadius:5,background:COMIC.ink,opacity:.32,margin:'2px auto 8px'}} />
          
          <button onClick={requestClose} aria-label={_t(lang,'Fermer','Close','Cerrar')}
            style={{position:'absolute',top:12,right:12,width:44,height:44,borderRadius:'50%',border:`2.5px solid ${COMIC.ink}`,background:'#fff',boxShadow:`2px 2px 0 ${COMIC.ink}`,color:COMIC.ink,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',zIndex:2}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>
          </button>
          
          <div className="mp-empty">
            <div className="mp-empty-icon">🏖️</div>
            <div className="mp-empty-title">{_t(lang,'Aucune plage suivie','No beach followed','Ninguna playa seguida')}</div>
            <div className="mp-empty-text">
              {_t(lang,'Ajoute une plage à tes favoris pour voir son verdict, recevoir des alertes et découvrir les alternatives.','Add a beach to your favorites to see its verdict, get alerts, and discover alternatives.','Añade una playa a tus favoritos para ver su veredicto, recibir alertas y descubrir alternativas.')}
            </div>
            <button className="mp-btn mp-btn-gold" onClick={requestClose}>
              {_t(lang,'Choisir ma plage','Choose my beach','Elegir mi playa')}
            </button>
            <button className="mp-btn mp-btn-white" style={{marginTop:12}} onClick={()=>{onPremiumClick?.('ma_plage');requestClose()}}>
              {_t(lang,'Voir Premium pour multi-plages','See Premium for multi-beach','Ver Premium para multi-playas')}
            </button>
          </div>
        </div>
      </>
    );
  }
  
  // Get beach data for display
  const statusColor = comicStatusColor(beach.status);
  const daypart = (() => { try { const h = new Date().getHours(); return h < 12 ? 'matin' : h < 18 ? 'aprem' : 'soir'; } catch (_) { return 'matin'; } })();
  const satAge = (() => { try { const ts = sargData?.erddapTimestamp || sargData?.updatedAt; if (!ts) return null; const h = (Date.now() - new Date(ts).getTime()) / 3.6e6; return h >= 0 && h < 240 ? h : null; } catch (_) { return null; } })();
  const satLabel = satAge == null ? _t(lang,'Satellite récent','Recent satellite','Satélite reciente')
    : satAge < 1 ? _t(lang,'Satellite il y a <1 h','Satellite <1h ago','Satélite hace <1 h')
    : _t(lang,`Satellite il y a ${Math.round(satAge)} h`,`Satellite ${Math.round(satAge)}h ago`,`Satélite hace ${Math.round(satAge)} h`);
  const distKm = (() => { try { if (!userPos || !beach) return null; const R = 6371; const dLat = (beach.lat - userPos.lat) * Math.PI / 180; const dLng = (beach.lng - userPos.lng) * Math.PI / 180; const a = Math.sin(dLat / 2) ** 2 + Math.cos(userPos.lat * Math.PI / 180) * Math.cos(beach.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2; return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); } catch (_) { return null; } })();
  const locLine = [beach?.commune || null, distKm != null ? _t(lang,`à ${Math.round(distKm)} km`,`${Math.round(distKm)} km away`,`a ${Math.round(distKm)} km`) : null].filter(Boolean).join(' · ');
  
  // Factors (chips)
  const chips = useMemo(() => {
    const out = [];
    const sgLvl = beach.status === 'clean' ? { t: _t(lang,'Sargasses faibles','Low sargassum','Sargazo bajo'), c: COMIC.clean }
      : beach.status === 'moderate' ? { t: _t(lang,'Sargasses modérées','Moderate sargassum','Sargazo moderado'), c: COMIC.orange }
      : beach.status === 'avoid' ? { t: _t(lang,'Sargasses fortes','Heavy sargassum','Sargazo fuerte'), c: COMIC.orange } : null;
    if (sgLvl) out.push(sgLvl);
    if (weather) {
      if (weather.waveHeight != null) { const w = weather.waveHeight; out.push({ t: w < .6 ? _t(lang,'Houle calme','Calm swell','Mar calmo') : w < 1.2 ? _t(lang,'Houle modérée','Moderate swell','Mar moderado') : _t(lang,'Houle forte','Strong swell','Mar fuerte'), c: w < .6 ? COMIC.clean : COMIC.orange }) }
      if (weather.wind != null) { const v = weather.wind; out.push({ t: v < 20 ? _t(lang,'Vent léger','Light wind','Viento leve') : v < 35 ? _t(lang,'Vent modéré','Moderate wind','Viento moderado') : _t(lang,'Vent fort','Strong wind','Viento fuerte'), c: v < 20 ? COMIC.clean : COMIC.orange }) }
      if (weather.temp != null) out.push({ t: _t(lang,`Eau ${weather.temp}°`,`Water ${weather.temp}°`,`Agua ${weather.temp}°`), c: COMIC.blue });
    }
    return out.slice(0, 4);
  }, [beach.status, weather, lang]);
  
  // Verdict label
  const V = comicVerdict(beach.status, lang, daypart);
  
  // Alert toggle
  const handleToggleAlerts = useCallback(() => {
    if (onToggleAlerts) {
      onToggleAlerts(!alertsEnabled);
      trk('sg_ma_plage_alerts_toggle', { beach_id: beach.id, enabled: !alertsEnabled });
    } else if (onEnableAlerts) {
      onEnableAlerts();
      trk('sg_ma_plage_alerts_enable', { beach_id: beach.id });
    }
  }, [alertsEnabled, onToggleAlerts, onEnableAlerts, beach.id, trk]);
  
  // Premium CTA label
  const premiumCtaLabel = isPremium 
    ? _t(lang, 'Mes alertes', 'My alerts', 'Mis alertas')
    : _t(lang, 'Débloquer alertes + multi-plages', 'Unlock alerts + multi-beach', 'Desbloquear alertas + multi-playas');
  
  const onPremiumCTA = useCallback(() => {
    trk('sg_ma_plage_premium_cta', { beach_id: beach.id, isPremium });
    onPremiumClick?.('ma_plage');
  }, [onPremiumClick, beach.id, isPremium, trk]);
  
  // Toggle favorite
  const handleToggleFav = useCallback(() => {
    if (toggleFavorite) {
      toggleFavorite();
      trk('sg_ma_plage_fav_toggle', { beach_id: beach.id, followed: !isFavorite });
    }
  }, [toggleFavorite, isFavorite, beach.id, trk]);
  
  return (
    <>
      <style>{`
        @keyframes mpFade{from{opacity:0}to{opacity:1}}
        @keyframes mpUp{from{transform:translateY(102%)}to{transform:translateY(0)}}
        @keyframes mpChip{0%{transform:scale(.55) translateY(8px);opacity:0}65%{transform:scale(1.08) translateY(0)}100%{transform:scale(1);opacity:1}}
        @keyframes mpRow{0%{transform:translateX(-14px);opacity:0}100%{transform:translateX(0);opacity:1}}
        .mp-sheet{background:${COMIC.cream};border:2.5px solid ${COMIC.ink};border-radius:26px 26px 0 0;box-shadow:0 -12px 44px rgba(0,0,0,.42);font-family:'Bricolage Grotesque',system-ui,sans-serif}
        .mp-chip{font:800 12px/1 'Bricolage Grotesque',sans-serif;color:${COMIC.ink};background:#fff;border:2.5px solid ${COMIC.ink};border-radius:999px;padding:7px 11px;display:inline-flex;align-items:center;gap:6px;animation:mpChip .3s cubic-bezier(.22,1,.36,1) both}
        .mp-gobtn{width:100%;text-align:center;font:800 17px/1 'Bricolage Grotesque',sans-serif;padding:16px;border-radius:16px;border:2.5px solid ${COMIC.ink};box-shadow:6px 6px 0 ${COMIC.ink};background:${COMIC.gold};color:${COMIC.ink};cursor:pointer;transition:transform .08s ease}
        .mp-gobtn:active{transform:translate(6px,6px);box-shadow:0 0 0 ${COMIC.ink}}
        .mp-secbtn{width:auto;text-align:center;font:800 15px/1 'Bricolage Grotesque',sans-serif;padding:13px 26px;border-radius:16px;border:2.5px solid ${COMIC.ink};box-shadow:4px 4px 0 ${COMIC.ink};background:#fff;color:${COMIC.ink};cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;transition:transform .08s ease}
        .mp-secbtn:active{transform:translate(4px,4px);box-shadow:0 0 0 ${COMIC.ink}}
        .mp-scrollcue{display:flex;justify-content:center;margin-top:26px;animation:mpCue 1.6s ease-in-out 2 both}
        @keyframes mpCue{0%,100%{transform:translateY(0);opacity:.55}50%{transform:translateY(7px);opacity:1}}
        @media (prefers-reduced-motion:reduce){.mp-sheet{scroll-behavior:auto!important}.mp-chip{animation:none!important}.mp-scrollcue{animation:none!important;opacity:.7}}
      `}</style>
      
      {/* Backdrop */}
      <div onClick={requestClose}
        style={{position:'fixed',inset:0,zIndex:'var(--z-backdrop)',background:'rgba(11,7,22,.46)',backdropFilter:'blur(1.5px)',WebkitBackdropFilter:'blur(1.5px)',animation:'mpFade .25s ease both'}} />
      
      {/* Sheet */}
      <div ref={swipe.ref} onTouchStart={swipe.onTouchStart} onTouchMove={swipe.onTouchMove} onTouchEnd={swipe.onTouchEnd}
        className="mp-sheet"
        style={{position:'fixed',left:0,right:0,bottom:0,zIndex:'var(--z-sheet)',maxHeight:'92svh',overflowY:'auto',overflowX:'hidden',
          borderTop:`4px solid ${COMIC.ink}`,borderRadius:'26px 26px 0 0',animation:'mpUp .42s cubic-bezier(.16,1,.3,1) both'}}>
        
        {/* Grip */}
        <div style={{width:44,height:5,borderRadius:5,background:COMIC.ink,opacity:.32,margin:'2px auto 8px'}} />
        
        {/* Close */}
        <button onClick={requestClose} aria-label={_t(lang,'Fermer','Close','Cerrar')}
          style={{position:'absolute',top:12,right:12,width:44,height:44,borderRadius:'50%',border:`2.5px solid ${COMIC.ink}`,background:'#fff',boxShadow:`2px 2px 0 ${COMIC.ink}`,color:COMIC.ink,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',zIndex:2}}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>
        </button>
        
        {/* ── HERO: golden-hour scene + beach name ── */}
        <div style={{position:'relative',height:'min(480px,46svh)',overflow:'hidden',borderRadius:'0 0 26px 26px',margin:'-10px -16px 0'}}>
          <div style={{position:'absolute',inset:0,background:`linear-gradient(180deg, ${COMIC.ink}0d 0%, transparent 35%, transparent 50%, rgba(0,0,0,.5) 100%)`}} />
          <div style={{position:'absolute',top:'38%',left:0,right:0,display:'flex',justifyContent:'center',pointerEvents:'none'}}>
            <Veilleur mood={beach.status === 'clean' ? 'serein' : beach.status === 'moderate' ? 'scan' : 'alerte'} size={72} />
          </div>
          <div style={{position:'absolute',bottom:20,left:20,right:20,zIndex:1}}>
            <div style={{fontFamily:"'Anton',sans-serif",fontSize:'clamp(28px,8vw,42px)',lineHeight:.92,color:'#fff',textTransform:'uppercase',letterSpacing:'-.3px',textShadow:'0 2px 16px rgba(0,0,0,.5)',wordBreak:'break-word'}}>{beach.name}</div>
            {locLine && <div style={{font:'700 12px/1.2 "Bricolage Grotesque"',color:'rgba(255,255,255,.75)',marginTop:6,display:'flex',alignItems:'center',gap:5,textShadow:'0 1px 8px rgba(0,0,0,.4)'}}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{flexShrink:0}}><path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>{locLine}</div>}
          </div>
          <div style={{position:'absolute',top:16,left:16,display:'flex',alignItems:'center',gap:6,padding:'5px 11px',borderRadius:100,background:'rgba(0,0,0,.3)',backdropFilter:'blur(12px)',WebkitBackdropFilter:'blur(12px)',border:'1px solid rgba(255,255,255,.12)'}}>
            <span style={{width:8,height:8,borderRadius:'50%',background:statusColor,flexShrink:0}} />
            <span style={{font:'800 12px/1 "Bricolage Grotesque"',color:'#fff',textShadow:'0 1px 4px rgba(0,0,0,.6)'}}>{V.big}</span>
          </div>
        </div>
        
        {/* ── VERDICT BADGE ── */}
        <div style={{padding:'0 16px 12px',display:'flex',alignItems:'center',gap:10,justifyContent:'center'}}>
          <div style={{display:'inline-flex',alignItems:'center',gap:8,padding:'8px 14px',borderRadius:999,background:`${statusColor}15`,border:`2px solid ${statusColor}`,boxShadow:`0 2px 8px ${statusColor}30`}}>
            <span style={{width:10,height:10,borderRadius:'50%',background:statusColor,flexShrink:0}} />
            <span style={{font:'800 14px/1 "Bricolage Grotesque"',color:statusColor,textTransform:'uppercase',letterSpacing:'.04em'}}>{V.big}</span>
          </div>
          <div style={{font:'700 12px/1 "Bricolage Grotesque"',color:COMIC.sub,opacity:.8}}>{_t(lang,'aujourd\'hui','today','hoy')}</div>
        </div>
        
        {/* ── FACTEURS (chips) ── */}
        <div style={{padding:'0 16px 8px',display:'flex',flexWrap:'wrap',gap:6,justifyContent:'center'}}>
          {chips.map((chip,i)=>(<span key={i} className="mp-chip" style={{animationDelay:`${i*.08}s`,background:chip.c+'15',borderColor:chip.c,color:chip.c}}><i style={{width:9,height:9,borderRadius:'50%',background:chip.c,flexShrink:0}} />{chip.t}</span>))}
        </div>
        
        {/* ── CONFIANCE + FRAÎCHEUR ── */}
        <div style={{padding:'0 16px 8px',display:'flex',alignItems:'center',justifyContent:'center',gap:12,flexWrap:'wrap',fontSize:11,lineHeight:1.4,color:COMIC.sub}}>
          <span style={{display:'flex',alignItems:'center',gap:4}}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>{_t(lang,'Confiance : ','Confidence: ','Confianza: ')}<strong>{beach.confidence != null ? beach.confidence + '%' : _t(lang,'—','—','—')}</strong></span>
          <span style={{display:'flex',alignItems:'center',gap:4}}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a10 10 0 0 1 10 10c0 4.4-3.3 8-7.5 9-.9.2-1.8.3-2.7.3s-1.8-.1-2.7-.3C5.3 20 2 16.4 2 12a10 10 0 0 1 10-10z"/><path d="M12 6v6l4 2"/></svg>{satLabel}</span>
        </div>
        
        {/* ── FAVORITE STATUS ── */}
        <div style={{padding:'0 16px 8px',display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
          <button onClick={handleToggleFav} style={{display:'flex',alignItems:'center',gap:6,padding:'6px 10px',borderRadius:999,border:`2px solid ${isFavorite ? COMIC.gold : COMIC.ink}`,background:isFavorite ? '#FFF9E6' : '#fff',boxShadow:`2px 2px 0 ${isFavorite ? COMIC.gold : COMIC.ink}`,cursor:'pointer',fontFamily:'inherit'}}>
            <span style={{fontSize:14}}>{isFavorite ? '★' : '☆'}</span>
            <span style={{font:'800 12px/1 "Bricolage Grotesque"',color:isFavorite ? '#B87A00' : COMIC.ink}}>{isFavorite ? _t(lang,'Ma plage ✓','My beach ✓','Mi playa ✓') : _t(lang,'Ma plage','My beach','Mi playa')}</span>
          </button>
        </div>
        
        {/* ── ALERT TOGGLE ── */}
        <div style={{padding:'0 16px 8px',display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
          <button onClick={handleToggleAlerts} style={{display:'flex',alignItems:'center',gap:8,padding:'10px 14px',borderRadius:12,border:`2.5px solid ${alertsEnabled ? COMIC.clean : COMIC.ink}`,background:alertsEnabled ? '#E8F5E9' : '#fff',boxShadow:`2px 2px 0 ${alertsEnabled ? COMIC.clean : COMIC.ink}`,cursor:'pointer',fontFamily:'inherit',minHeight:44}}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={alertsEnabled ? COMIC.clean : COMIC.ink} strokeWidth="2.2" strokeLinejoin="round" aria-hidden="true" style={{flexShrink:0}}><path d="M6 9.5a6 6 0 0 1 12 0c0 4.4 1.8 5.5 1.8 5.5H4.2S6 13.9 6 9.5z"/><path d="M10 19a2 2 0 0 0 4 0" strokeLinecap="round"/></svg>
            <span style={{font:'800 13px/1 "Bricolage Grotesque"',color:alertsEnabled ? '#1B5E20' : COMIC.ink}}>{alertsEnabled ? _t(lang,'Alertes activées','Alerts enabled','Alertas activadas') : _t(lang,'Activer les alertes','Enable alerts','Activar alertas')}</span>
          </button>
        </div>
        
        {/* ── ALTERNATIVES (if avoid/moderate) ── */}
        {alternatives.length > 0 && (
          <Suspense fallback={null}>
            <EnhancedAlternativesPanel
              beach={beach}
              allBeaches={allBeaches}
              lang={lang}
              onBeachClick={onBeachClick}
              track={track}
              status={beach.status}
            />
          </Suspense>
        )}
        
        {/* ── PREMIUM CTA ── */}
        <div style={{padding:'16px',display:'flex',flexDirection:'column',gap:10}}>
          <button className="mp-gobtn" onClick={onPremiumCTA}>
            {premiumCtaLabel}
          </button>
          {!isPremium && (
            <button className="mp-secbtn" onClick={()=>{onPremiumClick?.('ma_plage');requestClose()}}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 13l4 4L19 7"/></svg>
              {_t(lang,'Voir toutes les plages + alertes →','See all beaches + alerts →','Ver todas las playas + alertas →')}
            </button>
          )}
          <div style={{font:'700 11px/1.4 "Bricolage Grotesque"',color:COMIC.sub,textAlign:'center',marginTop:4}}>
            {_t(lang,'1 plage suivie gratuite · Multi-plages + alertes avancées = Premium','1 free followed beach · Multi-beach + advanced alerts = Premium','1 playa seguida gratis · Multi-playas + alertas avanzadas = Premium')}
          </div>
        </div>
        
        {/* ── SCROLL CUE ── */}
        <div className="mp-scrollcue" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={COMIC.sub} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6"/></svg>
        </div>
      </div>
    </>
  );
}

// Comic verdict helper (same as ChasseDetail)
function comicVerdict(status, lang, daypart) {
  const when = { fr: { matin: 'ce matin', aprem: 'cet après-midi', soir: 'ce soir' }, en: { matin: 'this morning', aprem: 'this afternoon', soir: 'tonight' }, es: { matin: 'esta mañana', aprem: 'esta tarde', soir: 'esta noche' } };
  const w = (when[lang] || when.fr)[daypart] || (when[lang] || when.fr).matin;
  if (status === 'clean') return { big: _t(lang, 'Baignade OK', 'Safe to swim', 'Baño OK'), when: w, hl: _t(lang, 'OK', 'OK', 'OK') };
  if (status === 'moderate') return { big: _t(lang, 'À vérifier', 'Check first', 'A verificar'), when: w, hl: _t(lang, 'PRUDENCE', 'CAREFUL', 'CUIDADO') };
  if (status === 'avoid') return { big: _t(lang, 'Évite l\'eau', 'Skip the swim', 'Evita el agua'), when: w, hl: _t(lang, 'ALERTE', 'ALERT', 'ALERTA') };
  return { big: _t(lang, 'Le Veilleur scanne', 'Scanning', 'Escaneando'), when: w, hl: '…' };
}

export default MaPlageView;