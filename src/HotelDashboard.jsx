import React, { useEffect, useMemo, useState } from "react";
import { logAnalyticsEvent } from "./supabasePhotos.js";
import "./hotel-dashboard.css";
import {
  buildShareUrl,
  getStatusMeta,
  isFreshPublicData,
  normalizeIsland,
  resolveJ3Forecast,
  resolveTodayRecord
} from "./hotel-dashboard-data.js";

function trackHotel(event, params, island) {
  try {
    logAnalyticsEvent(event, params || {}, island ? island.toUpperCase() : null);
  } catch (_) {}
}

function formatTimestamp(value) {
  const stamp = Date.parse(value || "");
  if (!Number.isFinite(stamp)) return "horodatage indisponible";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(new Date(stamp));
}

function formatDate(value) {
  if (!value) return "date non disponible";
  const date = new Date(String(value).slice(0, 10) + "T12:00:00Z");
  if (!Number.isFinite(date.getTime())) return "date non disponible";
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(date);
}

function StatusCard({ title, record, isForecast, unavailable }) {
  const meta = record ? getStatusMeta(record.status) : getStatusMeta(null);
  const confidence = record && Number.isFinite(record.confidence)
    ? "Confiance " + record.confidence + "%"
    : "Confiance non communiquée";
  return (
    <article className={"hotel-forecast-card " + (record ? meta.className : "unavailable")}>
      <h2>{title}</h2>
      <p className={"hotel-status " + meta.className}>{record ? meta.label : unavailable}</p>
      <p className="hotel-detail">
        {record
          ? (record.date ? formatDate(record.date) + " · " : "") + confidence
          : "Aucun verdict n’est affiché sans source exploitable."}
      </p>
      {record && <span className={"hotel-badge " + (isForecast ? "forecast" : "")}>
        {isForecast ? "Tendance modélisée" : "Observation satellite"}
      </span>}
    </article>
  );
}

export default function HotelDashboard() {
  const query = useMemo(() => new URLSearchParams(window.location.search), []);
  const island = normalizeIsland(query.get("island"), window.location.hostname);
  const token = query.get("k") || "";
  const hotelName = (query.get("name") || "").slice(0, 80);
  const [beaches, setBeaches] = useState([]);
  const [publicData, setPublicData] = useState(null);
  const [selectedBeach, setSelectedBeach] = useState(null);
  const [forecastPayload, setForecastPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sourceError, setSourceError] = useState("");
  const [shareMessage, setShareMessage] = useState("");

  useEffect(() => {
    if (!island) {
      setSourceError("Cette version couvre la Martinique et la Guadeloupe. Ouvrez le lien sur le domaine de la région concernée.");
      setLoading(false);
      return undefined;
    }
    let active = true;
    setLoading(true);
    Promise.all([
      fetch("/data/beaches-list.json", { cache: "no-store" }).then((response) => {
        if (!response.ok) throw new Error("beach_catalog_unavailable");
        return response.json();
      }),
      fetch("/api/copernicus/" + island + "/sargassum.json", { cache: "no-store" }).then((response) => {
        if (!response.ok) throw new Error("beach_data_unavailable");
        return response.json();
      })
    ]).then(([catalog, data]) => {
      if (!active) return;
      const choices = (Array.isArray(catalog) ? catalog : [])
        .filter((beach) => beach && beach.island === island && beach.id && beach.name);
      const requested = query.get("beach") || "";
      const selected = choices.find((beach) => beach.id === requested || beach.slug === requested) || choices[0] || null;
      setBeaches(choices);
      setPublicData(data);
      setSelectedBeach(selected);
      setSourceError(choices.length ? "" : "Aucune plage disponible pour cette région.");
      setLoading(false);
      if (selected) {
        trackHotel("hotel_dashboard_view", { beach_id: selected.id, access: token ? "token" : "public" }, island);
      }
    }).catch(() => {
      if (!active) return;
      setSourceError("La source est indisponible. Aucun statut n’est inventé.");
      setLoading(false);
    });
    return () => { active = false; };
  }, [island]);

  useEffect(() => {
    if (!token || !selectedBeach || !publicData || !isFreshPublicData(publicData, Date.now())) {
      setForecastPayload(null);
      return undefined;
    }
    let active = true;
    setForecastPayload(null);
    fetch("/api/copernicus/forecast.php?k=" + encodeURIComponent(token), {
      cache: "no-store",
      headers: { Accept: "application/json" }
    }).then((response) => {
      if (!response.ok) throw new Error("forecast_unavailable");
      return response.json();
    }).then((payload) => {
      if (active) setForecastPayload(payload);
    }).catch(() => {
      if (active) setForecastPayload(null);
    });
    return () => { active = false; };
  }, [token, selectedBeach && selectedBeach.id, publicData]);

  const fresh = isFreshPublicData(publicData, Date.now());
  const today = fresh ? resolveTodayRecord(publicData, selectedBeach, Date.now()) : null;
  const j3 = token && fresh ? resolveJ3Forecast(forecastPayload, publicData, selectedBeach, Date.now()) : null;
  const regionLabel = island === "gp" ? "Guadeloupe" : "Martinique";
  const beachLabel = selectedBeach
    ? selectedBeach.name + (selectedBeach.commune ? " · " + selectedBeach.commune : "")
    : loading ? "Chargement…" : "Aucune plage sélectionnée";

  useEffect(() => {
    if (j3 && selectedBeach) {
      trackHotel("hotel_forecast_j3_view", { beach_id: selectedBeach.id, confidence: j3.confidence }, island);
    }
  }, [j3 && j3.date, selectedBeach && selectedBeach.id, island]);

  function updateShareUrl(beach) {
    if (!beach) return;
    const next = buildShareUrl(window.location.href, {
      beachSlug: beach.slug || beach.id,
      island: island,
      hotelName: hotelName,
      token: token
    });
    window.history.replaceState({}, "", next);
  }

  function onBeachChange(event) {
    const next = beaches.find((beach) => beach.slug === event.target.value || beach.id === event.target.value) || null;
    setSelectedBeach(next);
    setForecastPayload(null);
    updateShareUrl(next);
    if (next) trackHotel("hotel_beach_select", { beach_id: next.id }, island);
  }

  async function onShare() {
    if (!selectedBeach) return;
    updateShareUrl(selectedBeach);
    const shareUrl = buildShareUrl(window.location.href, {
      beachSlug: selectedBeach.slug || selectedBeach.id,
      island: island,
      hotelName: hotelName,
      token: token
    });
    trackHotel("hotel_share_click", { beach_id: selectedBeach.id, has_access_token: !!token }, island);
    try {
      if (navigator.share) {
        await navigator.share({ title: "Conditions plage — " + selectedBeach.name, url: shareUrl });
      } else if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        setShareMessage("Lien partageable copié.");
      } else {
        window.prompt("Copiez ce lien de partage :", shareUrl);
      }
    } catch (_) {}
  }

  const sourceText = sourceError
    ? sourceError
    : !publicData
      ? "Chargement de la source satellite…"
      : !fresh
        ? "Données masquées : composite satellite absent, invalide ou âgé de plus de 36 h. Dernier calcul : " + formatTimestamp(publicData.updatedAt) + "."
        : "Source ERDDAP satellite · observation " + formatTimestamp(publicData.erddapTimestamp) + " · publié " + formatTimestamp(publicData.updatedAt) + ".";

  return (
    <div className="hotel-page">
      <header className="hotel-topbar">
        <a className="hotel-brand" href="/" aria-label="Sargasses, accueil">SARGASSES <span>PRO</span></a>
        <a className="hotel-toplink" href="/pro/hotels/">Offre hôtels</a>
      </header>
      <main className="hotel-main">
        <section className="hotel-hero">
          <p className="hotel-eyebrow">Espace établissement · {regionLabel}</p>
          <h1>{hotelName ? "Bienvenue, " + hotelName : "Votre plage, en un coup d’œil."}</h1>
          <p>Un état satellite pour aujourd’hui et une tendance à J+3 lorsque votre accès Pro est actif. Les données trop anciennes sont masquées.</p>
        </section>

        <section className="hotel-controls" aria-label="Personnalisation de la fiche">
          <label htmlFor="hotel-beach-select">Plage suivie</label>
          <select id="hotel-beach-select" value={selectedBeach ? (selectedBeach.slug || selectedBeach.id) : ""} onChange={onBeachChange} disabled={loading || !beaches.length}>
            {!beaches.length && <option value="">{loading ? "Chargement des plages…" : "Aucune plage disponible"}</option>}
            {beaches.map((beach) => <option key={beach.id} value={beach.slug || beach.id}>{beach.name}{beach.commune ? " · " + beach.commune : ""}</option>)}
          </select>
          <div className="hotel-actions">
            <button className="hotel-btn hotel-btn-secondary" type="button" onClick={onShare} disabled={!selectedBeach}>Partager la fiche</button>
            <a className="hotel-btn hotel-btn-secondary" href="/pro/hotels/">Offre hôtels</a>
          </div>
          <p className="hotel-beach-label">{beachLabel}</p>
        </section>

        <section className={"hotel-source " + (fresh ? "fresh" : sourceError || publicData ? "stale" : "")} role="status" aria-live="polite">
          <span className="hotel-source-dot" aria-hidden="true"></span><span>{sourceText}</span>
        </section>
        {shareMessage && <p className="hotel-share-message" role="status">{shareMessage}</p>}

        <div className="hotel-section-heading"><h2>État de la plage</h2><p>Aujourd’hui + J+3 uniquement</p></div>
        <section className="hotel-forecast-grid" aria-label="État aujourd’hui et tendance J+3">
          <StatusCard title="Aujourd’hui · satellite" record={today} isForecast={false} unavailable={loading ? "Chargement…" : "Donnée indisponible"} />
          <article className={"hotel-forecast-card " + (j3 ? getStatusMeta(j3.status).className : "locked")}>
            <h2>J+3 · tendance</h2>
            <p className={"hotel-status " + (j3 ? getStatusMeta(j3.status).className : "")}>
              {j3 ? getStatusMeta(j3.status).label : token ? "Prévision indisponible" : "Accès Pro requis"}
            </p>
            <p className="hotel-detail">
              {j3
                ? formatDate(j3.date) + " · Confiance " + j3.confidence + "%"
                : !fresh && publicData
                  ? "La source est trop ancienne. La tendance reste masquée."
                  : token
                    ? "Aucune valeur J+3 vérifiable n’est disponible pour cette plage."
                    : "Débloquez la tendance J+3 avec un essai gratuit de 30 jours."}
            </p>
            {j3 && <span className="hotel-badge forecast">Tendance modélisée</span>}
            {!token && <a className="hotel-btn hotel-btn-primary hotel-unlock" href="/pro/espace/" onClick={() => trackHotel("hotel_trial_cta_click", { beach_id: selectedBeach ? selectedBeach.id : null }, island)}>Activer l’essai gratuit 30 jours</a>}
            {token && !j3 && <a className="hotel-btn hotel-btn-secondary hotel-unlock" href="/pro/espace/">Renouveler l’accès Pro</a>}
          </article>
        </section>

        <section className="hotel-note"><strong>Lecture honnête des données.</strong> Aujourd’hui provient du statut satellite publié. J+3 est une tendance modélisée (persistance, dérive des bancs et vent), pas une observation. La confiance affichée est celle fournie par le pipeline. Si la source dépasse 36&nbsp;h, les deux verdicts sont masqués.</section>
        <section className="hotel-trial">
          <h2>Accès Pro pour votre équipe</h2>
          <p>Activez l’essai gratuit depuis l’espace Pro, puis rouvrez cette fiche avec le lien d’accès reçu. Aucun paiement n’est demandé pour démarrer l’essai.</p>
          <a className="hotel-btn hotel-btn-primary" href="/pro/espace/" onClick={() => trackHotel("hotel_trial_cta_click", { beach_id: selectedBeach ? selectedBeach.id : null, source: "footer" }, island)}>Démarrer l’essai gratuit</a>
          <p className="hotel-fineprint">Un lien contenant un jeton actif donne accès à la tendance J+3 jusqu’à son expiration. Partagez-le uniquement avec les personnes autorisées.</p>
        </section>
      </main>
    </div>
  );
}
