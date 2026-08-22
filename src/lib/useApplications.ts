import { useCallback, useEffect, useRef, useState } from 'react'
import type { Application } from '../types'
import { getAllApplications, saveApplication, seedIfEmpty } from './db'
import { seedApplications } from '../data/mockData'
import { useOnlineStatus } from './useOnlineStatus'

export function useApplications() {
  const [applications, setApplications] = useState<Application[]>([])
  const [loaded, setLoaded] = useState(false)
  const isOnline = useOnlineStatus()
  const prevOnline = useRef(isOnline)

  const refresh = useCallback(async () => {
    const apps = await getAllApplications()
    setApplications(apps)
  }, [])

  useEffect(() => {
    seedIfEmpty(seedApplications()).then(() => refresh().then(() => setLoaded(true)))
  }, [refresh])

  const upsert = useCallback(
    async (app: Application) => {
      await saveApplication(app)
      await refresh()
    },
    [refresh]
  )

  // When connectivity is restored, any offline drafts that were "submitted while offline"
  // automatically move forward in the workflow, simulating background sync.
  useEffect(() => {
    if (!loaded) return
    if (!prevOnline.current && isOnline) {
      ;(async () => {
        const apps = await getAllApplications()
        const pending = apps.filter((a) => a.isOfflineDraft && a.status !== 'draft')
        for (const app of pending) {
          await saveApplication({ ...app, isOfflineDraft: false })
        }
        if (pending.length > 0) await refresh()
      })()
    }
    prevOnline.current = isOnline
  }, [isOnline, loaded, refresh])

  return { applications, loaded, isOnline, refresh, upsert }
}
