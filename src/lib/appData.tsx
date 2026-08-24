import { createContext, useContext, type ReactNode } from 'react'
import { useApplications } from './useApplications'
import { useAuth } from './auth'

type AppDataValue = ReturnType<typeof useApplications>

const AppDataContext = createContext<AppDataValue | null>(null)

export function AppDataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  // Only residents have a request list of their own to load.
  const value = useApplications(user?.role === 'resident')
  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>
}

export function useAppData() {
  const ctx = useContext(AppDataContext)
  if (!ctx) throw new Error('useAppData must be used within AppDataProvider')
  return ctx
}
