import { createContext, useContext, type ReactNode } from 'react'
import { useApplications } from './useApplications'

type AppDataValue = ReturnType<typeof useApplications>

const AppDataContext = createContext<AppDataValue | null>(null)

export function AppDataProvider({ children }: { children: ReactNode }) {
  const value = useApplications()
  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>
}

export function useAppData() {
  const ctx = useContext(AppDataContext)
  if (!ctx) throw new Error('useAppData must be used within AppDataProvider')
  return ctx
}
