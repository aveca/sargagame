import React, { useContext, useEffect } from "react"
import { dict, detectLang, setLang, t } from "../i18n/translations.js"

// LanguageContext provides language state across the app
const LanguageContext = React.createContext({
  lang: "fr",
  setLang: () => {},
  t: (key, defaultFr) => key,
})

export const LanguageProvider = ({ children }) => {
  const [lang, setLangState] = React.useState(() => detectLang())

  // Sync localStorage change to state
  useEffect(() => {
    const stored = localStorage.getItem("sg-lang")
    if (stored && /^(fr|en|es)$/.test(stored)) {
      setLangState(stored)
    }
  }, [])

  // Sync state change to localStorage + document.lang
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("sg-lang", lang)
      document.documentElement.lang = lang
    }
  }, [lang])

  return (
    <LanguageContext.Provider value={{ lang, setLang: setLangState, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export const useLanguage = () => useContext(LanguageContext)

// LanguageSwitcher component
const Languages = ["fr", "en", "es"]

const LangButton = ({ lang, t }) => {
  const langNames = {
    fr: t("general.close.fr"), // fallback: will render "Fermer" text but button shows lang
    en: "EN",
    es: "ES",
  }

  return (
    <button
      type="button"
      lang={lang}
      style={{
        flex: "0 0 auto",
        marginLeft: 4,
        padding: "6px 12px",
        borderRadius: 20,
        fontWeight: 600,
        fontSize: 12,
        border: "1px solid var(--sg-border)",
        background: "var(--sg-sky-0)",
        color: lang === detectLang() ? "var(--sg-sky-2)" : "var(--sg-ink)",
      }}
      onClick={() => setLang(lang)}
      aria-label={t(`general.close.${lang}`)}
      role="toggle"
      aria-checked={lang === detectLang()}
      tabIndex={0}
    >
      {langNames[lang]}
    </button>
  )
}

export default function LanguageSwitcher() {
  const { lang, setLang: setLangContext, t } = useLanguage()
  const currentLang = detectLang()

  // If no LanguageProvider wrapper, use localStorage/URL-based detection
  if (!currentLang) return null

  return (
    <div
      style={{
        flex: "0 0 auto",
        marginLeft: 8,
        display: "flex",
        gap: 4,
        alignItems: "center",
      }}
      role="group"
      aria-label={t("crossRegionNav.region")}
    >
      {Languages.map((l) => (
        <LangButton key={l} lang={l} t={t} />
      ))}
    </div>
  )
}