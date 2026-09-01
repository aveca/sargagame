// Minimal dictionary for Language Switcher FR/EN/ES
// Used when LanguageContext is active; falls back to _t() pattern elsewhere

export const dict = {
  // Navigation labels
  nav: {
    map: {
      fr: "Carte",
      en: "Map",
      es: "Mapa",
    },
    beaches: {
      fr: "Plages",
      en: "Beaches",
      es: "Playas",
    },
    pois: {
      fr: "POI",
      en: "POI",
      es: "Puntos de interés",
    },
    activities: {
      fr: "Activités",
      en: "Activities",
      es: "Actividades",
    },
  },

  // Footer labels
  footer: {
    contact: {
      fr: "Contact",
      en: "Contact",
      es: "Contacto",
    },
    mentions: {
      fr: "Mentions légales",
      en: "Legal notices",
      es: "Avis legal",
    },
    privacy: {
      fr: "Confidentialité",
      en: "Privacy",
      es: "Privacidad",
    },
    terms: {
      fr: "Conditions d'utilisation",
      en: "Terms of use",
      es: "Términos de uso",
    },
  },

  // Beach card labels
  beachCard: {
    lastUpdated: {
      fr: "Dernière mise à jour",
      en: "Last updated",
      es: "Última actualización",
    },
    riskLevel: {
      fr: "Niveau de risque",
      en: "Risk level",
      es: "Nivel de riesgo",
    },
    clean: {
      fr: "Propre",
      en: "Clean",
      es: "Limpio",
    },
    moderate: {
      fr: "Modéré",
      en: "Moderate",
      es: "Moderado",
    },
    avoid: {
      fr: "À éviter",
      en: "Avoid",
      es: "Evitar",
    },
  },

  // CrossRegionNav labels
  crossRegionNav: {
    region: {
      fr: "Région",
      en: "Region",
      es: "Región",
    },
    sargassum: {
      fr: "Sargasses",
      en: "Sargassum",
      es: "Sargazo",
    },
  },

  // General
  general: {
    close: {
      fr: "Fermer",
      en: "Close",
      es: "Cerrar",
    },
    loading: {
      fr: "Chargement...",
      en: "Loading...",
      es: "Cargando...",
    },
  },
}

// Default language detection
// Priority: 1) <html lang>, 2) URL pathname, 3) navigator.language, 4) localStorage, 5) "fr"
export const detectLang = () => {
  if (typeof window === "undefined") return "fr"

  // 1) <html lang>
  const htmlLang = document.documentElement?.lang
  if (htmlLang && /^(fr|en|es)$/.test(htmlLang)) return htmlLang

  // 2) URL pathname
  const pathname = window.location.pathname
  if (pathname.startsWith("/es")) return "es"
  if (pathname.startsWith("/en")) return "en"

  // 3) navigator.language
  const navLang = (navigator.language || "fr").toLowerCase().split("-")[0]
  if (navLang === "en") return "en"
  if (navLang === "es") return "es"
  if (navLang === "fr") return "fr"

  // 4) localStorage
  const stored = localStorage.getItem("sg-lang")
  if (stored && /^(fr|en|es)$/.test(stored)) return stored

  return "fr"
}

// Language change handler
export const setLang = (lang) => {
  if (!/^(fr|en|es)$/.test(lang)) return false
  localStorage.setItem("sg-lang", lang)
  document.documentElement.lang = lang
  return true
}

// Get translated string
export const t = (key, lang = detectLang(), defaultFr) => {
  const translations = dict[key]
  if (!translations) return defaultFr || key

  const keyLower = key.toLowerCase()
  if (translations[lang]) return translations[lang]
  if (translations[defaultFr || "fr"]) return translations[defaultFr || "fr"]
  return defaultFr || key
}

// Lang detection is exported as named export above