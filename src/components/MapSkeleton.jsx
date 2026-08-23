/**
 * Skeleton affiché pendant le chargement lazy de Sargasses_PROD.
 * Doit correspondre au background de l'app (rgb(13,17,23)).
 */
export default function MapSkeleton() {
  // i18n sans prop : le skeleton apparaît avant le mount React de l'app — la langue
  // est dérivée du <html lang> posé par le build région (fallback navigateur).
  const lang = (typeof document !== "undefined" && (document.documentElement.lang || "").slice(0, 2))
    || (typeof navigator !== "undefined" && (navigator.language || "fr").slice(0, 2)) || "fr"
  const txt = lang === "en" ? "Loading the map…" : lang === "es" ? "Cargando el mapa…" : "Chargement de la carte…"
  return (
    <div
      role="status"
      aria-label={txt}
      style={{
        width: '100%',
        height: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
        background: 'rgb(13, 17, 23)',
        color: '#8b949e',
        fontSize: '14px',
        fontFamily: 'inherit',
      }}
    >
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="10" stroke="#30363d" strokeWidth="2" />
        <path d="M12 2a10 10 0 0 1 10 10" stroke="#58a6ff" strokeWidth="2" strokeLinecap="round">
          <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite" />
        </path>
      </svg>
      <span>{txt}</span>
    </div>
  );
}