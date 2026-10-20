import type { ResidentProfile } from '../types'
import { useAuth } from './auth'

/**
 * Builds the ID-card profile from the signed-in account. Fields the resident
 * hasn't supplied (an address) come back blank rather than invented —
 * the card shows what the LGU actually holds.
 */
export function useResidentProfile(): ResidentProfile | null {
  const { user, profile } = useAuth()
  if (!user) return null

  const firstName = user.fullName.trim().split(/\s+/)[0] ?? user.fullName

  return {
    fullName: user.fullName,
    firstName,
    barangay: profile?.barangay ?? '',
    municipality: profile?.municipality ?? '',
    province: profile?.province ?? '',
    birthDate: profile?.birthDate ?? '',
    address: profile?.address ?? '',
    programs: profile?.programs ?? [],
  }
}

/**
 * Joins the parts of an address a resident has actually supplied. Registration
 * only asks for a barangay, so joining blindly leaves "Poblacion, " with a
 * dangling comma on every account that stopped there.
 */
export function addressLine(...parts: Array<string | null | undefined>): string {
  return parts.map((p) => p?.trim()).filter(Boolean).join(', ')
}
