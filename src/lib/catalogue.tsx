import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api } from './api'
import type {
  EmergencyContact, Municipality, SectoralProgram, ServiceCategory, ServiceDefinition,
} from '../types'

/**
 * The last catalogue the server gave us, kept on the device.
 *
 * Everything here reads better from cache than from nothing, but the emergency
 * hotlines are the reason it exists: a resident needing one is very often
 * somewhere with no signal, and a number that only works online is not a number
 * to put on an ID. The network copy still wins the moment it arrives.
 */
const CACHE_KEY = 'elgu-catalogue-v1'

interface CachedCatalogue {
  municipality: Municipality | null
  departments: ServiceCategory[]
  services: ServiceDefinition[]
  programs: SectoralProgram[]
  emergencyContacts: EmergencyContact[]
  holidays: string[]
}

function readCache(): CachedCatalogue | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? (JSON.parse(raw) as CachedCatalogue) : null
  } catch {
    // Blocked storage or a shape this build no longer understands.
    return null
  }
}

function writeCache(value: CachedCatalogue) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(value))
  } catch {
    // Storage full or refused; the session continues on the network copy.
  }
}

interface CatalogueValue {
  /**
   * The municipality this portal serves. Null until the catalogue has been
   * fetched once — the sign-up screen waits rather than guessing, because naming
   * the wrong town on the screen that binds an account to one would be worse
   * than a moment of blank space.
   */
  municipality: Municipality | null
  departments: ServiceCategory[]
  services: ServiceDefinition[]
  /** Sectoral registries and poverty-reduction programmes, in display order. */
  programs: SectoralProgram[]
  /** Emergency hotlines for this municipality, municipal ones first. */
  emergencyContacts: EmergencyContact[]
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
  // Seeded from the cache so the first paint already has something, rather
  // than an empty shell that fills in once the network answers.
  const cached = readCache()
  const [municipality, setMunicipality] = useState<Municipality | null>(cached?.municipality ?? null)
  const [departments, setDepartments] = useState<ServiceCategory[]>(cached?.departments ?? [])
  const [services, setServices] = useState<ServiceDefinition[]>(cached?.services ?? [])
  const [programs, setPrograms] = useState<SectoralProgram[]>(cached?.programs ?? [])
  const [emergencyContacts, setEmergencyContacts] = useState<EmergencyContact[]>(
    cached?.emergencyContacts ?? []
  )
  const [holidays, setHolidays] = useState<Set<string>>(() => new Set(cached?.holidays ?? []))
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    api
      .catalogue()
      .then((c) => {
        const holidayDates = (c.holidays ?? []).map((h) => h.date)
        setMunicipality(c.municipality ?? null)
        setDepartments(c.departments)
        setServices(c.services)
        setPrograms(c.programs ?? [])
        setEmergencyContacts(c.emergencyContacts ?? [])
        setHolidays(new Set(holidayDates))
        writeCache({
          municipality: c.municipality ?? null,
          departments: c.departments,
          services: c.services,
          programs: c.programs ?? [],
          emergencyContacts: c.emergencyContacts ?? [],
          holidays: holidayDates,
        })
      })
      // Offline, or the API is down: whatever was cached still stands.
      .catch(() => undefined)
      .finally(() => setLoaded(true))
  }, [])

  return (
    <CatalogueContext.Provider
      value={{
        municipality,
        departments,
        services,
        programs,
        emergencyContacts,
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
