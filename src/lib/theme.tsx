import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode,
} from 'react'

/**
 * Light or dark, chosen by the resident.
 *
 * **It is one attribute on `<html>`, not a prop threaded through screens** —
 * the same approach `--text-scale` already takes, and for the same reason: a
 * theme that each screen has to opt into is a theme the next screen forgets.
 * `src/index.css` does the work under `:root[data-theme="dark"]`; nothing in
 * any component knows which theme is on.
 *
 * **`system` is the default and is a real third option, not a synonym for
 * light.** A resident who has set their phone to dark at night has already
 * answered this question, and an app that ignores that answer is the one
 * glowing white in a dark room. It also keeps following the phone afterwards,
 * which a resolved-once-at-startup default would not.
 */
export type ThemeChoice = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'elgu-theme'

function initialChoice(): ThemeChoice {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved
  } catch {
    // Storage can be blocked; fall through to the default.
  }
  return 'system'
}

const darkQuery = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null

interface ThemeValue {
  /** What the resident picked, including `system`. */
  choice: ThemeChoice
  /** What is actually on screen — `system` resolved. */
  resolved: 'light' | 'dark'
  setChoice: (next: ThemeChoice) => void
}

const ThemeContext = createContext<ThemeValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>(initialChoice)
  const [systemDark, setSystemDark] = useState(() => darkQuery()?.matches ?? false)

  // Kept live rather than read once: a phone that switches to dark at sunset
  // should take the app with it, and `system` promises exactly that.
  useEffect(() => {
    const query = darkQuery()
    if (!query) return
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  const resolved: 'light' | 'dark' =
    choice === 'system' ? (systemDark ? 'dark' : 'light') : choice

  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-theme', resolved)
    // `color-scheme` is what makes the browser's own furniture follow — form
    // controls, scrollbars and the default canvas behind the app. Without it a
    // dark page keeps white scrollbars and a white flash on overscroll.
    root.style.colorScheme = resolved
    // The address bar and the task switcher read this, so a dark app with a
    // navy strip above it looks half-converted.
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', resolved === 'dark' ? '#0b1020' : '#1e3a8a')
  }, [resolved])

  const setChoice = useCallback((next: ThemeChoice) => {
    setChoiceState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // A refused write only costs the preference on the next visit.
    }
  }, [])

  const value = useMemo(() => ({ choice, resolved, setChoice }), [choice, resolved, setChoice])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
