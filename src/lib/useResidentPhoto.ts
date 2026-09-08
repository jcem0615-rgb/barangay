import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError } from './api'
import { useAuth } from './auth'
import { compressImage, PORTRAIT_MAX_EDGE } from './imageCompress'

/**
 * The portrait on the digital ID.
 *
 * The image is fetched as a blob rather than pointed at with `<img src>`,
 * because the endpoint needs the bearer token and an img tag cannot carry one.
 * The object URL it produces is revoked when it is replaced or the screen
 * closes, so a resident who re-takes their photo a few times does not leak a
 * blob per attempt.
 */
export function useResidentPhoto() {
  const { profile, refresh } = useAuth()
  const [url, setUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const current = useRef<string | null>(null)

  const show = useCallback((blob: Blob | null) => {
    if (current.current) URL.revokeObjectURL(current.current)
    current.current = blob ? URL.createObjectURL(blob) : null
    setUrl(current.current)
  }, [])

  const load = useCallback(async () => {
    try {
      show(await api.myPhoto())
    } catch {
      // No photo, or offline; the ID falls back to initials either way.
      show(null)
    }
  }, [show])

  useEffect(() => {
    if (profile?.hasPhoto) void load()
    else show(null)
  }, [profile?.hasPhoto, profile?.photoUpdatedAt, load, show])

  // The URL outlives this hook only if it is never revoked.
  useEffect(() => () => {
    if (current.current) URL.revokeObjectURL(current.current)
  }, [])

  const upload = useCallback(
    async (file: File) => {
      setBusy(true)
      setError(null)
      try {
        // Cropped square and scaled down here: an ID portrait is rendered at
        // about 80px, and a 6 MB phone selfie is pure waiting.
        const photo = await compressImage(file, { maxEdge: PORTRAIT_MAX_EDGE, square: true })
        await api.setMyPhoto(photo)
        // The blob is what we just sent, so the ID updates without a round trip.
        show(photo)
        await refresh()
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not save that photo.')
      } finally {
        setBusy(false)
      }
    },
    [refresh, show]
  )

  const remove = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      await api.removeMyPhoto()
      show(null)
      await refresh()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not remove that photo.')
    } finally {
      setBusy(false)
    }
  }, [refresh, show])

  return { url, busy, error, upload, remove, hasPhoto: Boolean(profile?.hasPhoto) }
}
