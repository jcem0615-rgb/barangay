import type { ResidentProfile } from '../types'
import { useAuth } from './auth'

/**
 * Builds the ID-card profile from the signed-in account. Fields the resident
 * hasn't supplied (PhilSys, address) come back blank rather than invented —
 * the card shows what the LGU actually holds.
 */
export function useResidentProfile(): ResidentProfile | null {
  const { user, profile } = useAuth()
  if (!user) return null

  const firstName = user.fullName.trim().split(/\s+/)[0] ?? user.fullName

  return {
    fullName: user.fullName,
    firstName,
    philSysId: profile?.philSysId ?? '',
    // Only a synced PhilSys number counts as verified.
    philSysSynced: Boolean(profile?.philSysId),
    barangay: profile?.barangay ?? '',
    municipality: profile?.municipality ?? '',
    province: profile?.province ?? '',
    birthDate: profile?.birthDate ?? '',
    address: profile?.address ?? '',
    qrSeed: profile?.philSysId ?? user.id,
  }
}
