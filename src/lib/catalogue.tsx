import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api } from './api'
import type { SectoralProgram, ServiceCategory, ServiceDefinition } from '../types'

interface CatalogueValue {
  departments: ServiceCategory[]
  services: ServiceDefinition[]
  /** Sectoral registries and poverty-reduction programmes, in display order. */
  programs: SectoralProgram[]
  /** Non-working days, so the form can quote a date before a request exists. */
  holidays: Set<string>
  loaded: boolean
  findCategory: (id: string) => ServiceCategory | undefined
  findService: (id: string) => ServiceDefinition | undefined
  findProgram: (code: string) => SectoralProgram | undefined
}

const CatalogueContext = createContext<CatalogueValue | null>(null)

/** The office and service catalogue comes from the server, not a local file. */
export function CatalogueProvider({ children }: { children: ReactNode }) {
  const [departments, setDepartments] = useState<ServiceCategory[]>([])
  const [services, setServices] = useState<ServiceDefinition[]>([])
  const [programs, setPrograms] = useState<SectoralProgram[]>([])
  const [holidays, setHolidays] = useState<Set<string>>(() => new Set())
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    api
      .catalogue()
      .then((c) => {
        setDepartments(c.departments)
        setServices(c.services)
        setPrograms(c.programs ?? [])
        setHolidays(new Set((c.holidays ?? []).map((h) => h.date)))
      })
      .catch(() => undefined)
      .finally(() => setLoaded(true))
  }, [])

  return (
    <CatalogueContext.Provider
      value={{
        departments,
        services,
        programs,
        holidays,
        loaded,
        findCategory: (id) => departments.find((d) => d.id === id),
        findService: (id) => services.find((s) => s.id === id),
        findProgram: (code) => programs.find((p) => p.code === code),
      }}
    >
      {children}
    </CatalogueContext.Provider>
  )
}

export function useCatalogue() {
  const ctx = useContext(CatalogueContext)
  if (!ctx) throw new Error('useCatalogue must be used within CatalogueProvider')
  return ctx
}
