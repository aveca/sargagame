import React, { useMemo } from "react"
import { useAroundMe } from "./useAroundMe"
import { AroundMeSortPanel } from "./AroundMeSortPanel"

const INK = "#0d0b14"
const GLASS = { background: "rgba(20,11,32,.46)", border: "1px solid rgba(255,255,255,.22)", boxShadow: "0 8px 26px rgba(0,0,0,.42)", backdropFilter: "blur(11px)", WebkitBackdropFilter: "blur(11px)" }
const GOLD = { background: "linear-gradient(180deg,#ffe07a,#ffb338)", border: "1px solid rgba(0,0,0,.18)", boxShadow: "0 8px 22px rgba(255,150,60,.45)" }
const MUTE = "rgba(255,255,255,.62)"
const STATUS_C = { clean: "#22C55E", moderate: "#B87A00", avoid: "#E8522A" }

function _t(lang, fr, en, es) {
  return lang === "es" ? es : lang === "en" ? en : fr
}

function VerdictDot({ status, size = 10 }) {
  return <span style={{ display: "inline-block", width: size, height: size, borderRadius: "50%", background: STATUS_C[status] || "#9aa0a8", marginRight: 6, flexShrink: 0 }} aria-hidden="true" />
}

function InfoBanner({ lang, onAccept, onDismiss }) {
  return (
    <div style={{ ...GLASS, borderRadius: 12, padding: 14, marginBottom: 10, fontSize: 12, lineHeight: 1.5, color: "#fff" }}>
      <div style={{ fontWeight: 700, marginBottom: 6, color: "#FFC72C" }}>
        {_t(lang, "📍 Votre position reste locale", "📍 Your location stays local", "📍 Tu ubicación queda en local")}
      </div>
      <div style={{ color: MUTE, marginBottom: 10 }}>
        {_t(lang,
          "Aucune coordonnée n'est envoyée au serveur. Utilisée uniquement pour trier les plages par distance.",
          "No coordinates are sent to the server. Used only to sort beaches by distance.",
          "No se envían coordenadas al servidor. Solo se usan para ordenar playas por distancia.")}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={onAccept}
          style={{ ...GOLD, color: INK, border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 11, fontWeight: 700, fontFamily: "'Bricolage Grotesque',sans-serif", cursor: "pointer", textTransform: "uppercase", flex: 1 }}
        >
          {_t(lang, "Autoriser", "Allow", "Permitir")}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          style={{ background: "transparent", color: MUTE, border: "1px solid rgba(255,255,255,.2)", borderRadius: 8, padding: "6px 12px", fontSize: 11, fontWeight: 700, fontFamily: "'Bricolage Grotesque',sans-serif", cursor: "pointer", textTransform: "uppercase", flex: 1 }}
        >
          {_t(lang, "Refuser", "Decline", "Rechazar")}
        </button>
      </div>
    </div>
  )
}

export function AroundMeController({ beaches, region, island, lang = "fr", onOpenBeach, track, isPremium, locked, openPremium }) {
  const {
    flagEnabled,
    userLoc,
    locationSource,
    geoError,
    geoPending,
    requestGeolocation,
    sortedBeaches,
    allSortedBeaches,
    inLiveZone,
    fallbackCenter,
    showInfo,
    setShowInfo,
    dismissInfo,
    optedOut,
  } = useAroundMe(beaches, region, track, lang)

  if (!flagEnabled) return null

  const hasUserLoc = !!userLoc
  const showFallback = hasUserLoc && !inLiveZone && sortedBeaches.length > 0
  const showEmpty = hasUserLoc && sortedBeaches.length === 0

  const topBeaches = useMemo(() => sortedBeaches.slice(0, 5), [sortedBeaches])

  const handleLocate = () => {
    if (track) track("sg_around_me_locate_click", { island })
    setShowInfo()
    requestGeolocation()
  }

  const handleBeachClick = (beach) => {
    if (track) track("sg_around_me_beach_click", { island, beachId: beach.id, distanceKm: Math.round(beach.distanceKm * 10) / 10 })
    
    // Protect funnel: if locked for non-premium, open paywall with source
    if (locked && !isPremium) {
      if (track) track("sg_around_me_premium_gate", { beachId: beach.id, source: "around_me" })
      openPremium?.(`around_me_${beach.id}`)
      return
    }
    onOpenBeach?.(beach)
  }

  return (
    <div
      data-testid="around-me-controller"
      style={{
        position: "fixed",
        zIndex: 1030,
        bottom: 120,
        left: 0,
        right: 0,
        maxWidth: 360,
        margin: "0 auto 12px",
        ...GLASS,
        borderRadius: "14px 14px 0 0",
        padding: 14,
        paddingBottom: "max(14px, env(safe-area-inset-bottom))",
        fontFamily: "'Bricolage Grotesque',system-ui,sans-serif",
        color: "#fff",
        boxShadow: "0 -4px 20px rgba(0,0,0,.3)",
      }}
    >
      {showInfo && (
        <InfoBanner
          lang={lang}
          onAccept={handleLocate}
          onDismiss={dismissInfo}
        />
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontWeight: 700, fontSize: 14, textTransform: "uppercase", letterSpacing: ".04em" }}>
          📍 {_t(lang, "Around me", "Around me", "Cerca de mí")}
        </span>
        <button
          type="button"
          data-testid="around-me-locate-btn"
          disabled={geoPending || hasUserLoc}
          onClick={handleLocate}
          style={{
            ...(hasUserLoc ? { background: "rgba(255,255,255,.1)", color: MUTE } : GOLD),
            color: hasUserLoc ? MUTE : INK,
            border: "none",
            borderRadius: 999,
            padding: "6px 12px",
            fontSize: 12,
            fontWeight: 700,
            cursor: geoPending ? "wait" : hasUserLoc ? "default" : "pointer",
            opacity: geoPending ? 0.6 : 1,
            fontFamily: "'Bricolage Grotesque',system-ui,sans-serif",
            textTransform: "uppercase",
            letterSpacing: ".02em",
          }}
          aria-label={geoPending ? _t(lang, "Localisation en cours...", "Locating...", "Localizando...") : hasUserLoc ? _t(lang, "Localisé", "Located", "Localizado") : _t(lang, "Me localiser", "Locate me", "Localizarme")}
        >
          {geoPending ? "⟳" : hasUserLoc ? _t(lang, "Localisé ✓", "Located ✓", "Localizado ✓") : _t(lang, "Me localiser", "Locate me", "Localizarme")}
        </button>
      </div>

      {geoError && (
        <div style={{ fontSize: 11, color: "#F4845F", marginBottom: 8 }}>
          ⚠ {geoError}
        </div>
      )}

      {showFallback && (
        <div style={{ fontSize: 11, color: MUTE, marginBottom: 8 }}>
          {_t(lang,
            "Vous êtes hors zone de couverture ({region}). Affichage des plages à moins de 250 km.",
            "You're outside coverage area ({region}). Showing beaches within 250 km.",
            "Estás fuera de zona de cobertura ({region}). Mostrando playas a menos de 250 km."
          ).replace("{region}", region?.name || island)}
        </div>
      )}

      {showEmpty && (
        <div style={{ fontSize: 13, color: MUTE, textAlign: "center", padding: "16px 8px" }}>
          {_t(lang,
            "Aucune plage à moins de 250 km de cette position.",
            "No beaches within 250 km of this position.",
            "Ninguna playa a menos de 250 km de esta posición."
          )}
        </div>
      )}

      {!showEmpty && topBeaches.length > 0 && (
        <AroundMeSortPanel
          beaches={allSortedBeaches}
          onBeachClick={handleBeachClick}
          lang={lang}
          limit={5}
        />
      )}

      {!hasUserLoc && !geoPending && !showInfo && (
        <div style={{ fontSize: 12, color: MUTE, textAlign: "center", padding: "8px 0" }}>
          {_t(lang, "Cliquez sur « Me localiser » pour voir les plages autour de vous.", "Tap \"Locate me\" to see beaches around you.", "Toca \"Localizarme\" para ver playas cerca de ti.")}
        </div>
      )}
    </div>
  )
}