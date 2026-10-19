import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode,
} from 'react'
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

/**
 * The BCP 47 tag for `toLocaleDateString` and friends.
 *
 * It lives here because it was being derived in each screen that needed it —
 * `language === 'fil' ? 'fil-PH' : 'en-PH'`, written out three times and
 * forgotten in a dozen others, which is why dates kept coming out as "October"
 * in the middle of a Filipino screen. One place to read it from is the whole
 * fix; the alternative is remembering, and nobody does.
 */
const LOCALES: Record<Language, string> = { en: 'en-PH', fil: 'fil-PH' }

interface I18nValue {
  language: Language
  setLanguage: (next: Language) => void
  /** Pass this to any `toLocale*String` so dates follow the chosen language. */
  locale: string
  /** Looks up a string, substituting {name} placeholders. */
  t: (key: StringKey, vars?: Record<string, string | number>) => string
}

/**
 * The lookup function's type, for plain helpers that format a string outside a
 * component and so have to be handed `t` rather than call `useT` themselves.
 */
export type Translate = I18nValue['t']

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
  }, [])

  /**
   * `<html lang>` follows the language, from the first render onwards.
   *
   * This used to be set inside `setLanguage`, which meant it was only ever
   * right for somebody who *tapped the switch* in that session. A resident
   * returning with Filipino stored, or arriving on a Filipino phone, got a
   * Filipino interface inside `lang="en"` — so a screen reader pronounced it
   * with English rules and the browser offered to translate the page out of a
   * language it was not in. Deriving it from the state rather than from one
   * code path is what makes it true on load as well as on change.
   */
  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

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

  const value = useMemo(
    () => ({ language, setLanguage, locale: LOCALES[language], t }),
    [language, setLanguage, t]
  )
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useT() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useT must be used within I18nProvider')
  return ctx
}
