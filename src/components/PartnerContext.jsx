/**
 * PartnerContext — slot « services contextuels » (transport + shopping local).
 *
 * Placement (par l'appelant, JAMAIS dans le verdict) : APRÈS la consultation
 * plage + APRÈS les alternatives « où aller plutôt » (décision aller/ne-pas-
 * aller). Ne remplace AUCUN CTA produit (premium, alertes, rapport).
 *
 * Règles dures :
 *  - Résolution 100% config (src/lib/partners.js + catalogue généré) : ce
 *    composant ne connaît AUCUNE région/URL en dur (il reçoit `catalog`).
 *  - UN SEUL CTA transport principal (local > multi-îles, cf. partners.js).
 *  - Badge « Partenaire » explicite + rel sponsored ; verdict 100% ERDDAP.
 *  - Tracking canonique : sg_partner_view / sg_partner_cta / sg_partner_outbound
 *    (allowlistés SG_FUNNEL_EVENTS + FUNNEL_KEYS). Zéro PII (beach_id +
 *    trackingId uniquement).
 *  - Kill-switch : ?partnerctx=0 (cf. partnerCtxOn) → rend null.
 *  - Design : grammaire comic (bord 2.5px ink + ombre dure, Bricolage, ≥44px),
 *    i18n FR/EN/ES, pas d'anim (reduced-motion safe par construction).
 */
import { useEffect, useMemo, useRef } from "react";
import catalog from "../lib/partners-catalog.json";
import { PARTNER_EVENTS, resolveContext, partnerOutboundUrl } from "../lib/partners.js";

function t3(lang, fr, en, es) {
  return lang === "en" ? en : lang === "es" ? es : fr;
}

function TaxiGlyph() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#B87A00" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M5 11l1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11" />
      <rect x="4" y="11" width="16" height="6" rx="1.5" />
      <circle cx="8" cy="17.5" r="1.8" />
      <circle cx="16" cy="17.5" r="1.8" />
    </svg>
  );
}

function BagGlyph() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#1a1726" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M6 8h12l-1 12H7L6 8z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </svg>
  );
}

function Badge({ lang }) {
  return (
    <span style={{ font: "800 8.5px/1 'Bricolage Grotesque',system-ui,sans-serif", letterSpacing: ".09em", textTransform: "uppercase", color: "#7a7320", background: "#fbf2c4", border: "1px solid rgba(13,11,20,.18)", borderRadius: 4, padding: "2px 5px" }}>
      {t3(lang, "Partenaire", "Partner", "Socio")}
    </span>
  );
}

export function PartnerContext({ regionId, beach, lang = "fr", track }) {
  const boxRef = useRef(null);
  const viewedRef = useRef("");

  const ctx = useMemo(() => {
    try {
      return resolveContext(catalog, regionId, beach);
    } catch (_) {
      return null;
    }
  }, [regionId, beach && beach.id, beach && beach.island, beach && beach.name]);

  // sg_partner_view — une fois par partenaire affiché (seuil 50% visible).
  useEffect(() => {
    if (!ctx || !boxRef.current || typeof IntersectionObserver === "undefined") return;
    const key = (ctx.transport ? ctx.transport.trackingId : "-") + "|" + ctx.shopping.map((s) => s.trackingId).join(",");
    if (viewedRef.current === key) return;
    const el = boxRef.current;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting || viewedRef.current === key) return;
          viewedRef.current = key;
          try {
            if (ctx.transport) track && track(PARTNER_EVENTS.VIEW, { beach_id: beach && beach.id, trackingId: ctx.transport.trackingId, kind: "transport" });
            ctx.shopping.forEach((s) => {
              try { track && track(PARTNER_EVENTS.VIEW, { beach_id: beach && beach.id, trackingId: s.trackingId, kind: "shopping" }); } catch (_) {}
            });
          } catch (_) {}
          io.disconnect();
        });
      },
      { threshold: 0.5 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ctx, track, beach && beach.id]);

  if (!ctx || !beach) return null;
  const { transport, shopping } = ctx;

  const openOutbound = (p, kind) => {
    const url = partnerOutboundUrl(p, beach);
    if (!url) return;
    try { track && track(PARTNER_EVENTS.CTA, { beach_id: beach.id, trackingId: p.trackingId, kind }); } catch (_) {}
    try { track && track(PARTNER_EVENTS.OUTBOUND, { beach_id: beach.id, trackingId: p.trackingId, kind, url }); } catch (_) {}
    try { window.open(url, "_blank", "noopener,noreferrer"); } catch (_) {}
  };

  return (
    <div ref={boxRef} style={{ display: "flex", flexDirection: "column", gap: 10, margin: "16px 0 0" }}>
      {transport && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 14px", borderRadius: 14, background: "#FFF9E6", border: "2px solid #FFC72C", boxShadow: "2px 2px 0 #FFC72C", fontFamily: "'Bricolage Grotesque',system-ui,sans-serif" }}>
          <TaxiGlyph />
          <div style={{ flex: "1 1 auto", minWidth: 0 }}>
            <div style={{ marginBottom: 3 }}><Badge lang={lang} /></div>
            <div style={{ font: "800 13.5px/1.25 'Bricolage Grotesque',system-ui,sans-serif", color: "#1a1726" }}>
              {t3(lang, "Besoin d'un trajet vers cette plage ?", "Need a ride to this beach?", "¿Necesitas transporte a esta playa?")}
            </div>
            <div style={{ font: "600 11.5px/1.35 'Bricolage Grotesque',system-ui,sans-serif", color: "#8B5A00", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {transport.name} · {transport.category}
            </div>
          </div>
          <a
            href={partnerOutboundUrl(transport, beach)}
            target="_blank"
            rel="noopener noreferrer sponsored"
            onClick={(e) => { e.preventDefault(); openOutbound(transport, "transport"); }}
            style={{ flex: "0 0 auto", display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: 44, font: "800 12px/1 'Bricolage Grotesque',system-ui,sans-serif", color: "#0D0B14", textDecoration: "none", background: "#FFC72C", border: "2px solid #0D0B14", borderRadius: 10, padding: "8px 12px", boxShadow: "2px 2px 0 #0D0B14", whiteSpace: "nowrap" }}
          >
            {t3(lang, "Y aller →", "Get a ride →", "Ir →")}
          </a>
        </div>
      )}
      {shopping.map((s) => (
        <div key={s.trackingId} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 13px", borderRadius: 14, border: "2px solid rgba(13,11,20,.16)", background: "#fff", boxShadow: "2px 2px 0 rgba(13,11,20,.07)", fontFamily: "'Bricolage Grotesque',system-ui,sans-serif" }}>
          <BagGlyph />
          <div style={{ flex: "1 1 auto", minWidth: 0 }}>
            <div style={{ marginBottom: 3 }}><Badge lang={lang} /></div>
            <div style={{ font: "800 13.5px/1.25 'Bricolage Grotesque',system-ui,sans-serif", color: "#1a1726", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {s.location
                ? t3(lang, `Un souvenir de ${s.location} ?`, `A souvenir from ${s.location}?`, `¿Un recuerdo de ${s.location}?`)
                : t3(lang, "Shopping local", "Local shopping", "Compras locales")}
            </div>
            <div style={{ font: "600 11.5px/1.35 'Bricolage Grotesque',system-ui,sans-serif", color: "#6b6b75", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {s.name} · {s.category}
            </div>
          </div>
          <a
            href={partnerOutboundUrl(s, beach)}
            target="_blank"
            rel="noopener noreferrer sponsored"
            onClick={(e) => { e.preventDefault(); openOutbound(s, "shopping"); }}
            style={{ flex: "0 0 auto", display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: 44, font: "800 12px/1 'Bricolage Grotesque',system-ui,sans-serif", color: "#1a1726", textDecoration: "none", border: "2px solid #1a1726", borderRadius: 10, padding: "8px 12px", boxShadow: "2px 2px 0 #1a1726", whiteSpace: "nowrap" }}
          >
            {t3(lang, "Voir →", "View →", "Ver →")}
          </a>
        </div>
      ))}
    </div>
  );
}

export default PartnerContext;
