import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { en, fil, type StringKey } from '../i18n/strings'

export type Language = 'en' | 'fil'

const STORAGE_KEY = 'elgu-language'

const DICTIONARIES: Record<Language, Record<StringKey, string>> = { en, fil }

/**
 * Starts from what the resident has chosen before, then from the browser: a
 * device set to Filipino or Tagalog opens in Filipino without anyone hunting
 * for a switch.
 */
function initialLanguage(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'en' || stored === 'fil') return stored
  } catch {
    // Storage can be blocked; fall through to the browser's preference.
  }
  const preferred = typeof navigator !== 'undefined' ? navigator.language.toLowerCase() : ''
  return preferred.startsWith('fil') || preferred.startsWith('tl') ? 'fil' : 'en'
}

interface I18nValue {
  language: Language
  setLanguage: (next: Language) => void
  /** Looks up a string, substituting {name} placeholders. */
  t: (key: StringKey, vars?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18nValue | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(initialLanguage)

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // A refused write only costs the preference on the next visit.
    }
    document.documentElement.lang = next === 'fil' ? 'fil' : 'en'
  }, [])

  const t = useCallback(
    (key: StringKey, vars?: Record<string, string | number>) => {
      const template = DICTIONARIES[language][key] ?? en[key]
      if (!vars) return template
      return Object.entries(vars).reduce(
        (out, [name, value]) => out.replaceAll(`{${name}}`, String(value)),
        template
      )
    },
    [language]
  )

  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useT() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useT must be used within I18nProvider')
  return ctx
}
