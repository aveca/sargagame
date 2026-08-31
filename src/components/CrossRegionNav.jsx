import React, { useState, useEffect } from "react"

const REGIONS = [
  { code: "MQ", name: "Martinique", domain: "sargasses-martinique.com", lang: "fr", flag: "🇲🇶" },
  { code: "GP", name: "Guadeloupe", domain: "sargasses-guadeloupe.com", lang: "fr", flag: "🇬🇵" },
  { code: "FL", name: "Miami", domain: "sargassummiami.com", lang: "en", flag: "🇺🇸" },
  { code: "PC", name: "Punta Cana", domain: "sargassumpuntacana.com", lang: "es", flag: "🇩🇴" },
  { code: "RM", name: "Cancún", domain: "sargassumcancun.com", lang: "es", flag: "🇲🇽" },
  { code: "TL", name: "Tulum", domain: "sargazotulum.com", lang: "es", flag: "🇲🇽" }
]

const CURRENT_KEY = "sg_cross_region_nav"

export default function CrossRegionNav() {
  const current = typeof window !== "undefined" ? window.location.hostname.replace(/^www\./, "") : ""
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(CURRENT_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed && parsed.length) {
          // Try to match saved region to current, but always update with current
          const hasCurrent = parsed.includes(current)
          if (!hasCurrent && current) {
            const updated = [...new Set([...parsed, current])]
            localStorage.setItem(CURRENT_KEY, JSON.stringify(updated))
          }
        }
      } else {
        localStorage.setItem(CURRENT_KEY, JSON.stringify([current]))
      }
    } catch (_) {}
  }, [current])

  const handleRegionClick = (targetDomain) => {
    window.location.href = `https://${targetDomain}`
  }

  const regionClasses = (r) => {
    const isCurrent = r.domain === current
    return `
      border: ${isCurrent ? "2px solid var(--sg-sky-2)" : "1px solid var(--sg-border)"};
      background: ${isCurrent ? "var(--sg-sky-2)" : "var(--sg-sky-0)"};
      color: ${isCurrent ? "var(--sg-sky-0)" : "var(--sg-ink)"}
    `
  }

  return (
    <nav
      role="navigation"
      aria-label="SargaGame region navigation"
      data-testid="cross-region-nav"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        background: "var(--sg-sky-0)",
        borderBottom: "1px solid var(--sg-border)",
        zIndex: 1000,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          gap: 8,
          flexWrap: "wrap",
        }}
        aria-expanded={isOpen}
      >
        <span
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "var(--sg-sky-2)",
            whiteSpace: "nowrap",
          }}
        >
          SargaGame
        </span>
        <button
          onClick={() => setIsOpen(!isOpen)}
          style={{
            display: "none",
            "@media (max-width: 768px)": { display: "flex" },
          }}
        >
          ☰ Regions
        </button>
      </div>

      {/* Desktop: horizontal bar with 6 links */}
      <div
        style={{
          display: "flex",
          gap: 2,
          overflowX: "auto",
          padding: "0 4px",
          margin: "0 -4px",
          scrollbarWidth: "none",
          WebkitOverflowScrolling: "touch",
        }}
        aria-hidden={!isOpen}
      >
        {REGIONS.map((r) => {
          const isCurrent = r.domain === current
          const style = regionClasses(r)
          return (
            <a
              key={r.domain}
              href="#"
              style={{
                flex: "0 0 auto",
                fontSize: 13,
                padding: "6px 10px",
                borderRadius: 20,
                textDecoration: "none",
                whiteSpace: "nowrap",
                ...style,
                transition: "background .15s, border .15s, color .15s",
              }}
              onClick={(e) => {
                e.preventDefault()
                handleRegionClick(r.domain)
              }}
              title={r.name}
            >
              {r.flag} {r.name}{isCurrent ? " (you are here)" : ""}
            </a>
          )
        })}
      </div>

      {/* Mobile: dropdown with scrollable list */}
      {isOpen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "var(--sg-sky-0)",
            padding: "80px 16px 16px",
            zIndex: 1001,
            overflowY: "auto",
            ...(typeof window !== "undefined"
              ? `{insetInline: env(safe-area-inset-left, 0) env(safe-area-inset-right, 0)}`
              : {}),
          }}
        >
          <button
            onClick={() => setIsOpen(false)}
            style={{
              position: "absolute",
              top: 12,
              right: 12,
              background: "var(--sg-sky-2)",
              border: "none",
              borderRadius: 50,
              width: 32,
              height: 32,
              color: "var(--sg-sky-0)",
              fontSize: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1002,
            }}
            aria-label="Close region navigation"
          >
            ×
          </button>

          <div style={{ gap: 8, marginBottom: 12 }}>
            {REGIONS.map((r) => {
              const isCurrent = r.domain === current
              const style = regionClasses(r)
              return (
                <a
                  key={r.domain}
                  href="#"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 12px",
                    borderRadius: 20,
                    textDecoration: "none",
                    fontSize: 14,
                    whiteSpace: "nowrap",
                    ...style,
                    transition: "background .15s, border .15s, color .15s",
                  }}
                  onClick={(e) => {
                    e.preventDefault()
                    handleRegionClick(r.domain)
                    setIsOpen(false)
                  }}
                  title={r.name}
                >
                  {r.flag} {r.name}{isCurrent ? " (you are here)" : ""}
                </a>
              )
            })}
          </div>

          <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--sg-border)" }}>
            <span style={{ fontSize: 12, color: "var(--sg-mute)" }}>
              SargaGame Network
            </span>
          </div>
        </div>
      )}
    </nav>
  )
}