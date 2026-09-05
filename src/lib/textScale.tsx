import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode,
} from 'react'

/**
 * Resident-controlled text size.
 *
 * Every font size in the app is authored as `calc(<base>px * var(--text-scale))`,
 * so setting one custom property on the document resizes the whole interface —
 * including the digital ID a resident holds up at a counter.
 */
export type TextScale = 'normal' | 'large' | 'xlarge'

export const TEXT_SCALES: Record<TextScale, number> = {
  normal: 1,
  large: 1.15,
  xlarge: 1.3,
}

const STORAGE_KEY = 'elgu-text-scale'

function initialScale(): TextScale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'normal' || saved === 'large' || saved === 'xlarge') return saved
  } catch {
    // Storage can be blocked; fall through to the default.
  }
  return 'normal'
}

interface TextScaleValue {
  scale: TextScale
  setScale: (next: TextScale) => void
}

const TextScaleContext = createContext<TextScaleValue | null>(null)

export function TextScaleProvider({ children }: { children: ReactNode }) {
  const [scale, setScaleState] = useState<TextScale>(initialScale)

  // Applied in an effect rather than at import time so the value survives a
  // hot reload and is set even when the stored preference is the default.
  useEffect(() => {
    document.documentElement.style.setProperty('--text-scale', String(TEXT_SCALES[scale]))
  }, [scale])

  const setScale = useCallback((next: TextScale) => {
    setScaleState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // A refused write only costs the preference on the next visit.
    }
  }, [])

  const value = useMemo(() => ({ scale, setScale }), [scale, setScale])
  return <TextScaleContext.Provider value={value}>{children}</TextScaleContext.Provider>
}

export function useTextScale() {
  const ctx = useContext(TextScaleContext)
  if (!ctx) throw new Error('useTextScale must be used within TextScaleProvider')
  return ctx
}
