(function () {
  var host = String(location.hostname || "").replace(/^www\./, "");
  var supportByHost = {
    "sargasses-martinique.com": "support@sargasses-martinique.com",
    "sargasses-guadeloupe.com": "support@sargasses-guadeloupe.com",
    "sargassummiami.com": "support@sargassummiami.com",
    "sargassumcancun.com": "support@sargassumcancun.com",
    "sargassumpuntacana.com": "support@sargassumpuntacana.com",
    "sargazotulum.com": "support@sargazotulum.com"
  };
  var usd = host === "sargassummiami.com" || host === "sargassumcancun.com" || host === "sargassumpuntacana.com" || host === "sargazotulum.com";
  var support = supportByHost[host] || "support@sargasses-martinique.com";
  document.querySelectorAll("[data-eur][data-usd]").forEach(function (link) {
    link.href = usd ? link.getAttribute("data-usd") : link.getAttribute("data-eur");
    link.setAttribute("data-price-key", usd ? link.getAttribute("data-key-usd") : link.getAttribute("data-key-eur"));
  });
  document.querySelectorAll("[data-support]").forEach(function (link) {
    link.href = "mailto:" + support;
    link.textContent = support;
  });
  var corr = "";
  try {
    corr = sessionStorage.getItem("sg_corr") || "";
    if (!corr) {
      corr = window.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
      sessionStorage.setItem("sg_corr", corr);
    }
  } catch (e) {
    corr = "local";
  }
  function beacon(event, priceKey) {
    var body = JSON.stringify({ event: event, livemode: true, correlation_id: corr, price_key: priceKey || null });
    try { navigator.sendBeacon("/api/stripe-track", body); } catch (e) {}
  }
  beacon("pricing_view");
  document.addEventListener("click", function (ev) {
    var link = ev.target && ev.target.closest ? ev.target.closest("a[data-eur]") : null;
    if (!link) return;
    beacon("CTA_click", link.getAttribute("data-price-key"));
    beacon("checkout_started", link.getAttribute("data-price-key"));
  });
})();
