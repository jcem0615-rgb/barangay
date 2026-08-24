import { useCallback, useEffect, useRef, useState } from 'react'
import type { Application } from '../types'
import { api, ApiError } from './api'
import { getOutbox, queueSubmission, removeFromOutbox, type PendingSubmission } from './db'
import { useOnlineStatus } from './useOnlineStatus'

/** An outbox entry rendered as a request, so it appears in the list right away. */
function pendingAsApplication(p: PendingSubmission): Application {
  return {
    id: p.localId,
    referenceNo: '—',
    serviceId: p.serviceId,
    serviceName: p.serviceName,
    categoryId: p.categoryId as Application['categoryId'],
    dateSubmitted: p.createdAt,
    currentStepIndex: 0,
    status: 'submitted',
    fee: p.fee,
    paid: false,
    formValues: p.formValues,
    isOfflineDraft: true,
  }
}

export function useApplications(enabled: boolean) {
  const [applications, setApplications] = useState<Application[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isOnline = useOnlineStatus()
  const prevOnline = useRef(isOnline)
  const syncing = useRef(false)

  const refresh = useCallback(async () => {
    if (!enabled) return
    try {
      const [server, outbox] = await Promise.all([api.myRequests(), getOutbox()])
      // Anything still in the outbox is shown alongside what the server has.
      setApplications([...outbox.map(pendingAsApplication), ...server])
      setError(null)
    } catch (err) {
      // Offline is not an error state: fall back to whatever is queued locally.
      const outbox = await getOutbox()
      setApplications(outbox.map(pendingAsApplication))
      if (err instanceof ApiError && err.status !== 0) setError(err.message)
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) {
      setApplications([])
      setLoaded(false)
      return
    }
    void refresh().then(() => setLoaded(true))
  }, [enabled, refresh])

  /** POSTs everything in the outbox, oldest first, then reloads from the server. */
  const flushOutbox = useCallback(async () => {
    if (syncing.current) return
    syncing.current = true
    try {
      for (const item of await getOutbox()) {
        try {
          await api.submitRequest(item.serviceId, item.formValues, item.createdAt)
          await removeFromOutbox(item.localId)
        } catch (err) {
          // A rejected submission would loop forever; drop it and keep the rest.
          if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
            await removeFromOutbox(item.localId)
          } else {
            break // still offline or server down — try again next time
          }
        }
      }
      await refresh()
    } finally {
      syncing.current = false
    }
  }, [refresh])

  useEffect(() => {
    if (!enabled || !loaded) return
    if (!prevOnline.current && isOnline) void flushOutbox()
    prevOnline.current = isOnline
  }, [isOnline, loaded, enabled, flushOutbox])

  const submit = useCallback(
    async (service: { id: string; name: string; categoryId: string; fee: number }, formValues: Record<string, string>) => {
      if (!navigator.onLine) {
        const pending: PendingSubmission = {
          localId: `pending-${crypto.randomUUID()}`,
          serviceId: service.id,
          serviceName: service.name,
          categoryId: service.categoryId,
          fee: service.fee,
          formValues,
          createdAt: new Date().toISOString(),
        }
        await queueSubmission(pending)
        await refresh()
        return pendingAsApplication(pending)
      }
      const created = await api.submitRequest(service.id, formValues)
      await refresh()
      return created
    },
    [refresh]
  )

  const pay = useCallback(
    async (id: string, method: string) => {
      const updated = await api.pay(id, method)
      await refresh()
      return updated
    },
    [refresh]
  )

  return { applications, loaded, isOnline, error, refresh, submit, pay, flushOutbox }
}
