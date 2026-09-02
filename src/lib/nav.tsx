import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { ServiceCategoryId } from '../types'

export type Screen =
  | { name: 'dashboard' }
  | { name: 'services' }
  | { name: 'category'; categoryId: ServiceCategoryId }
  | { name: 'service-form'; serviceId: string; draftId?: string }
  | { name: 'applications' }
  | { name: 'application-detail'; id: string }
  | { name: 'payment'; id: string }
  | { name: 'profile' }
  | { name: 'id-card' }
  | { name: 'notifications' }

interface NavContextValue {
  screen: Screen
  push: (screen: Screen) => void
  pop: () => void
  replace: (screen: Screen) => void
  canGoBack: boolean
}

const NavContext = createContext<NavContextValue | null>(null)

export function NavProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<Screen[]>([{ name: 'dashboard' }])

  const push = useCallback((s: Screen) => setStack((prev) => [...prev, s]), [])
  const pop = useCallback(() => setStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev)), [])
  const replace = useCallback((s: Screen) => setStack((prev) => [...prev.slice(0, -1), s]), [])

  const value = useMemo<NavContextValue>(
    () => ({ screen: stack[stack.length - 1], push, pop, replace, canGoBack: stack.length > 1 }),
    [stack, push, pop, replace]
  )

  return <NavContext.Provider value={value}>{children}</NavContext.Provider>
}

export function useNav() {
  const ctx = useContext(NavContext)
  if (!ctx) throw new Error('useNav must be used within NavProvider')
  return ctx
}
