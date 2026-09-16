/**
 * PartnerCheckout — checkout natif Sargagame pour commandes partenaires.
 *
 * Flux :
 *  1. Récapitulatif commande (articles, total)
 *  2. Infos client (email, nom, téléphone optionnel)
 *  3. Paiement Mollie Components (card, Apple Pay, Google Pay) — réutilise infra existante
 *  4. Redirection vers checkoutUrl Mollie
 *  5. Page succès → confirmSargagameOrder → fulfillment
 *
 * Props:
 *  - cart: array d'articles (du panier)
 *  - onSuccess: (orderId, paymentId) => void
 *  - onCancel: () => void
 *  - lang: "fr" | "en" | "es"
 *  - track: fonction tracking
 *  - region: région courante
 *  - beach: contexte plage (optionnel)
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { getPartnerCart, getPartnerCartTotal, clearPartnerCart, createSargagameOrder, formatPrice, PARTNER_COMMERCE_EVENTS } from "../lib/partner-commerce.js";
import { loadMollieJs } from "../Sargasses_PROD.jsx";

function t3(lang, fr, en, es) {
  return lang === "en" ? en : lang === "es" ? es : fr;
}

const MOL_FIELD = { width: "100%", boxSizing: "border-box", minHeight: 46, padding: "4px 13px", borderRadius: 11, marginBottom: 13, border: "1px solid rgba(255,255,255,.14)", background: "#241837", display: "flex", alignItems: "center" };
const MOL_LABEL = { display: "block", fontSize: 11.5, fontWeight: 600, color: "rgba(255,255,255,.62)", marginBottom: 6, letterSpacing: ".01em" };

export function PartnerCheckout({ cart: cartProp, onSuccess, onCancel, lang = "fr", track, region, beach }) {
  const [cart, setCart] = useState(cartProp || []);
  const [step, setStep] = useState("details"); // details → payment → processing → success/error
  const [formData, setFormData] = useState({ email: "", name: "", phone: "" });
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderData, setOrderData] = useState(null);
  const mollieRef = useRef(null);
  const mollieMountedRef = useRef(false);

  const total = getPartnerCartTotal(cart);
  const currency = cart[0]?.currency || "EUR";

  useEffect(() => {
    if (cartProp) setCart(cartProp);
  }, [cartProp]);

  const validateForm = () => {
    const newErrors = {};
    if (!formData.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(formData.email)) newErrors.email = t3(lang, "Email invalide", "Invalid email", "Email inválido");
    if (!formData.name || formData.name.trim().length < 2) newErrors.name = t3(lang, "Nom requis", "Name required", "Nombre requerido");
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = async () => {
    if (!validateForm()) return;
    setStep("payment");
    try { track && track(PARTNER_COMMERCE_EVENTS.CHECKOUT_PAYMENT, { region, beach_id: beach?.id, item_count: cart.length, total_cents: total }); } catch (_) {}
    // Charger Mollie.js
    await loadMollieJs();
    // Monter Mollie Components au step payment
    setTimeout(() => mountMollie(), 100);
  };

  const mountMollie = () => {
    if (mollieMountedRef.current || !window.Mollie) return;
    try {
      // Créer la commande Sargagame + obtenir paymentId + checkoutUrl
      const order = await createSargagameOrder({
        cart, customer_email: formData.email, customer_name: formData.name,
        region, beach_id: beach?.id, lang,
      });
      setOrderData(order);
      mollieMountedRef.current = true;
      // Rediriger vers Mollie checkout
      if (order.checkoutUrl) {
        window.location.href = order.checkoutUrl;
      }
    } catch (e) {
      console.error("PartnerCheckout create order error:", e);
      setStep("error");
    }
  };

  const handleBack = () => {
    if (step === "payment") setStep("details");
    else if (step === "processing") setStep("payment");
  };

  const handleCancel = () => {
    if (onCancel) onCancel();
  };

  if (cart.length === 0) return null;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 10000,
      background: "#FDFCF7", display: "flex", flexDirection: "column",
      fontFamily: "'Bricolage Grotesque',system-ui,sans-serif",
    }}>
      {/* Header */}
      <div style={{
        position: "sticky", top: 0, zIndex: 10,
        padding: "14px 16px", borderBottom: "2.5px solid #0D0B14",
        background: "#FDFCF7", display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <button type="button" onClick={handleBack} disabled={step === "details"} style={{
          width: 40, height: 40, borderRadius: "50%", border: "2.5px solid #0D0B14",
          background: "#FFFFFF", color: "#0D0B14", font: "800 18px/1 system-ui",
          cursor: step === "details" ? "not-allowed" : "pointer", opacity: step === "details" ? 0.4 : 1,
          display: "flex", alignItems: "center", justifyContent: "center",
        }} aria-label={t3(lang, "Retour", "Back", "Atrás")}>←</button>
        <span style={{ flex: 1, textAlign: "center", font: "800 16px/1 'Bricolage Grotesque',system-ui,sans-serif", color: "#0D0B14" }}>
          {step === "details" ? t3(lang, "Informations", "Details", "Datos")
            : step === "payment" ? t3(lang, "Paiement", "Payment", "Pago")
            : step === "processing" ? t3(lang, "Traitement…", "Processing…", "Procesando…")
            : t3(lang, "Terminé", "Done", "Completado")}
        </span>
        <button type="button" onClick={handleCancel} style={{
          width: 40, height: 40, borderRadius: "50%", border: "2.5px solid #0D0B14",
          background: "#FFFFFF", color: "#0D0B14", font: "800 18px/1 system-ui",
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
        }} aria-label={t3(lang, "Annuler", "Cancel", "Cancelar")}>✕</button>
      </div>

      {/* Progress indicator */}
      <div style={{
        display: "flex", gap: 4, padding: "12px 16px 0", marginBottom: 8,
      }}>
        {["details", "payment", "success"].map((s, i) => (
          <div key={s} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div style={{
              width: 28, height: 28, borderRadius: "50%",
              border: "2.5px solid",
              borderColor: step === s || (step === "success" && i < 2) ? "#0D0B14" : "rgba(13,11,20,.2)",
              background: step === s || (step === "success" && i < 2) ? "#0D0B14" : "transparent",
              color: step === s || (step === "success" && i < 2) ? "#FFC72C" : "#999",
              font: "800 12px/1 'Bricolage Grotesque'", display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {i + 1}
            </div>
            <span style={{ font: "600 9px/1 'Bricolage Grotesque'", color: step === s || (step === "success" && i < 2) ? "#0D0B14" : "#999", textTransform: "uppercase" }}>
              {t3(lang, ["Infos", "Paiement", "Confirmation"][i], ["Details", "Payment", "Confirm"][i], ["Datos", "Pago", "Confirmar"][i])}
            </span>
          </div>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 100px" }}>
        {/* Order summary */}
        <div style={{ marginBottom: 16, borderRadius: 12, border: "2px solid rgba(13,11,20,.1)", background: "#FFFFFF", overflow: "hidden" }}>
          <div style={{ padding: "12px 14px", borderBottom: "1px solid rgba(13,11,20,.08)", font: "800 13px/1 'Bricolage Grotesque'", color: "#1a1726" }}>
            {t3(lang, "Récapitulatif ({count} articles)", "Summary ({count} items)", "Resumen ({count} artículos)").replace("{count}", cart.length)}
          </div>
          {cart.map((item) => (
            <div key={`${item.partner_id}|${item.product_id}|${JSON.stringify(item.variants || {})}`} style={{ display: "flex", gap: 10, padding: "10px 14px", borderTop: "1px solid rgba(13,11,20,.06)" }}>
              <div style={{ flex: "0 0 48px", height: 48, borderRadius: 6, border: "2px solid rgba(13,11,20,.1)", overflow: "hidden", background: "#fafafa" }}>
                {item.image_url ? <img src={item.image_url} alt={item.product_name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#999", font: "500 9px/1 'Bricolage Grotesque'" }}>{t3(lang, "Photo", "Photo", "Foto")}</div>}
              </div>
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ font: "700 11.5px/1.2 'Bricolage Grotesque'", color: "#1a1726", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.product_name}</span>
                {item.variants && <span style={{ font: "500 10px/1.2 'Bricolage Grotesque'", color: "#6b6b75" }}>{Object.values(item.variants).join(", ")}</span>}
                <span style={{ font: "700 11px/1 'Bricolage Grotesque'", color: "#B87A00" }}>{formatPrice((item.price_cents || 0) * (item.quantity || 1), item.currency || "EUR", lang)}</span>
                <span style={{ font: "600 10.5px/1 'Bricolage Grotesque'", color: "#6b6b75" }}>× {item.quantity || 1}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Total */}
        <div style={{ marginBottom: 16, padding: "14px", borderRadius: 12, background: "#fff8e8", border: "2px solid #FFC72C", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ font: "700 13px/1 'Bricolage Grotesque'", color: "#1a1726" }}>{t3(lang, "Total", "Total", "Total")}</span>
          <span style={{ font: "800 20px/1 'Bricolage Grotesque'", color: "#B87A00" }}>{formatPrice(total, currency, lang)}</span>
        </div>

        {/* Step content */}
        {step === "details" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <h3 style={{ font: "800 14px/1 'Bricolage Grotesque'", color: "#0D0B14", marginBottom: 8 }}>{t3(lang, "Vos coordonnées", "Your details", "Sus datos")}</h3>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ ...MOL_LABEL }}>{t3(lang, "Email *", "Email *", "Email *")}</span>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                style={{ ...MOL_FIELD, color: "#FFFFFF" }}
                placeholder="vous@exemple.com"
                autoComplete="email"
                required
              />
              {errors.email && <span style={{ font: "600 10px/1 'Bricolage Grotesque'", color: "#dc2626" }}>{errors.email}</span>}
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ ...MOL_LABEL }}>{t3(lang, "Nom complet *", "Full name *", "Nombre completo *")}</span>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                style={{ ...MOL_FIELD, color: "#FFFFFF" }}
                placeholder={t3(lang, "Jean Dupont", "John Doe", "Juan Pérez")}
                autoComplete="name"
                required
              />
              {errors.name && <span style={{ font: "600 10px/1 'Bricolage Grotesque'", color: "#dc2626" }}>{errors.name}</span>}
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ ...MOL_LABEL }}>{t3(lang, "Téléphone (optionnel)", "Phone (optional)", "Teléfono (opcional)")}</span>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                style={{ ...MOL_FIELD, color: "#FFFFFF" }}
                placeholder={t3(lang, "+33 6 12 34 56 78", "+1 555 123 4567", "+34 600 123 456")}
                autoComplete="tel"
              />
            </label>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: 4 }}>
              <input type="checkbox" id="consent" required style={{ marginTop: 4, width: 18, height: 18, accentColor: "#FFC72C" }} />
              <label htmlFor="consent" style={{ font: "500 11px/1.3 'Bricolage Grotesque'", color: "#1a1726" }}>
                {t3(lang, "J'accepte les conditions de vente et la politique de confidentialité", "I accept the terms of sale and privacy policy", "Acepto los términos de venta y la política de privacidad")}
              </label>
            </div>
            <button
              type="button"
              onClick={handleNext}
              disabled={isSubmitting}
              style={{
                width: "100%", minHeight: 52, marginTop: 8,
                padding: "14px 20px", borderRadius: 12,
                border: "2.5px solid #0D0B14", boxShadow: "4px 4px 0 #0D0B14",
                background: "#FFC72C", color: "#0D0B14",
                font: "800 15px/1 'Bricolage Grotesque'", cursor: "pointer",
              }}
            >
              {t3(lang, "Continuer vers le paiement →", "Continue to payment →", "Continuar al pago →")}
            </button>
          </div>
        )}

        {step === "payment" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center", justifyContent: "center", minHeight: 200 }}>
            <div style={{ width: 48, height: 48, borderRadius: "50%", border: "3px solid #FFC72C", borderTopColor: "transparent", animation: "spin 1s linear infinite" }} />
            <span style={{ font: "700 14px/1.3 'Bricolage Grotesque'", color: "#1a1726", textAlign: "center" }}>
              {t3(lang, "Chargement du paiement sécurisé…", "Loading secure checkout…", "Cargando pago seguro…")}
            </span>
            <span style={{ font: "500 11px/1.4 'Bricolage Grotesque'", color: "#6b6b75", textAlign: "center" }}>
              {t3(lang, "Redirection vers Mollie dans quelques secondes", "Redirecting to Mollie in a few seconds", "Redirigiendo a Mollie en unos segundos")}
            </span>
          </div>
        )}

        {step === "success" && orderData && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center", textAlign: "center" }}>
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#dcfce7", border: "3px solid #16a34a", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "3px 3px 0 #16a34a" }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
            </div>
            <h3 style={{ font: "800 20px/1.2 'Bricolage Grotesque'", color: "#1a1726", margin: 0 }}>
              {t3(lang, "Commande confirmée !", "Order confirmed!", "¡Pedido confirmado!")}
            </h3>
            <p style={{ font: "500 13px/1.4 'Bricolage Grotesque'", color: "#1a1726", margin: 0, maxWidth: 280 }}>
              {t3(lang,
                `Votre commande <strong>${orderData.orderId}</strong> a été payée avec succès. Un email de confirmation a été envoyé à <strong>${formData.email}</strong>.`,
                `Your order <strong>${orderData.orderId}</strong> has been paid successfully. A confirmation email has been sent to <strong>${formData.email}</strong>.`,
                `Su pedido <strong>${orderData.orderId}</strong> ha sido pagado con éxito. Se ha enviado un email de confirmación a <strong>${formData.email}</strong>.`
              )}
            </p>
            <div style={{ marginTop: 8, padding: "12px", borderRadius: 8, background: "#f0fdf4", border: "1px solid #16a34a", font: "600 11px/1.3 'Bricolage Grotesque'", color: "#166534" }}>
              {t3(lang, "N° commande : ", "Order #: ", "Nº pedido: ")}<strong>{orderData.orderId}</strong>
            </div>
            <button
              type="button"
              onClick={() => { clearPartnerCart(); if (onSuccess) onSuccess(orderData.orderId, orderData.paymentId); }}
              style={{
                width: "100%", minHeight: 52, marginTop: 8,
                padding: "14px 20px", borderRadius: 12,
                border: "2.5px solid #0D0B14", boxShadow: "4px 4px 0 #0D0B14",
                background: "#FFC72C", color: "#0D0B14",
                font: "800 15px/1 'Bricolage Grotesque'", cursor: "pointer",
              }}
            >
              {t3(lang, "Revenir à la carte", "Back to map", "Volver al mapa")}
            </button>
          </div>
        )}

        {step === "error" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center", textAlign: "center", padding: "20px" }}>
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#fee2e2", border: "3px solid #dc2626", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "3px 3px 0 #dc2626" }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </div>
            <h3 style={{ font: "800 20px/1.2 'Bricolage Grotesque'", color: "#1a1726", margin: 0 }}>
              {t3(lang, "Erreur de paiement", "Payment error", "Error de pago")}
            </h3>
            <p style={{ font: "500 13px/1.4 'Bricolage Grotesque'", color: "#1a1726", margin: 0, maxWidth: 280 }}>
              {t3(lang, "Une erreur est survenue lors de la création de votre commande. Veuillez réessayer.", "An error occurred while creating your order. Please try again.", "Ha ocurrido un error al crear su pedido. Por favor, inténtelo de nuevo.")}
            </p>
            <button
              type="button"
              onClick={() => setStep("details")}
              style={{
                width: "100%", minHeight: 52, marginTop: 8,
                padding: "14px 20px", borderRadius: 12,
                border: "2.5px solid #0D0B14", boxShadow: "4px 4px 0 #0D0B14",
                background: "#FFC72C", color: "#0D0B14",
                font: "800 15px/1 'Bricolage Grotesque'", cursor: "pointer",
              }}
            >
              {t3(lang, "Réessayer", "Try again", "Reintentar")}
            </button>
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

export default PartnerCheckout;