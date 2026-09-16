/**
 * PartnerProductCard — carte produit partenaire (commerce natif).
 *
 * Affiche : photo, nom, prix réel, variantes/options, dispo, quantité, total, CTA "Ajouter au panier".
 * Utilise les capacités du partenaire (catalog/product/quote/availability/order).
 * Design : grammaire comic (bord 2.5px ink + ombre dure, Bricolage, ≥44px), i18n FR/EN/ES.
 * Tracking : sg_product_view, sg_cart_add.
 *
 * Props:
 *  - partner: objet partenaire (du catalogue, avec capabilities)
 *  - product: objet produit (id, name, price_cents, currency, image_url, variants[], description)
 *  - beach: contexte plage (optionnel, pour quote/availability)
 *  - lang: "fr" | "en" | "es"
 *  - track: fonction tracking (sgUid + logAnalyticsEvent)
 *  - onAddToCart: callback (item ajouté au panier)
 */
import { useEffect, useRef, useState } from "react";
import { PARTNER_COMMERCE_EVENTS, track as pcTrack, formatPrice, canPartner } from "../lib/partner-commerce.js";

function t3(lang, fr, en, es) {
  return lang === "en" ? en : lang === "es" ? es : fr;
}

function ImagePlaceholder({ style }) {
  return (
    <div style={{ ...style, display: "flex", alignItems: "center", justifyContent: "center", background: "#f0f0f0", color: "#999", font: "600 12px/1 'Bricolage Grotesque',system-ui,sans-serif" }}>
      Photo indisponible
    </div>
  );
}

function Badge({ children, variant = "default", style = {} }) {
  const variants = {
    default: { bg: "#fbf2c4", border: "1px solid rgba(13,11,20,.18)", color: "#7a7320" },
    available: { bg: "#dcfce7", border: "1px solid #16a34a", color: "#166534" },
    unavailable: { bg: "#fee2e2", border: "1px solid #dc2626", color: "#991b1b" },
    partner: { bg: "#fff8e8", border: "1px solid #eab308", color: "#b87a00" },
  };
  const v = variants[variant] || variants.default;
  return (
    <span style={{
      font: "700 8.5px/1 'Bricolage Grotesque',system-ui,sans-serif",
      letterSpacing: ".08em",
      textTransform: "uppercase",
      ...v,
      borderRadius: 4,
      padding: "2px 6px",
      ...style
    }}>
      {children}
    </span>
  );
}

export function PartnerProductCard({ partner, product, beach, lang = "fr", track, onAddToCart }) {
  const imgRef = useRef(null);
  const viewedRef = useRef(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [availability, setAvailability] = useState(null);
  const [checkingAvailability, setCheckingAvailability] = useState(false);

  // sg_product_view — une fois visible (seuil 50%)
  useEffect(() => {
    if (!imgRef.current || typeof IntersectionObserver === "undefined" || viewedRef.current) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting || viewedRef.current) return;
        viewedRef.current = true;
        try { track && track(PARTNER_COMMERCE_EVENTS.PRODUCT_VIEW, { beach_id: beach?.id, partner_id: partner.trackingId, product_id: product.id }); } catch (_) {}
        io.disconnect();
      });
    }, { threshold: 0.5 });
    io.observe(imgRef.current);
    return () => io.disconnect();
  }, [track, beach?.id, partner.trackingId, product.id]);

  // Vérifier disponibilité au mount si capability
  useEffect(() => {
    if (!canPartner(partner, "availability") || !product.id) return;
    let cancelled = false;
    setCheckingAvailability(true);
    pcTrack("availability", partner, { product_id: product.id, quantity, variants: selectedVariant, beach_context: beach })
      .then((res) => { if (!cancelled) setAvailability(res); })
      .catch(() => { if (!cancelled) setAvailability({ available: false, reason: "check_failed" }); })
      .finally(() => { if (!cancelled) setCheckingAvailability(false); });
    return () => { cancelled = true; };
  }, [partner.trackingId, product.id, quantity, selectedVariant, beach]);

  const handleAddToCart = () => {
    const item = {
      partner_id: partner.trackingId,
      partner_name: partner.name,
      product_id: product.id,
      product_name: product.name,
      price_cents: product.price_cents,
      currency: product.currency || "EUR",
      quantity,
      variants: selectedVariant,
      image_url: product.image_url,
      beach_id: beach?.id,
      beach_name: beach?.name,
    };
    if (onAddToCart) onAddToCart(item);
    try { track && track(PARTNER_COMMERCE_EVENTS.CART_ADD, { beach_id: beach?.id, partner_id: partner.trackingId, product_id: product.id, quantity, variant: selectedVariant }); } catch (_) {}
  };

  const isAvailable = availability?.available !== false;
  const totalCents = (product.price_cents || 0) * quantity;

  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 12,
      padding: "14px 15px", borderRadius: 16,
      border: "2.5px solid #0D0B14", boxShadow: "4px 4px 0 #0D0B14",
      background: "#FFFFFF", fontFamily: "'Bricolage Grotesque',system-ui,sans-serif",
    }}>
      {/* Header : photo + badge Partenaire */}
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <div ref={imgRef} style={{
          flex: "0 0 80px", height: 80, borderRadius: 10,
          border: "2px solid rgba(13,11,20,.12)", overflow: "hidden",
          background: "#fafafa", position: "relative",
        }}>
          {product.image_url && !imageError ? (
            <img
              src={product.image_url}
              alt={product.name}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageError(true)}
            />
          ) : (
            <ImagePlaceholder style={{ width: "100%", height: "100%" }} />
          )}
          {!imageLoaded && !imageError && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,.8)" }}>
              <div style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid #FFC72C", borderTopColor: "transparent", animation: "spin 1s linear infinite" }} />
            </div>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <Badge variant="partner">{t3(lang, "Partenaire", "Partner", "Socio")}</Badge>
            {partner.category && <Badge variant="default">{partner.category}</Badge>}
          </div>
          <div style={{ font: "800 14px/1.25 'Bricolage Grotesque',system-ui,sans-serif", color: "#1a1726", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {product.name}
          </div>
        </div>
      </div>

      {/* Prix + dispo */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ font: "800 18px/1.2 'Bricolage Grotesque',system-ui,sans-serif", color: "#0D0B14" }}>
          {formatPrice(totalCents, product.currency || "EUR", lang)}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {checkingAvailability ? (
            <div style={{ width: 12, height: 12, borderRadius: "50%", border: "2px solid #FFC72C", borderTopColor: "transparent", animation: "spin 1s linear infinite" }} />
          ) : availability ? (
            <Badge variant={isAvailable ? "available" : "unavailable"} style={{ fontSize: "9px" }}>
              {t3(lang,
                isAvailable ? "Disponible" : "Indisponible",
                isAvailable ? "Available" : "Unavailable",
                isAvailable ? "Disponible" : "No disponible"
              )}
            </Badge>
          ) : canPartner(partner, "availability") ? (
            <Badge variant="default" style={{ fontSize: "9px" }}>
              {t3(lang, "Vérifier dispo", "Check availability", "Verificar disponibilidad")}
            </Badge>
          ) : (
            <Badge variant="default" style={{ fontSize: "9px" }}>
              {t3(lang, "Voir chez le partenaire", "View at partner", "Ver en partner")}
            </Badge>
          )}
        </div>
      </div>

      {/* Variantes */}
      {product.variants && product.variants.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ font: "700 11.5px/1 'Bricolage Grotesque',system-ui,sans-serif", color: "#1a1726", textTransform: "uppercase", letterSpacing: ".05em" }}>
            {t3(lang, "Options", "Options", "Opciones")}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {product.variants.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setSelectedVariant(selectedVariant?.id === v.id ? null : v)}
                style={{
                  padding: "8px 12px", borderRadius: 999,
                  border: `2.5px solid ${selectedVariant?.id === v.id ? "#0D0B14" : "rgba(13,11,20,.18)"}`,
                  background: selectedVariant?.id === v.id ? "#0D0B14" : "#FFFFFF",
                  color: selectedVariant?.id === v.id ? "#FFFFFF" : "#1a1726",
                  font: "700 11.5px/1 'Bricolage Grotesque',system-ui,sans-serif",
                  cursor: "pointer", boxShadow: "2px 2px 0 rgba(13,11,20,.08)",
                  transition: "all .08s ease",
                }}
              >
                {v.name}{v.price_cents && ` +${formatPrice(v.price_cents, product.currency || "EUR", lang)}`}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Quantité */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ font: "700 11.5px/1 'Bricolage Grotesque',system-ui,sans-serif", color: "#1a1726", textTransform: "uppercase", letterSpacing: ".05em" }}>
          {t3(lang, "Quantité", "Quantity", "Cantidad")}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            type="button"
            onClick={() => setQuantity(Math.max(1, quantity - 1))}
            disabled={quantity <= 1}
            style={{
              width: 36, height: 36, borderRadius: 8,
              border: "2px solid rgba(13,11,20,.18)", background: "#FFFFFF",
              color: quantity <= 1 ? "#ccc" : "#0D0B14",
              font: "800 16px/1 'Bricolage Grotesque',system-ui,sans-serif",
              cursor: quantity <= 1 ? "not-allowed" : "pointer",
              boxShadow: "2px 2px 0 rgba(13,11,20,.05)",
            }}
          >−</button>
          <span style={{ font: "800 16px/1 'Bricolage Grotesque',system-ui,sans-serif", color: "#0D0B14", minWidth: 30, textAlign: "center" }}>{quantity}</span>
          <button
            type="button"
            onClick={() => setQuantity(quantity + 1)}
            style={{
              width: 36, height: 36, borderRadius: 8,
              border: "2px solid rgba(13,11,20,.18)", background: "#FFFFFF",
              color: "#0D0B14", font: "800 16px/1 'Bricolage Grotesque',system-ui,sans-serif",
              cursor: "pointer", boxShadow: "2px 2px 0 rgba(13,11,20,.05)",
            }}
          >+</button>
        </div>
      </div>

      {/* Total + CTA */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 4, paddingTop: 8, borderTop: "1px solid rgba(13,11,20,.08)" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ font: "600 11.5px/1 'Bricolage Grotesque',system-ui,sans-serif", color: "#6b6b75" }}>
            {t3(lang, "Total", "Total", "Total")}
          </span>
          <span style={{ font: "800 18px/1.2 'Bricolage Grotesque',system-ui,sans-serif", color: "#0D0B14" }}>
            {formatPrice(totalCents, product.currency || "EUR", lang)}
          </span>
        </div>
        <button
          type="button"
          onClick={handleAddToCart}
          disabled={!isAvailable}
          style={{
            flex: "0 0 auto", minHeight: 48,
            padding: "10px 16px", borderRadius: 10,
            border: "2.5px solid #0D0B14", boxShadow: "3px 3px 0 #0D0B14",
            background: isAvailable ? "#FFC72C" : "#e5e5e5",
            color: isAvailable ? "#0D0B14" : "#999",
            font: "800 13px/1 'Bricolage Grotesque',system-ui,sans-serif",
            textDecoration: "none", cursor: isAvailable ? "pointer" : "not-allowed",
            whiteSpace: "nowrap", transition: "transform .08s ease",
          }}
        >
          {t3(lang, "Ajouter au panier", "Add to cart", "Añadir al carrito")}
        </button>
      </div>

      <style jsx>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

export default PartnerProductCard;