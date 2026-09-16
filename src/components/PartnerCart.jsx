/**
 * PartnerCart — panier slide-in (mobile-first, desktop responsive).
 *
 * Affiche : liste articles, quantité, variantes, prix unitaire, total, CTA checkout.
 * Persiste dans localStorage (sg_partner_cart).
 * Tracking : sg_cart_open, sg_checkout_start.
 *
 * Props:
 *  - isOpen: boolean
 *  - onClose: () => void
 *  - onCheckout: () => void
 *  - lang: "fr" | "en" | "es"
 *  - track: fonction tracking
 *  - region: région courante
 *  - beach: contexte plage (optionnel)
 */
import { useEffect, useRef, useState } from "react";
import { getPartnerCart, removeFromPartnerCart, updatePartnerCartQuantity, clearPartnerCart, getPartnerCartTotal, formatPrice, PARTNER_COMMERCE_EVENTS } from "../lib/partner-commerce.js";

function t3(lang, fr, en, es) {
  return lang === "en" ? en : lang === "es" ? es : fr;
}

export function PartnerCart({ isOpen, onClose, onCheckout, lang = "fr", track, region, beach }) {
  const [cart, setCart] = useState([]);
  const panelRef = useRef(null);
  const lastFocusRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      lastFocusRef.current = document.activeElement;
      setCart(getPartnerCart());
      try { track && track(PARTNER_COMMERCE_EVENTS.CART_OPEN, { region, beach_id: beach?.id, item_count: cart.length }); } catch (_) {}
      document.body.style.overflow = "hidden";
      // Focus trap
      setTimeout(() => panelRef.current?.focus(), 50);
    } else {
      document.body.style.overflow = "";
      lastFocusRef.current?.focus?.();
    }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  // Sync cart from localStorage on mount and storage events
  useEffect(() => {
    const sync = () => setCart(getPartnerCart());
    sync();
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  const total = getPartnerCartTotal(cart);

  const handleRemove = (partnerId, productId, variants) => {
    const newCart = removeFromPartnerCart(partnerId, productId, variants);
    setCart(newCart);
  };

  const handleQuantityChange = (partnerId, productId, variants, quantity) => {
    const newCart = updatePartnerCartQuantity(partnerId, productId, variants, quantity);
    setCart(newCart);
  };

  const handleClear = () => {
    clearPartnerCart();
    setCart([]);
  };

  const handleCheckout = () => {
    try { track && track(PARTNER_COMMERCE_EVENTS.CHECKOUT_START, { region, beach_id: beach?.id, item_count: cart.length, total_cents: total }); } catch (_) {}
    if (onCheckout) onCheckout();
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div
        style={{
          position: "fixed", inset: 0, zIndex: 9998,
          background: "rgba(13,11,20,.6)", backdropFilter: "blur(4px)",
          animation: "fadeIn .2s ease",
        }}
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Panel */}
      <div
        ref={panelRef}
        tabIndex={-1}
        style={{
          position: "fixed", right: 0, top: 0, bottom: 0, zIndex: 9999,
          width: "100%", maxWidth: 420,
          background: "#FDFCF7", boxShadow: "-8px 0 32px rgba(13,11,20,.18)",
          display: "flex", flexDirection: "column",
          animation: "slideIn .3s cubic-bezier(.34,1.56,.64,1)",
          outline: "none",
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t3(lang, "Votre panier", "Your cart", "Tu carrito")}
      >
        {/* Header */}
        <div style={{
          position: "sticky", top: 0, zIndex: 10,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 16px", borderBottom: "2.5px solid #0D0B14",
          background: "#FDFCF7",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#FFC72C", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "2px 2px 0 #0D0B14" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0D0B14" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 8h12l-1 12H7L6 8z" />
                <path d="M9 8V6a3 3 0 0 1 6 0v2" />
              </svg>
            </div>
            <span style={{ font: "800 16px/1 'Bricolage Grotesque',system-ui,sans-serif", color: "#0D0B14" }}>
              {t3(lang, "Panier ({count})", "Cart ({count})", "Carrito ({count})").replace("{count}", cart.length)}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 40, height: 40, borderRadius: "50%",
              border: "2.5px solid #0D0B14", background: "#FFFFFF",
              color: "#0D0B14", font: "800 18px/1 system-ui,sans-serif",
              cursor: "pointer", boxShadow: "2px 2px 0 #0D0B14",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
            aria-label={t3(lang, "Fermer", "Close", "Cerrar")}
          >✕</button>
        </div>

        {/* Items */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px 0", display: "flex", flexDirection: "column", gap: 10 }}>
          {cart.length === 0 ? (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: "40px 20px", textAlign: "center" }}>
              <div style={{ width: 80, height: 80, borderRadius: "50%", background: "#fff8e8", border: "2px dashed #FFC72C", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "2px 2px 0 #FFC72C" }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#B87A00" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 8h12l-1 12H7L6 8z" />
                  <path d="M9 8V6a3 3 0 0 1 6 0v2" />
                </svg>
              </div>
              <span style={{ font: "700 14px/1.3 'Bricolage Grotesque',system-ui,sans-serif", color: "#1a1726" }}>
                {t3(lang, "Votre panier est vide", "Your cart is empty", "Tu carrito está vacío")}
              </span>
              <span style={{ font: "500 12px/1.4 'Bricolage Grotesque',system-ui,sans-serif", color: "#6b6b75" }}>
                {t3(lang, "Ajoutez des produits partenaires pour commencer", "Add partner products to get started", "Añade productos de socios para empezar")}
              </span>
            </div>
          ) : (
            cart.map((item) => (
              <div key={`${item.partner_id}|${item.product_id}|${JSON.stringify(item.variants || {})}`} style={{
                display: "flex", gap: 10, padding: "10px", borderRadius: 12,
                background: "#FFFFFF", border: "2px solid rgba(13,11,20,.1)", boxShadow: "2px 2px 0 rgba(13,11,20,.05)",
              }}>
                <div style={{ flex: "0 0 56px", height: 56, borderRadius: 8, border: "2px solid rgba(13,11,20,.1)", overflow: "hidden", background: "#fafafa", position: "relative" }}>
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.product_name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#999", font: "500 9px/1 'Bricolage Grotesque'" }}>
                      {t3(lang, "Photo", "Photo", "Foto")}
                    </div>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ font: "800 12px/1.2 'Bricolage Grotesque',system-ui,sans-serif", color: "#1a1726", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block" }}>
                        {item.product_name}
                      </span>
                      {item.variants && (
                        <span style={{ font: "500 10px/1.2 'Bricolage Grotesque',system-ui,sans-serif", color: "#6b6b75", display: "block" }}>
                          {Object.values(item.variants).join(", ")}
                        </span>
                      )}
                      <span style={{ font: "600 11px/1 'Bricolage Grotesque',system-ui,sans-serif", color: "#B87A00", marginTop: 2 }}>
                        {formatPrice(item.price_cents * (item.quantity || 1), item.currency || "EUR", lang)}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemove(item.partner_id, item.product_id, item.variants)}
                      style={{
                        flex: "0 0 auto", width: 28, height: 28, borderRadius: 6,
                        border: "2px solid rgba(13,11,20,.15)", background: "#fff5f5",
                        color: "#dc2626", font: "700 14px/1 system-ui", cursor: "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}
                      aria-label={t3(lang, "Retirer", "Remove", "Eliminar")}
                    >✕</button>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => handleQuantityChange(item.partner_id, item.product_id, item.variants, (item.quantity || 1) - 1)}
                      disabled={(item.quantity || 1) <= 1}
                      style={{
                        width: 28, height: 28, borderRadius: 6,
                        border: "2px solid rgba(13,11,20,.15)", background: "#FFFFFF",
                        color: (item.quantity || 1) <= 1 ? "#ccc" : "#0D0B14",
                        font: "800 14px/1 system-ui", cursor: (item.quantity || 1) <= 1 ? "not-allowed" : "pointer",
                      }}
                    >−</button>
                    <span style={{ font: "700 13px/1 'Bricolage Grotesque',system-ui,sans-serif", color: "#0D0B14", minWidth: 24, textAlign: "center" }}>
                      {item.quantity || 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleQuantityChange(item.partner_id, item.product_id, item.variants, (item.quantity || 1) + 1)}
                      style={{
                        width: 28, height: 28, borderRadius: 6,
                        border: "2px solid rgba(13,11,20,.15)", background: "#FFFFFF",
                        color: "#0D0B14", font: "800 14px/1 system-ui", cursor: "pointer",
                      }}
                    >+</button>
                    <span style={{ flex: 1 }} />
                    <span style={{ font: "800 13px/1 'Bricolage Grotesque',system-ui,sans-serif", color: "#0D0B14" }}>
                      {formatPrice((item.price_cents || 0) * (item.quantity || 1), item.currency || "EUR", lang)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          )}
        </div>

        {/* Footer : total + CTA */}
        {cart.length > 0 && (
          <div style={{
            position: "sticky", bottom: 0, zIndex: 10,
            padding: "16px", borderTop: "2.5px solid #0D0B14",
            background: "#FDFCF7",
            display: "flex", flexDirection: "column", gap: 10,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ font: "700 13px/1 'Bricolage Grotesque',system-ui,sans-serif", color: "#1a1726" }}>
                {t3(lang, "Total", "Total", "Total")}
              </span>
              <span style={{ font: "800 22px/1 'Bricolage Grotesque',system-ui,sans-serif", color: "#0D0B14" }}>
                {formatPrice(total, cart[0]?.currency || "EUR", lang)}
              </span>
            </div>
            <button
              type="button"
              onClick={handleCheckout}
              style={{
                width: "100%", minHeight: 52,
                padding: "14px 20px", borderRadius: 12,
                border: "2.5px solid #0D0B14", boxShadow: "4px 4px 0 #0D0B14",
                background: "#FFC72C", color: "#0D0B14",
                font: "800 15px/1 'Bricolage Grotesque',system-ui,sans-serif",
                cursor: "pointer", transition: "transform .08s ease",
              }}
            >
              {t3(lang, "Passer au paiement →", "Proceed to payment →", "Ir al pago →")}
            </button>
            {cart.length > 1 && (
              <button
                type="button"
                onClick={handleClear}
                style={{
                  width: "100%", padding: "10px", borderRadius: 8,
                  border: "2px solid rgba(13,11,20,.15)", background: "transparent",
                  color: "#dc2626", font: "700 12px/1 'Bricolage Grotesque',system-ui,sans-serif",
                  cursor: "pointer",
                }}
              >
                {t3(lang, "Vider le panier", "Clear cart", "Vaciar carrito")}
              </button>
            )}
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
      `}</style>
    </>
  );
}

export default PartnerCart;