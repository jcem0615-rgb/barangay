import { createContext, useContext, type ReactNode } from 'react'
import { useApplications } from './useApplications'
import { useAuth } from './auth'
import { useCatalogue } from './catalogue'

type AppDataValue = ReturnType<typeof useApplications>

const AppDataContext = createContext<AppDataValue | null>(null)

export function AppDataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { tier } = useCatalogue()
  // Only residents have a request list of their own to load — and only in a
  // municipal deployment is there a list to load. `/requests` is the hall's and
  // is not mounted in barangay tier, where a certificate request is read from
  // the barangay hub instead; asking anyway would answer 404 and put a server
  // error in front of a resident whose app is working perfectly.
  const value = useApplications(user?.role === 'resident' && tier !== 'barangay')
  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>
}

export function useAppData() {
  const ctx = useContext(AppDataContext)
  if (!ctx) throw new Error('useAppData must be used within AppDataProvider')
  return ctx
}
