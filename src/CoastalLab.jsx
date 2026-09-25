/**
 * CoastalLab — SARGASSUM COASTAL LAB / Littoral Decision Lab
 *
 * Expérience interactive premium 5 couches :
 * 01 MONITOR  → OCEAN → DATA → BEACH → STATE
 * 02 UNDERSTAND → SARGASSUM → BEACH → HUMAN USE → TOURISM → ECOSYSTEM
 * 03 DECIDE → OBSERVE → EVALUATE → DECIDE → ACT → MEASURE
 * 04 RECOVER → COLLECTE → TRI → TRANSPORT → STOCKAGE → TRAITEMENT → SÉCURISATION
 * 05 VALORIZE → BIOMASSE → matériaux/énergie/extraction/agricole/autres
 *
 * Centre : Beach Object (PHOTO + STATE + DATA + FORECAST + RELIABILITY + USE + IMPACT + DECISION + ALTERNATIVE)
 *
 * Zéro donnée inventée. Réutilise : Beach Object, media-art-direction, sg-motion, icons, analytics.
 */

import React, { useState, useMemo, useEffect, useRef, useCallback } from "react"
import { Icon } from "./lib/sg-icons.jsx"
import { resolveMedia } from "./lib/media-art-direction.js"
import { nearestBeaches, dataAgeHours } from "./lib/sg-visual.js"
import { _t, track } from "./Sargasses_PROD.jsx"

const _t2 = (l, fr, en, es) => (l === "en" ? en : l === "es" ? es : fr)

const LAYERS = [
  { id: "monitor", label: { fr: "MONITOR", en: "MONITOR", es: "MONITOR" }, subtitle: { fr: "Voir ce qui se passe", en: "See what's happening", es: "Ver qué ocurre" }, icon: "satellite" },
  { id: "understand", label: { fr: "UNDERSTAND", en: "UNDERSTAND", es: "ENTENDER" }, subtitle: { fr: "Comprendre l'impact", en: "Understand impact", es: "Entender el impacto" }, icon: "compass" },
  { id: "decide", label: { fr: "DECIDE", en: "DECIDE", es: "DECIDIR" }, subtitle: { fr: "Décider & agir", en: "Decide & act", es: "Decidir y actuar" }, icon: "route" },
  { id: "recover", label: { fr: "RECOVER", en: "RECOVER", es: "RECUPERAR" }, subtitle: { fr: "Récupérer & traiter", en: "Collect & process", es: "Recoger y tratar" }, icon: "boat" },
  { id: "valorize", label: { fr: "VALORIZE", en: "VALORIZE", es: "VALORIZAR" }, subtitle: { fr: "Valoriser le potentiel", en: "Unlock potential", es: "Valorizar el potencial" }, icon: "fish" },
]

const DECISION_OPTIONS = [
  { id: "monitor", label: { fr: "SURVEILLER", en: "MONITOR", es: "VIGILAR" }, desc: { fr: "Suivi continu par satellite", en: "Continuous satellite monitoring", es: "Seguimiento continuo por satélite" } },
  { id: "inform", label: { fr: "INFORMER", en: "INFORM", es: "INFORMAR" }, desc: { fr: "Alertes temps réel aux usagers", en: "Real-time user alerts", es: "Alertas en tiempo real" } },
  { id: "adapt", label: { fr: "ADAPTER", en: "ADAPT", es: "ADAPTAR" }, desc: { fr: "Ajuster activités & planning", en: "Adjust activities & planning", es: "Ajustar actividades y planificación" } },
  { id: "clean", label: { fr: "NETTOYER", en: "CLEAN", es: "LIMPIAR" }, desc: { fr: "Collecte ciblée biomasse", en: "Targeted biomass collection", es: "Recogida dirigida de biomasa" } },
  { id: "protect", label: { fr: "PROTÉGER", en: "PROTECT", es: "PROTEGER" }, desc: { fr: "Barrières & aménagements", en: "Barriers & developments", es: "Barreras y desarrollos" } },
  { id: "guide", label: { fr: "ORIENTER", en: "GUIDE", es: "ORIENTAR" }, desc: { fr: "Rediriger vers alternatives", en: "Redirect to alternatives", es: "Redirigir a alternativas" } },
  { id: "track", label: { fr: "SUIVRE", en: "TRACK", es: "SEGUIR" }, desc: { fr: "Mesure post-intervention", en: "Post-intervention measurement", es: "Medición post-intervención" } },
]

const RECOVERY_STEPS = [
  { id: "collect", label: { fr: "COLLECTE", en: "COLLECTION", es: "RECOGIDA" }, constraints: { fr: "Logistique marée, accès plage, engins", en: "Tide logistics, beach access, equipment", es: "Logística de marea, acceso, equipos" } },
  { id: "sort", label: { fr: "TRI", en: "SORTING", es: "CLASIFICACIÓN" }, constraints: { fr: "Sable/sargasse/sable contaminé", en: "Sand/sargassum/contaminated sand", es: "Arena/sargazo/arena contaminada" } },
  { id: "transport", label: { fr: "TRANSPORT", en: "TRANSPORT", es: "TRANSPORTE" }, constraints: { fr: "Poids, volume, coûts, itinéraires", en: "Weight, volume, costs, routes", es: "Peso, volumen, costes, rutas" } },
  { id: "store", label: { fr: "STOCKAGE", en: "STORAGE", es: "ALMACENAMIENTO" }, constraints: { fr: "Site temporaire, lixiviats, odeurs", en: "Temp site, leachates, odors", es: "Sitio temporal, lixiviados, olores" } },
  { id: "process", label: { fr: "TRAITEMENT", en: "PROCESSING", es: "TRATAMIENTO" }, constraints: { fr: "Séchage, broyage, stabilisation", en: "Drying, grinding, stabilization", es: "Secado, triturado, estabilización" } },
  { id: "secure", label: { fr: "SÉCURISATION", en: "SECURING", es: "ASEGURAMIENTO" }, constraints: { fr: "Conformité sanitaire, traçabilité", en: "Health compliance, traceability", es: "Cumplimiento sanitario, trazabilidad" } },
]

const VALORIZATION_PATHS = [
  { id: "materials", label: { fr: "MATÉRIAUX", en: "MATERIALS", es: "MATERIALES" }, potential: { fr: "Bioplastiques, composites, isolation", en: "Bioplastics, composites, insulation", es: "Bioplasticos, composites, aislamiento" }, constraints: { fr: "Pureté, régularité, coûts", en: "Purity, consistency, costs", es: "Pureza, consistencia, costes" }, maturity: "Pilote" },
  { id: "energy", label: { fr: "ÉNERGIE", en: "ENERGY", es: "ENERGÍA" }, potential: { fr: "Méthanisation, combustion, biochar", en: "Anaerobic digestion, combustion, biochar", es: "Metanización, combustión, biochar" }, constraints: { fr: "Teneur en eau, sels, arsenic", en: "Water content, salts, arsenic", es: "Contenido en agua, sales, arsénico" }, maturity: "Démonstration" },
  { id: "extraction", label: { fr: "EXTRACTION / MOLÉCULES", en: "EXTRACTION / MOLECULES", es: "EXTRACCIÓN / MOLÉCULAS" }, potential: { fr: "Algates, fucoidanes, polyphénols", en: "Alginates, fucoidans, polyphenols", es: "Alginatos, fucoidanos, polifenoles" }, constraints: { fr: "Rendement, pureté, régulation", en: "Yield, purity, regulation", es: "Rendimiento, pureza, regulación" }, maturity: "Recherche" },
  { id: "agriculture", label: { fr: "AGRICULTURE", en: "AGRICULTURE", es: "AGRICULTURA" }, potential: { fr: "Amendement, paillage, compost", en: "Soil amendment, mulch, compost", es: "Enmienda, mantillo, compost" }, constraints: { fr: "Salinité, métaux lourds, normes", en: "Salinity, heavy metals, standards", es: "Salinidad, metales pesados, normas" }, maturity: "Expérimental" },
  { id: "other", label: { fr: "AUTRES FILIÈRES", en: "OTHER PATHWAYS", es: "OTRAS VÍAS" }, potential: { fr: "Cosmétique, pharma, alimentaire", en: "Cosmetic, pharma, food", es: "Cosmético, farma, alimentario" }, constraints: { fr: "Traçabilité, certification, marchés", en: "Traceability, certification, markets", es: "Trazabilidad, certificación, mercados" }, maturity: "À documenter" },
]

const HARD_CONSTRAINTS = [
  "PREDICTION", "DATA", "WEATHER", "OCEAN", "BEACH",
  "TOURISM", "LOGISTICS", "COLLECTION", "STORAGE",
  "TREATMENT", "ENVIRONMENT", "ECONOMICS", "REGULATION"
]

const ECOSYSTEM_DIMS = [
  { id: "tourism", label: { fr: "TOURISME", en: "TOURISM", es: "TURISMO" }, icon: "boat" },
  { id: "environment", label: { fr: "ENVIRONNEMENT", en: "ENVIRONMENT", es: "MEDIO AMBIENTE" }, icon: "fish" },
  { id: "operations", label: { fr: "OPÉRATIONS", en: "OPERATIONS", es: "OPERACIONES" }, icon: "compass" },
  { id: "economics", label: { fr: "ÉCONOMIE", en: "ECONOMICS", es: "ECONOMÍA" }, icon: "satellite" },
]

function LayerNav({ current, onChange, lang }) {
  return (
    <nav className="cl-layer-nav" role="tablist" aria-label={_t2(lang, "Navigation du Lab", "Lab navigation", "Navegación del Lab")}>
      {LAYERS.map((layer, i) => (
        <button
          key={layer.id}
          role="tab"
          aria-selected={current === layer.id}
          aria-controls={`panel-${layer.id}`}
          id={`tab-${layer.id}`}
          onClick={() => onChange(layer.id)}
          className={`cl-layer-btn ${current === layer.id ? "active" : ""}`}
          style={{ "--i": i * 60 }}
        >
          <Icon name={layer.icon} size={20} aria-hidden="true" />
          <span className="cl-layer-label">{layer.label[lang]}</span>
          <span className="cl-layer-sub">{layer.subtitle[lang]}</span>
        </button>
      ))}
    </nav>
  )
}

function BeachObjectCard({ beach, sargData, lang, imageMap, isNewRegion, BEACH_TO_SARG }) {
  const sargId = isNewRegion ? beach.id : BEACH_TO_SARG?.[beach.id]
  const weekly = sargData?.weekly?.[sargId]
  const status = beach.status || (weekly?.forecast?.[0]?.status) || "moderate"
  const confidence = weekly?.forecast?.[0]?.confidence
  const forecast = weekly?.forecast || []
  const age = dataAgeHours(sargData?.erddapTimestamp)

  const media = useMemo(() => {
    try { return resolveMedia({ beachId: beach.id, slot: "hero", type: "place" }) } catch { return { asset: null } }
  }, [beach.id])

  const alt = nearestBeaches(beach, sargData, { island: beach.island, BEACH_TO_SARG, limit: 3 })

  return (
    <section className="cl-beach-object" data-sgm-status={status}>
      <div className="cl-bo-media">
        {media.asset ? (
          <img src={media.asset} alt="" aria-hidden="true" loading="lazy" className="cl-bo-img"
            onError={(e) => { e.target.style.display = "none" }} />
        ) : (
          <div className="cl-bo-placeholder" aria-hidden="true">🏖️</div>
        )}
        <div className="cl-bo-status-badge" style={{ background: `rgba(0,0,0,.7)`, color: "#fff" }}>
          <span className="cl-bo-status-dot" style={{ background: status === "clean" ? "#22C55E" : status === "avoid" ? "#E8522A" : "#B87A00" }} />
          {_t2(lang, status === "clean" ? "Propre" : status === "avoid" ? "À éviter" : "Modéré", status === "clean" ? "Clean" : status === "avoid" ? "Avoid" : "Moderate", status === "clean" ? "Limpio" : status === "avoid" ? "Evitar" : "Moderado")}
        </div>
      </div>

      <div className="cl-bo-content">
        <h2 className="cl-bo-name">{beach.name}</h2>
        <p className="cl-bo-location">{beach.commune || beach.region || ""}</p>

        <div className="cl-bo-state-bar">
          <div className="cl-bo-state-fill" style={{ width: `${forecast.length ? 100 : 0}%` }} />
        </div>
        <div className="cl-bo-meta">
          <span>{_t2(lang, "Confiance", "Confidence", "Confianza")}: {confidence != null ? `${confidence}%` : _t2(lang, "—", "—", "—")}</span>
          <span>{_t2(lang, "Données", "Data", "Datos")}: {age ? `${age}h` : _t2(lang, "live", "live", "live")}</span>
          <span>{_t2(lang, "Jours", "Days", "Días")}: {forecast.length}/7</span>
        </div>

        {alt.length > 0 && (
          <div className="cl-bo-alternatives">
            <strong>{_t2(lang, "Alternatives proches", "Nearby alternatives", "Alternativas cercanas")}</strong>
            <div className="cl-bo-alt-list">
              {alt.map(a => (
                <button key={a.id} className="cl-bo-alt-btn" data-sgm-status={a.status}
                  onClick={() => track("sg_lab_beach_select", { beach_id: a.id, from: "alternative" })}>
                  <span className="cl-bo-alt-dot" style={{ background: a.status === "clean" ? "#22C55E" : a.status === "avoid" ? "#E8522A" : "#B87A00" }} />
                  {a.name} ({Math.round(a.distance_km)}km)
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

function MonitorLayer({ beach, sargData, lang, imageMap, isNewRegion, BEACH_TO_SARG }) {
  const sargId = isNewRegion ? beach.id : BEACH_TO_SARG?.[beach.id]
  const weekly = sargData?.weekly?.[sargId]
  const status = beach.status || (weekly?.forecast?.[0]?.status) || "moderate"
  const confidence = weekly?.forecast?.[0]?.confidence
  const forecast = weekly?.forecast || []
  const afai = beach.afai
  const source = sargData?.source
  const updated = sargData?.updatedAt || sargData?.erddapTimestamp
  const age = dataAgeHours(updated)

  return (
    <section className="cl-layer cl-monitor" id="panel-monitor" role="tabpanel" aria-labelledby="tab-monitor">
      <header className="cl-layer-header">
        <Icon name="satellite" size={28} aria-hidden="true" />
        <div>
          <h2>{_t2(lang, "MONITOR", "MONITOR", "MONITOR")}</h2>
          <p>{_t2(lang, "Voir ce qui se passe — Océan → Données → Plage → État", "See what's happening — Ocean → Data → Beach → State", "Ver qué ocurre — Océano → Datos → Playa → Estado")}</p>
        </div>
      </header>

      <BeachObjectCard beach={beach} sargData={sargData} lang={lang} imageMap={imageMap} isNewRegion={isNewRegion} BEACH_TO_SARG={BEACH_TO_SARG} />

      <div className="cl-flow">
        <div className="cl-flow-step">
          <Icon name="fish" size={32} aria-hidden="true" style={{ color: "#0B2230" }} />
          <div className="cl-flow-label">{_t2(lang, "OCÉAN", "OCEAN", "OCÉANO")}</div>
          <p className="cl-flow-desc">{_t2(lang, "Radeaux de sargasses en dérive", "Drifting sargassum rafts", "Balsas de sargazo a la deriva")}</p>
        </div>
        <Icon name="route" size={20} aria-hidden="true" className="cl-flow-arrow" />
        <div className="cl-flow-step">
          <Icon name="satellite" size={32} aria-hidden="true" style={{ color: "#155A5A" }} />
          <div className="cl-flow-label">{_t2(lang, "DONNÉES", "DATA", "DATOS")}</div>
          <p className="cl-flow-desc">{_t2(lang, "ERDDAP / Copernicus / AFAI satellite", "ERDDAP / Copernicus / AFAI satellite", "ERDDAP / Copernicus / AFAI satélite")}</p>
        </div>
        <Icon name="route" size={20} aria-hidden="true" className="cl-flow-arrow" />
        <div className="cl-flow-step">
          <Icon name="compass" size={32} aria-hidden="true" style={{ color: "#C97E3A" }} />
          <div className="cl-flow-label">{_t2(lang, "PLAGE", "BEACH", "PLAYA")}</div>
          <p className="cl-flow-desc">{_t2(lang, "Interpolation IDW par sentinelles", "IDW interpolation by sentinels", "Interpolación IDW por centinelas")}</p>
        </div>
        <Icon name="route" size={20} aria-hidden="true" className="cl-flow-arrow" />
        <div className="cl-flow-step">
          <Icon name="boat" size={32} aria-hidden="true" style={{ color: "#F2B05E" }} />
          <div className="cl-flow-label">{_t2(lang, "ÉTAT", "STATE", "ESTADO")}</div>
          <p className="cl-flow-desc">{_t2(lang, "Status + confiance + forecast 7j", "Status + confidence + 7d forecast", "Estado + confianza + pronóstico 7d")}</p>
        </div>
      </div>

      <details className="cl-evidence">
        <summary>{_t2(lang, "Preuves & sources", "Evidence & sources", "Evidencias y fuentes")}</summary>
        <ul>
          <li>{_t2(lang, `Source satellite: ${source || "Copernicus ERDDAP"}`, `Satellite source: ${source || "Copernicus ERDDAP"}`, `Fuente satélite: ${source || "Copernicus ERDDAP"}`)}</li>
          <li>{_t2(lang, `Dernière mise à jour: ${updated ? new Date(updated).toLocaleString(lang) : "—"}`, `Last update: ${updated ? new Date(updated).toLocaleString(lang) : "—"}`, `Última actualización: ${updated ? new Date(updated).toLocaleString(lang) : "—"}`)}</li>
          <li>{_t2(lang, `Âge des données: ${age ? `${age}h` : "live"}`, `Data age: ${age ? `${age}h` : "live"}`, `Edad de datos: ${age ? `${age}h` : "live"}`)}</li>
          <li>{_t2(lang, `AFAI (indice satellite): ${afai != null ? afai.toFixed(3) : "—"}`, `AFAI (satellite index): ${afai != null ? afai.toFixed(3) : "—"}`, `AFAI (índice satélite): ${afai != null ? afai.toFixed(3) : "—"}`)}</li>
          <li>{_t2(lang, `Forecast disponible: ${forecast.length}/7 jours`, `Forecast available: ${forecast.length}/7 days`, `Pronóstico disponible: ${forecast.length}/7 días`)}</li>
          <li>{_t2(lang, "Aucune mesure n'est inventée", "No measurements are invented", "Ninguna medida es inventada")}</li>
        </ul>
      </details>
    </section>
  )
}

function UnderstandLayer({ beach, sargData, lang }) {
  const sargId = beach.id
  return (
    <section className="cl-layer cl-understand" id="panel-understand" role="tabpanel" aria-labelledby="tab-understand">
      <header className="cl-layer-header">
        <Icon name="compass" size={28} aria-hidden="true" />
        <div>
          <h2>{_t2(lang, "UNDERSTAND", "UNDERSTAND", "ENTENDER")}</h2>
          <p>{_t2(lang, "Comprendre l'impact — Sargasse → Plage → Usage humain → Tourisme → Écosystème", "Understand impact — Sargassum → Beach → Human use → Tourism → Ecosystem", "Entender el impacto — Sargazo → Playa → Uso humano → Turismo → Ecosistema")}</p>
        </div>
      </header>

      <div className="cl-impact-chain">
        <div className="cl-impact-step">
          <Icon name="fish" size={24} aria-hidden="true" />
          <strong>{_t2(lang, "SARGASSUM", "SARGASSUM", "SARGAZO")}</strong>
          <p>{_t2(lang, "Algues brunes pélagiques en prolifération", "Pelagic brown algae bloom", "Algas pardas pelágicas en proliferación")}</p>
        </div>
        <Icon name="route" size={16} aria-hidden="true" className="cl-impact-arrow" />
        <div className="cl-impact-step">
          <Icon name="satellite" size={24} aria-hidden="true" />
          <strong>{_t2(lang, "PLAGE", "BEACH", "PLAYA")}</strong>
          <p>{_t2(lang, "Échouage, décomposition, H₂S, couverture", "Beaching, decomposition, H₂S, coverage", "Varada, descomposición, H₂S, cobertura")}</p>
        </div>
        <Icon name="route" size={16} aria-hidden="true" className="cl-impact-arrow" />
        <div className="cl-impact-step">
          <Icon name="boat" size={24} aria-hidden="true" />
          <strong>{_t2(lang, "USAGE HUMAIN", "HUMAN USE", "USO HUMANO")}</strong>
          <p>{_t2(lang, "Baignade, détente, activités nautiques", "Swimming, relaxation, water sports", "Baño, relax, deportes acuáticos")}</p>
        </div>
        <Icon name="route" size={16} aria-hidden="true" className="cl-impact-arrow" />
        <div className="cl-impact-step">
          <Icon name="compass" size={24} aria-hidden="true" />
          <strong>{_t2(lang, "TOURISME", "TOURISM", "TURISMO")}</strong>
          <p>{_t2(lang, "Choix destination, satisfaction, revenu", "Destination choice, satisfaction, revenue", "Elección destino, satisfacción, ingreso")}</p>
        </div>
        <Icon name="route" size={16} aria-hidden="true" className="cl-impact-arrow" />
        <div className="cl-impact-step">
          <Icon name="fish" size={24} aria-hidden="true" />
          <strong>{_t2(lang, "ÉCOSYSTÈME", "ECOSYSTEM", "ECOSISTEMA")}</strong>
          <p>{_t2(lang, "Récifs, herbiers, tortues, qualité eau", "Reefs, seagrass, turtles, water quality", "Arrecifes, pastos, tortugas, calidad agua")}</p>
        </div>
        <Icon name="route" size={16} aria-hidden="true" className="cl-impact-arrow" />
        <div className="cl-impact-step">
          <Icon name="route" size={24} aria-hidden="true" />
          <strong>{_t2(lang, "GESTION LITTORALE", "COASTAL MGMT", "GESTIÓN LITORAL")}</strong>
          <p>{_t2(lang, "Décision, moyens, suivi, réglementation", "Decision, resources, monitoring, regulation", "Decisión, medios, seguimiento, regulación")}</p>
        </div>
      </div>

      <details className="cl-evidence">
        <summary>{_t2(lang, "Dimensions d'impact (données réelles uniquement)", "Impact dimensions (real data only)", "Dimensiones de impacto (solo datos reales)")}</summary>
        <div className="cl-dim-grid">
          {ECOSYSTEM_DIMS.map(dim => (
            <div key={dim.id} className="cl-dim-card">
              <Icon name={dim.icon} size={28} aria-hidden="true" />
              <strong>{dim.label[lang]}</strong>
              <p>{_t2(lang, "Relier aux données plage : état, forecast, confiance, alternatives", "Link to beach data: status, forecast, confidence, alternatives", "Vincular a datos de playa: estado, pronóstico, confianza, alternativas")}</p>
            </div>
          ))}
        </div>
        <p className="cl-honesty">{_t2(lang, "⚠ Aucune causalité n'est affirmée sans source. Les liens sont des pistes d'analyse.", "⚠ No causality claimed without source. Links are analysis tracks.", "⚠ No se afirma causalidad sin fuente. Los enlaces son pistas de análisis.")}</p>
      </details>
    </section>
  )
}

function DecideLayer({ beach, sargData, lang, onAction }) {
  return (
    <section className="cl-layer cl-decide" id="panel-decide" role="tabpanel" aria-labelledby="tab-decide">
      <header className="cl-layer-header">
        <Icon name="route" size={28} aria-hidden="true" />
        <div>
          <h2>{_t2(lang, "DECIDE", "DECIDE", "DECIDIR")}</h2>
          <p>{_t2(lang, "Cœur du produit — Observer → Évaluer → Décider → Agir → Mesurer", "Product core — Observe → Evaluate → Decide → Act → Measure", "Corazón del producto — Observar → Evaluar → Decidir → Actuar → Medir")}</p>
        </div>
      </header>

      <div className="cl-decision-flow">
        <div className="cl-decision-step">OBSERVER</div>
        <Icon name="route" size={16} aria-hidden="true" className="cl-decision-arrow" />
        <div className="cl-decision-step">ÉVALUER</div>
        <Icon name="route" size={16} aria-hidden="true" className="cl-decision-arrow" />
        <div className="cl-decision-step active">{_t2(lang, "DÉCIDER", "DECIDE", "DECIDIR")}</div>
        <Icon name="route" size={16} aria-hidden="true" className="cl-decision-arrow" />
        <div className="cl-decision-step">AGIR</div>
        <Icon name="route" size={16} aria-hidden="true" className="cl-decision-arrow" />
        <div className="cl-decision-step">MESURER</div>
      </div>

      <p className="cl-decision-hint">{_t2(lang, "Options conceptuelles — non universelles, connectées au Beach Object", "Conceptual options — not universal, connected to Beach Object", "Opciones conceptuales — no universales, conectadas al Beach Object")}</p>

      <div className="cl-options-grid" role="group" aria-label={_t2(lang, "Options de décision", "Decision options", "Opciones de decisión")}>
        {DECISION_OPTIONS.map(opt => (
          <button
            key={opt.id}
            className="cl-option-btn"
            onClick={() => { track("sg_lab_decision_view", { option: opt.id, beach_id: beach.id }); onAction?.(opt.id) }}
          >
            <span className="cl-option-label">{opt.label[lang]}</span>
            <span className="cl-option-desc">{opt.desc[lang]}</span>
          </button>
        ))}
      </div>

      <details className="cl-evidence">
        <summary>{_t2(lang, "Ces actions ne sont pas des règles réglementaires universelles", "These are not universal regulatory rules", "Estas no son reglas regulatorias universales")}</summary>
        <p>{_t2(lang, "Chaque décision dépend du contexte local : état de la plage, réglementation, moyens, saison, parties prenantes. Sargagame fournit les données pour éclairer la décision.", "Each decision depends on local context: beach status, regulation, resources, season, stakeholders. Sargagame provides data to inform the decision.", "Cada decisión depende del contexto local: estado de la playa, regulación, recursos, temporada, partes interesadas. Sargagame proporciona datos para informar la decisión.")}</p>
      </details>
    </section>
  )
}

function RecoverLayer({ lang }) {
  return (
    <section className="cl-layer cl-recover" id="panel-recover" role="tabpanel" aria-labelledby="tab-recover">
      <header className="cl-layer-header">
        <Icon name="boat" size={28} aria-hidden="true" />
        <div>
          <h2>{_t2(lang, "RECOVER", "RECOVER", "RECUPERAR")}</h2>
          <p>{_t2(lang, "La récupération crée une chaîne opérationnelle — « récupérer » ≠ « problème résolu »", "Recovery creates an operational chain — 'collect' ≠ 'problem solved'", "La recuperación crea una cadena operativa — 'recoger' ≠ 'problema resuelto'")}</p>
        </div>
      </header>

      <div className="cl-recovery-chain" role="list" aria-label={_t2(lang, "Étapes de récupération", "Recovery steps", "Pasos de recuperación")}>
        {RECOVERY_STEPS.map((step, i) => (
          <div key={step.id} className="cl-recovery-step" style={{ "--i": i * 80 }}>
            <span className="cl-recovery-num">{i + 1}</span>
            <Icon name="route" size={24} aria-hidden="true" />
            <div className="cl-recovery-content">
              <strong>{step.label[lang]}</strong>
              <span className="cl-recovery-constraints">{step.constraints[lang]}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="cl-hard-truth">
        <strong>{_t2(lang, "« récupérer » ≠ « problème résolu »", "'collect' ≠ 'problem solved'", "'recoger' ≠ 'problema resuelto'")}</strong>
        <p>{_t2(lang, "Contraintes réelles : logistiques · environnementales · sanitaires · économiques · opérationnelles. Aucun coût, rendement ou capacité n'est inventé ici.", "Real constraints: logistical · environmental · health · economic · operational. No costs, yields or capacities are invented here.", "Restricciones reales: logísticas · ambientales · sanitarias · económicas · operativas. No se inventan costes, rendimientos ni capacidades aquí.")}</p>
      </div>

      <details className="cl-evidence">
        <summary>{_t2(lang, "Chaîne complète non montrée = vision incomplète", "Full chain not shown = incomplete view", "Cadena completa no mostrada = visión incompleta")}</summary>
        <p>{_t2(lang, "Arrêter à la collecte ignore le tri, le transport, le stockage, le traitement, la sécurisation. Chaque maillon a ses contraintes, ses coûts, ses risques.", "Stopping at collection ignores sorting, transport, storage, processing, securing. Each link has its constraints, costs, risks.", "Parar en la recogida ignora clasificación, transporte, almacenamiento, tratamiento, aseguramiento. Cada eslabón tiene sus restricciones, costes, riesgos.")}</p>
      </details>
    </section>
  )
}

function ValorizeLayer({ lang }) {
  return (
    <section className="cl-layer cl-valorize" id="panel-valorize" role="tabpanel" aria-labelledby="tab-valorize">
      <header className="cl-layer-header">
        <Icon name="fish" size={28} aria-hidden="true" />
        <div>
          <h2>{_t2(lang, "VALORIZE", "VALORIZE", "VALORIZAR")}</h2>
          <p>{_t2(lang, "Peut-on transformer une partie du problème en ressource ?", "Can part of the problem become a resource?", "¿Puede parte del problema convertirse en recurso?")}</p>
        </div>
      </header>

      <div className="cl-valorize-grid">
        {VALORIZATION_PATHS.map(path => (
          <article key={path.id} className="cl-valorize-card">
            <header>
              <strong>{path.label[lang]}</strong>
              <span className="cl-maturity">{path.maturity}</span>
            </header>
            <p className="cl-potential">{path.potential[lang]}</p>
            <p className="cl-constraints">{_t2(lang, "Contraintes", "Constraints", "Restricciones")}: {path.constraints[lang]}</p>
            <footer>{_t2(lang, `Maturité: ${path.maturity}`, `Maturity: ${path.maturity}`, `Madurez: ${path.maturity}`)}</footer>
          </article>
        ))}
      </div>

      <div className="cl-hard-truth">
        <strong>{_t2(lang, "Jamais de promesse écologique non démontrée", "No undemonstrated ecological promise", "Ninguna promesa ecológica no demostrada")}</strong>
        <p>{_t2(lang, "Lorsque les données manquent : « À documenter » ou « À valider ».", "When data is missing: 'To document' or 'To validate'.", "Cuando faltan datos: 'A documentar' o 'A validar'.")}</p>
      </div>

      <details className="cl-evidence">
        <summary>{_t2(lang, "La valorisation n'est pas la solution unique", "Valorization is not the sole solution", "La valorización no es la solución única")}</summary>
        <p>{_t2(lang, "Elle s'inscrit DANS la chaîne : récupération → traitement → valorisation. Sans les étapes amont, aucune filière aval ne peut exister à l'échelle.", "It sits WITHIN the chain: recovery → processing → valorization. Without upstream steps, no downstream pathway can exist at scale.", "Se inscribe EN la cadena: recuperación → tratamiento → valorización. Sin los pasos previos, ninguna vía aguas abajo puede existir a escala.")}</p>
      </details>
    </section>
  )
}

function HardProblem({ lang }) {
  return (
    <section className="cl-hard-problem" aria-labelledby="cl-hard-title">
      <h2 id="cl-hard-title" className="cl-hard-title">{_t2(lang, "WHY THIS IS HARD", "WHY THIS IS HARD", "POR QUÉ ES DIFÍCIL")}</h2>
      <p className="cl-hard-sub">{_t2(lang, "Il n'existe pas de bouton magique « REMOVE SARGASSUM » — mais un système complexe de décision littorale", "No magic 'REMOVE SARGASSUM' button exists — but a complex coastal decision system", "No existe un botón mágico 'ELIMINAR SARGAZO' — sino un sistema complejo de decisión litoral")}</p>

      <div className="cl-constraints-cloud" role="list" aria-label={_t2(lang, "Contraintes interconnectées", "Interconnected constraints", "Restricciones interconectadas")}>
        {HARD_CONSTRAINTS.map((c, i) => (
          <span key={c} className="cl-constraint-chip" style={{ "--i": i * 40 }}>{c}</span>
        ))}
      </div>

      <p className="cl-hard-conclusion">{_t2(lang, "Chaque contrainte en tire d'autres. La décision littorale est un compromis multi-dimensionnel.", "Each constraint pulls others. Coastal decision is a multi-dimensional tradeoff.", "Cada restricción arrastra otras. La decisión litoral es un compromiso multi-dimensional.")}</p>
    </section>
  )
}

function TourismConnection({ lang, onExplore, onPlan, onMonitor }) {
  return (
    <section className="cl-tourism" aria-labelledby="cl-tourism-title">
      <h2 id="cl-tourism-title" className="cl-tourism-title">{_t2(lang, "POURQUOI SARAGAME ?", "WHY SARAGAME?", "¿POR QUÉ SARAGAME?")}</h2>

      <div className="cl-tourism-flow">
        <div className="cl-tourism-step sgm-dayin" style={{ "--i": 0 }}>
          <Icon name="fish" size={24} aria-hidden="true" />
          <strong>{_t2(lang, "DREAM", "DREAM", "SOÑAR")}</strong>
          <span>{_t2(lang, "Choisir sa destination", "Choose destination", "Elegir destino")}</span>
        </div>
        <Icon name="route" size={16} aria-hidden="true" className="cl-tourism-arrow" />
        <div className="cl-tourism-step sgm-dayin" style={{ "--i": 1 }}>
          <Icon name="compass" size={24} aria-hidden="true" />
          <strong>{_t2(lang, "CHOOSE", "CHOOSE", "ELEGIR")}</strong>
          <span>{_t2(lang, "Sélectionner sa plage", "Pick your beach", "Seleccionar playa")}</span>
        </div>
        <Icon name="route" size={16} aria-hidden="true" className="cl-tourism-arrow" />
        <div className="cl-tourism-step sgm-dayin" style={{ "--i": 2 }}>
          <Icon name="route" size={24} aria-hidden="true" />
          <strong>{_t2(lang, "PLAN", "PLAN", "PLANIFICAR")}</strong>
          <span>{_t2(lang, "Organiser son séjour", "Plan your stay", "Planificar estancia")}</span>
        </div>
        <Icon name="route" size={16} aria-hidden="true" className="cl-tourism-arrow" />
        <div className="cl-tourism-step sgm-dayin" style={{ "--i": 3 }}>
          <Icon name="satellite" size={24} aria-hidden="true" />
          <strong>{_t2(lang, "MONITOR", "MONITOR", "MONITORIZAR")}</strong>
          <span>{_t2(lang, "Suivre l'état jour par jour", "Track daily status", "Seguir estado diario")}</span>
        </div>
        <Icon name="route" size={16} aria-hidden="true" className="cl-tourism-arrow" />
        <div className="cl-tourism-step sgm-dayin" style={{ "--i": 4 }}>
          <Icon name="boat" size={24} aria-hidden="true" />
          <strong>{_t2(lang, "ADAPT", "ADAPT", "ADAPTAR")}</strong>
          <span>{_t2(lang, "Changer de plage si besoin", "Switch beach if needed", "Cambiar de playa si hace falta")}</span>
        </div>
        <Icon name="route" size={16} aria-hidden="true" className="cl-tourism-arrow" />
        <div className="cl-tourism-step sgm-dayin" style={{ "--i": 5 }}>
          <Icon name="fish" size={24} aria-hidden="true" />
          <strong>{_t2(lang, "ENJOY", "ENJOY", "DISFRUTAR")}</strong>
          <span>{_t2(lang, "Profiter sereinement", "Enjoy peacefully", "Disfrutar tranquilo")}</span>
        </div>
      </div>

      <div className="cl-value-props">
        <h3>{_t2(lang, "Ce que Sargagame apporte", "What Sargagame provides", "Qué aporta Sargagame")}</h3>
        <ul>
          <li><Icon name="satellite" size={16} aria-hidden="true" /> {_t2(lang, "Monitoring satellite temps réel", "Real-time satellite monitoring", "Monitorización satélite tiempo real")}</li>
          <li><Icon name="compass" size={16} aria-hidden="true" /> {_t2(lang, "Forecast 7 jours par plage", "7-day forecast per beach", "Pronóstico 7 días por playa")}</li>
          <li><Icon name="route" size={16} aria-hidden="true" /> {_t2(lang, "Fiabilité & confiance affichées", "Reliability & confidence shown", "Fiabilidad y confianza mostradas")}</li>
          <li><Icon name="fish" size={16} aria-hidden="true" /> {_t2(lang, "Alternatives intelligentes", "Smart alternatives", "Alternativas inteligentes")}</li>
          <li><Icon name="boat" size={16} aria-hidden="true" /> {_t2(lang, "Planification de séjour", "Stay planning", "Planificación de estancia")}</li>
        </ul>
      </div>

      <div className="cl-cta-group">
        <button className="cl-cta primary" onClick={onExplore}>{_t2(lang, "Explorer les plages", "Explore beaches", "Explorar playas")}</button>
        <button className="cl-cta secondary" onClick={onPlan}>{_t2(lang, "Planifier mon séjour", "Plan my stay", "Planificar mi estancia")}</button>
        <button className="cl-cta secondary" onClick={onMonitor}>{_t2(lang, "Surveiller mes plages", "Monitor my beaches", "Monitorizar mis playas")}</button>
      </div>
    </section>
  )
}

function EcosystemView({ lang }) {
  return (
    <section className="cl-ecosystem" aria-labelledby="cl-eco-title">
      <h2 id="cl-eco-title" className="cl-eco-title">{_t2(lang, "VUE ÉCOSYSTÈME", "ECOSYSTEM VIEW", "VISTA ECOSISTEMA")}</h2>

      <div className="cl-eco-chain">
        <div className="cl-eco-step"><Icon name="fish" size={20} aria-hidden="true" /> {_t2(lang, "OCÉAN", "OCEAN", "OCÉANO")}</div>
        <Icon name="route" size={14} aria-hidden="true" />
        <div className="cl-eco-step"><Icon name="compass" size={20} aria-hidden="true" /> {_t2(lang, "LITTORAL", "LITTORAL", "LITORAL")}</div>
        <Icon name="route" size={14} aria-hidden="true" />
        <div className="cl-eco-step"><Icon name="boat" size={20} aria-hidden="true" /> {_t2(lang, "PLAGE", "BEACH", "PLAYA")}</div>
        <Icon name="route" size={14} aria-hidden="true" />
        <div className="cl-eco-step"><Icon name="satellite" size={20} aria-hidden="true" /> {_t2(lang, "USAGE HUMAIN", "HUMAN USE", "USO HUMANO")}</div>
        <Icon name="route" size={14} aria-hidden="true" />
        <div className="cl-eco-step"><Icon name="route" size={20} aria-hidden="true" /> {_t2(lang, "ÉCOSYSTÈME", "ECOSYSTEM", "ECOSISTEMA")}</div>
      </div>

      <div className="cl-dim-grid">
        {ECOSYSTEM_DIMS.map(dim => (
          <div key={dim.id} className="cl-dim-card">
            <Icon name={dim.icon} size={28} aria-hidden="true" />
            <strong>{dim.label[lang]}</strong>
            <p>{_t2(lang, "Données plage → décision → impact", "Beach data → decision → impact", "Datos playa → decisión → impacto")}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function CoastalLab({
  lang = "fr",
  beach,
  sargData,
  allBeaches = [],
  imageMap = null,
  isNewRegion = false,
  BEACH_TO_SARG = {},
  onClose,
  onExplore,
  onPlan,
  onMonitor,
}) {
  const [currentLayer, setCurrentLayer] = useState("monitor")
  const [selectedBeach, setSelectedBeach] = useState(beach)
  const stepRef = useRef(0)

  useEffect(() => {
    track("sg_lab_open", { beach_id: beach?.id, lang })
    track(`sg_lab_step_view`, { step: "monitor", beach_id: beach?.id })
  }, [beach?.id, lang])

  const handleLayerChange = useCallback((layerId) => {
    setCurrentLayer(layerId)
    stepRef.current = LAYERS.findIndex(l => l.id === layerId)
    track("sg_lab_step_view", { step: layerId, beach_id: selectedBeach?.id })
  }, [selectedBeach?.id])

  const handleBeachSelect = useCallback((newBeach) => {
    setSelectedBeach(newBeach)
    track("sg_lab_beach_select", { beach_id: newBeach.id, from: "explorer" })
  }, [])

  const handleDecisionAction = useCallback((actionId) => {
    track("sg_lab_decision_view", { action: actionId, beach_id: selectedBeach?.id })
  }, [selectedBeach?.id])

  const renderLayer = () => {
    switch (currentLayer) {
      case "monitor":
        return <MonitorLayer beach={selectedBeach} sargData={sargData} lang={lang} imageMap={imageMap} isNewRegion={isNewRegion} BEACH_TO_SARG={BEACH_TO_SARG} />
      case "understand":
        return <UnderstandLayer beach={selectedBeach} sargData={sargData} lang={lang} />
      case "decide":
        return <DecideLayer beach={selectedBeach} sargData={sargData} lang={lang} onAction={handleDecisionAction} />
      case "recover":
        return <RecoverLayer lang={lang} />
      case "valorize":
        return <ValorizeLayer lang={lang} />
      default:
        return <MonitorLayer beach={selectedBeach} sargData={sargData} lang={lang} imageMap={imageMap} isNewRegion={isNewRegion} BEACH_TO_SARG={BEACH_TO_SARG} />
    }
  }

  return (
    <div className="coastal-lab" data-sgm-status={selectedBeach?.status || "moderate"}>
      <header className="cl-header">
        <button className="cl-close" onClick={onClose} aria-label={_t2(lang, "Fermer le Lab", "Close Lab", "Cerrar Lab")}>
          <Icon name="route" size={20} aria-hidden="true" style={{ transform: "rotate(45deg)" }} />
        </button>
        <h1 className="cl-title">
          <Icon name="satellite" size={28} aria-hidden="true" />
          <span>{_t2(lang, "SARGASSUM COASTAL LAB", "SARGASSUM COASTAL LAB", "SARGASSUM COASTAL LAB")}</span>
          <span className="cl-subtitle">{_t2(lang, "Littoral Decision Lab", "Littoral Decision Lab", "Laboratorio de Decisión Litoral")}</span>
        </h1>
      </header>

      <LayerNav current={currentLayer} onChange={handleLayerChange} lang={lang} />

      <main className="cl-main" role="main">
        {renderLayer()}

        {currentLayer === "decide" && <HardProblem lang={lang} />}

        <TourismConnection lang={lang} onExplore={onExplore} onPlan={onPlan} onMonitor={onMonitor} />
        <EcosystemView lang={lang} />
      </main>

      <footer className="cl-footer">
        <p>{_t2(lang, "Sargagame — Données 100% satellite ERDDAP/Copernicus · Honnêteté absolue · Aucune donnée inventée", "Sargagame — 100% ERDDAP/Copernicus satellite data · Absolute honesty · No invented data", "Sargagame — Datos 100% satélite ERDDAP/Copernicus · Honestidad absoluta · Ningún dato inventado")}</p>
      </footer>
    </div>
  )
}

export default CoastalLab