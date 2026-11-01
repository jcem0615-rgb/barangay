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
  productName: string
  tier: DeploymentTier
  servedBarangay: ServedBarangay | null
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

/** Which product this install is. See the server's `deployment.ts`. */
export type DeploymentTier = 'municipal' | 'barangay'
export interface ServedBarangay { id: string; name: string }

interface CatalogueValue {
  /**
   * `municipal` is the hall and every barangay under it. `barangay` is one
   * barangay standing alone, with no hall: no municipal services, no payments,
   * no appointments, and no tier switch to show.
   *
   * It comes off the catalogue rather than a build flag because the same bundle
   * serves both, and it is read before the first paint because it decides what
   * the shell draws. What it falls back to when nothing has said yet is
   * `DEFAULT_TIER` below — `barangay` in this repository.
   */
  tier: DeploymentTier
  /**
   * What this install calls itself. The two tiers are two products sold to two
   * buyers, so a barangay deployment is not an "eLGU Citizen Portal".
   */
  productName: string
  /** In `barangay` tier, the one barangay served. Null municipally. */
  servedBarangay: ServedBarangay | null
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

/**
 * What this build is before anything has told it otherwise.
 *
 * **This repository is the barangay product** (see SPLIT.md), so these are the
 * barangay's. Upstream they were `municipal` and `eLGU Citizen Portal`, which
 * was right there and wrong here in a way nothing would have caught: the
 * values are read at the *first paint*, before the catalogue has answered, and
 * `document.title` is written from `productName` below. So a cold load of the
 * barangay app — a first-ever visit, or one after cleared site data, where
 * `readCache()` finds nothing — drew the municipal two-tier dashboard and
 * *overwrote* the correct build-time title in `index.html` with the other
 * product's name, before flipping to the right one a moment later.
 *
 * They are constants rather than five literals because five is how they came
 * to disagree: the two `useState` seeds, the two setters on the catalogue
 * response and the copy written to the cache all repeated the same pair.
 *
 * The fallback on the response is not dead either — a server that does not
 * publish `tier` at all is an older one, and in this repository the honest
 * reading of its silence is "barangay", not "the hall".
 */
const DEFAULT_TIER: DeploymentTier = 'barangay'
const DEFAULT_PRODUCT_NAME = 'eBarangay Portal'

const CatalogueContext = createContext<CatalogueValue | null>(null)

/** The office and service catalogue comes from the server, not a local file. */
export function CatalogueProvider({ children }: { children: ReactNode }) {
  // Seeded from the cache so the first paint already has something, rather
  // than an empty shell that fills in once the network answers.
  const cached = readCache()
  const [tier, setTier] = useState<DeploymentTier>(cached?.tier ?? DEFAULT_TIER)
  const [productName, setProductName] = useState<string>(cached?.productName ?? DEFAULT_PRODUCT_NAME)
  const [servedBarangay, setServedBarangay] = useState<ServedBarangay | null>(cached?.servedBarangay ?? null)
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
        setTier(c.tier ?? DEFAULT_TIER)
        setProductName(c.productName ?? DEFAULT_PRODUCT_NAME)
        setServedBarangay(c.barangay ?? null)
        setMunicipality(c.municipality ?? null)
        setDepartments(c.departments)
        setServices(c.services)
        setPrograms(c.programs ?? [])
        setEmergencyContacts(c.emergencyContacts ?? [])
        setHolidays(new Set(holidayDates))
        writeCache({
          tier: c.tier ?? DEFAULT_TIER,
          productName: c.productName ?? DEFAULT_PRODUCT_NAME,
          servedBarangay: c.barangay ?? null,
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

  // The tab, and the window title of an installed copy.
  //
  // index.html carries a build-time title, which is right for the first paint
  // — and now agrees with `DEFAULT_PRODUCT_NAME`, so a cold load no longer
  // overwrites it with the other product's name — and wrong the moment one
  // bundle is pointed at the other tier's server. The
  // catalogue knows which product this actually is, so it says so — the same
  // reasoning as <html lang> following the language rather than the last tap.
  useEffect(() => {
    document.title = productName
  }, [productName])

  return (
    <CatalogueContext.Provider
      value={{
        tier,
        productName,
        servedBarangay,
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
