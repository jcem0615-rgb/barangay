import {
  createContext, useContext, useEffect, useMemo, useState, type ReactNode,
} from 'react'
import { api } from './api'
import { useAuth } from './auth'

/**
 * The barangay's own logo, fetched once and shared by everything that draws it.
 *
 * **It is a context rather than a hook each screen calls**, because three
 * places want the same picture at once — the dashboard behind the greeting,
 * the digital ID behind the card, and the bar at the top — and a hook per
 * screen would fetch it three times and hold three object URLs for one image.
 *
 * It is fetched as a **blob** and handed to the DOM as an object URL, for the
 * reason the ID portrait already is: `<img src>` cannot carry a bearer token,
 * and this image sits behind a session.
 *
 * **A barangay with no logo is the ordinary case, not an error.** Every
 * consumer takes `null` and draws what it drew before — the seal ring behind
 * the ID, a plain header — so a barangay that never uploads one sees no
 * difference and nothing renders a broken image.
 */
interface LogoValue {
  /** An object URL, or null when there is no logo or it could not be read. */
  url: string | null
  /** True while the first fetch is in flight, so nothing flashes in and out. */
  loading: boolean
}

const LogoContext = createContext<LogoValue>({ url: null, loading: false })

export function BarangayLogoProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth()
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Residents only. Staff consoles have their own preview on the Hall tab, and
  // asking for this from a municipal account would be a 404 on every sign-in.
  const isResident = user?.role === 'resident'
  // From the profile rather than the account: `AuthUser` carries the role and
  // the departments, and which barangay somebody lives in is a fact about the
  // resident. It is also what changes when an account registered before
  // barangays were rows is asked to pick one — which is the case this
  // dependency exists for.
  const barangay = profile?.barangay ?? null

  useEffect(() => {
    if (!isResident || !barangay) {
      setUrl((current) => {
        if (current) URL.revokeObjectURL(current)
        return null
      })
      return
    }
    let live = true
    let made: string | null = null
    setLoading(true)
    api.residentBarangayLogo()
      .then((blob) => {
        if (!live) return
        // 404 is the normal answer for a barangay that has not uploaded one.
        if (!blob) return
        made = URL.createObjectURL(blob)
        setUrl(made)
      })
      .catch(() => undefined)
      .finally(() => { if (live) setLoading(false) })
    return () => {
      live = false
      if (made) URL.revokeObjectURL(made)
    }
    // Re-fetched when the resident's barangay changes, which happens once when
    // an account registered before barangays were rows is asked to pick one.
  }, [isResident, barangay])

  /**
   * The browser tab's icon follows the logo too.
   *
   * This and the top bar are as close as a running app gets to "the app's
   * logo". **The installed icon cannot follow**: a PWA's icon and name are
   * read from the manifest when the resident adds it to their home screen and
   * are baked in there — the same fact that makes `VITE_PRODUCT` the one
   * build-time flag in this codebase. So a barangay that uploads its logo gets
   * it everywhere the app draws, and the icon already on somebody's home
   * screen stays what it was.
   *
   * The original href is put back on the way out, so signing out of a barangay
   * with a logo does not leave its mark on the tab.
   */
  useEffect(() => {
    if (!url) return
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (!link) return
    const original = link.href
    link.href = url
    return () => { link.href = original }
  }, [url])

  const value = useMemo(() => ({ url, loading }), [url, loading])
  return <LogoContext.Provider value={value}>{children}</LogoContext.Provider>
}

export function useBarangayLogo() {
  return useContext(LogoContext)
}
