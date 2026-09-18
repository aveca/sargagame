/**
 * PartnerContext — slot « services contextuels » (transport + shopping local + support WhatsApp).
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

function WhatsAppGlyph() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="#25D366" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M12 2C6.48 2 2 6.48 2 12c0 4.42 3.58 8 8 8s8-3.58 8-8c0-1.73-.48-3.33-1.28-4.66L20 2l-4.5 4.5C16.55 5.78 15.05 5 13.5 5c-2.48 0-4.5 2.02-4.5 4.5S11.02 14 13.5 14c1.55 0 3.05-.78 3.9-1.94L12 15.5 8.5 19l1.5-4.5C9.78 15.05 9 13.55 9 12c0-2.48 2.02-4.5 4.5-4.5s4.5 2.02 4.5 4.5c0 .78-.17 1.5-.47 2.15l4.5 4.5 2-2-4.5-4.5A8.04 8.04 0 0 0 12 2z"/>
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

function WhatsAppBadge({ lang }) {
  return (
    <span style={{ font: "800 8.5px/1 'Bricolage Grotesque',system-ui,sans-serif", letterSpacing: ".09em", textTransform: "uppercase", color: "#166534", background: "#dcfce7", border: "1px solid rgba(37, 211, 102, 0.3)", borderRadius: 4, padding: "2px 5px" }}>
      {t3(lang, "Support", "Support", "Soporte")}
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
            if (ctx.transport) track && track(PARTNER_EVENTS.VIEW, { beach_id: beach && beach.id, trackingId: ctx.transport.trackingId, kind: ctx.transport.isWhatsApp ? "support" : "transport" });
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

  const isWhatsAppPartner = (p) => p && p.isWhatsApp === true;

  const renderPartnerCard = (p, kind) => {
    const isWA = isWhatsAppPartner(p);
    const Glyph = isWA ? WhatsAppGlyph : kind === "transport" ? TaxiGlyph : BagGlyph;
    const BadgeComp = isWA ? WhatsAppBadge : Badge;
    const bgColor = isWA ? "#ECFDF5" : kind === "transport" ? "#FFF9E6" : "#fff";
    const borderColor = isWA ? "#25D366" : kind === "transport" ? "#FFC72C" : "rgba(13,11,20,.16)";
    const shadowColor = isWA ? "#25D366" : kind === "transport" ? "#FFC72C" : "rgba(13,11,20,.07)";
    const btnBg = isWA ? "#25D366" : kind === "transport" ? "#FFC72C" : "transparent";
    const btnTextColor = isWA ? "#fff" : kind === "transport" ? "#0D0B14" : "#1a1726";
    const btnBorder = isWA ? "#166534" : kind === "transport" ? "#0D0B14" : "#1a1726";
    const btnShadow = isWA ? "#166534" : kind === "transport" ? "#0D0B14" : "#1a1726";

    // Texte principal selon le type
    let mainText, subText;
    if (isWA) {
      mainText = t3(lang, "Besoin d'aide ou d'une recommandation ?", "Need help or a recommendation?", "¿Necesitas ayuda o una recomendación?");
      // Nom du partenaire visible comme sur toutes les cartes (badge « Support »
      // seul était anonyme) : identification transparente, règle « services
      // contextuels nommés » (fix UX-003).
      subText = `${p.name} · ${t3(lang, "Écris-nous sur WhatsApp", "Message us on WhatsApp", "Escríbenos por WhatsApp")}`;
    } else if (kind === "transport") {
      mainText = t3(lang, "Besoin d'un trajet vers cette plage ?", "Need a ride to this beach?", "¿Necesitas transporte a esta playa?");
      subText = `${p.name} · ${p.category}`;
    } else {
      mainText = p.location
        ? t3(lang, `Un souvenir de ${p.location} ?`, `A souvenir from ${p.location}?`, `¿Un recuerdo de ${p.location}?`)
        : t3(lang, "Shopping local", "Local shopping", "Compras locales");
      subText = `${p.name} · ${p.category}`;
    }

    // Texte du bouton
    const btnText = isWA
      ? t3(lang, "WhatsApp →", "WhatsApp →", "WhatsApp →")
      : kind === "transport"
      ? t3(lang, "Y aller →", "Get a ride →", "Ir →")
      : t3(lang, "Voir →", "View →", "Ver →");

    return (
      <div key={p.trackingId} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 14px", borderRadius: 14, background: bgColor, border: `2px solid ${borderColor}`, boxShadow: `2px 2px 0 ${shadowColor}`, fontFamily: "'Bricolage Grotesque',system-ui,sans-serif" }}>
        <Glyph />
        <div style={{ flex: "1 1 auto", minWidth: 0 }}>
          <div style={{ marginBottom: 3 }}><BadgeComp lang={lang} /></div>
          <div style={{ font: "800 13.5px/1.25 'Bricolage Grotesque',system-ui,sans-serif", color: "#1a1726" }}>
            {mainText}
          </div>
          <div style={{ font: "600 11.5px/1.35 'Bricolage Grotesque',system-ui,sans-serif", color: isWA ? "#166534" : kind === "transport" ? "#8B5A00" : "#6b6b75", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {subText}
          </div>
        </div>
        <a
          href={partnerOutboundUrl(p, beach)}
          target="_blank"
          rel={isWA ? "noopener noreferrer" : "noopener noreferrer sponsored"}
          onClick={(e) => { e.preventDefault(); openOutbound(p, isWA ? "support" : kind); }}
          style={{ flex: "0 0 auto", display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: 44, font: "800 12px/1 'Bricolage Grotesque',system-ui,sans-serif", color: btnTextColor, textDecoration: "none", background: btnBg, border: `2px solid ${btnBorder}`, borderRadius: 10, padding: "8px 12px", boxShadow: `2px 2px 0 ${btnShadow}`, whiteSpace: "nowrap" }}
        >
          {btnText}
        </a>
      </div>
    );
  };

  return (
    <div ref={boxRef} style={{ display: "flex", flexDirection: "column", gap: 10, margin: "16px 0 0" }}>
      {transport && renderPartnerCard(transport, "transport")}
      {shopping.map((s) => renderPartnerCard(s, "shopping"))}
    </div>
  );
}

export default PartnerContext;
