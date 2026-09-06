import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError } from './api'
import { clearLocalDraft, getLocalDraft, saveLocalDraft } from './db'

/**
 * Keeps a half-filled form.
 *
 * Two tiers, because they solve different problems:
 *
 *  - **IndexedDB, on every keystroke.** Free, synchronous enough to be
 *    invisible, and works with no connection. This is what stops a phone call
 *    or an accidental back-swipe from costing the resident a five-field form.
 *  - **The server, debounced.** Durable, and reaches the resident's other
 *    devices and the Drafts tab. Too expensive to do per keystroke, and it is
 *    not what makes the form feel safe.
 *
 * The local copy is deleted only once the server confirms it, so a copy still
 * sitting there means the server has not got this version yet — which makes it
 * the newer of the two, and the one to restore on return.
 */

const SAVE_DEBOUNCE_MS = 1200

export type DraftStatus = 'clean' | 'saving' | 'saved' | 'unsynced'

export interface DraftState {
  /** Values restored from a draft, or undefined until the lookup finishes. */
  initialValues: Record<string, string> | undefined
  ready: boolean
  status: DraftStatus
  /** True when the form opened onto something the resident had already typed. */
  restored: boolean
  record: (values: Record<string, string>) => void
  discard: () => Promise<void>
  /** Forgets the draft locally once it has become a real request. */
  forget: () => Promise<void>
  draftId: string | null
}

const hasContent = (values: Record<string, string>) =>
  Object.values(values).some((v) => v.trim().length > 0)

export function useDraft(serviceId: string): DraftState {
  const [initialValues, setInitialValues] = useState<Record<string, string> | undefined>()
  const [ready, setReady] = useState(false)
  const [restored, setRestored] = useState(false)
  const [status, setStatus] = useState<DraftStatus>('clean')
  const [draftId, setDraftId] = useState<string | null>(null)

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useRef<Record<string, string>>({})
  // Set once the form is submitted or discarded, so a debounced save already in
  // flight cannot recreate the draft the resident has just finished with.
  const closed = useRef(false)

  useEffect(() => {
    let cancelled = false
    closed.current = false

    async function load() {
      const local = await getLocalDraft(serviceId).catch(() => undefined)
      let server: Awaited<ReturnType<typeof api.listDrafts>>[number] | undefined
      try {
        server = (await api.listDrafts()).find((d) => d.serviceId === serviceId)
      } catch {
        // Offline, or the endpoint is unavailable; the local copy still stands.
      }
      if (cancelled) return

      // A local copy that survived is one the server never acknowledged, so it
      // is at least as new as anything the server holds.
      const chosen = local?.formValues ?? server?.formValues
      setDraftId(server?.id ?? null)
      setInitialValues(chosen)
      setRestored(Boolean(chosen && hasContent(chosen)))
      setStatus(local ? 'unsynced' : 'clean')
      setReady(true)
    }

    void load()
    return () => {
      cancelled = true
      if (timer.current) clearTimeout(timer.current)
    }
  }, [serviceId])

  const push = useCallback(async () => {
    if (closed.current) return
    const values = latest.current
    if (!hasContent(values)) return

    setStatus('saving')
    try {
      const saved = await api.saveDraft(serviceId, values)
      if (closed.current) return
      setDraftId(saved.id)
      // Only now is the local copy redundant.
      await clearLocalDraft(serviceId).catch(() => undefined)
      setStatus('saved')
    } catch (err) {
      // A 4xx means the server will never take this draft, so stop retrying it;
      // anything else is a connection problem and the local copy carries on.
      if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
        setStatus('unsynced')
        return
      }
      setStatus('unsynced')
    }
  }, [serviceId])

  const record = useCallback(
    (values: Record<string, string>) => {
      if (closed.current) return
      latest.current = values
      if (!hasContent(values)) return

      setStatus('unsynced')
      void saveLocalDraft({ serviceId, formValues: values, savedAt: new Date().toISOString() })
        .catch(() => undefined)

      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => void push(), SAVE_DEBOUNCE_MS)
    },
    [serviceId, push]
  )

  const forget = useCallback(async () => {
    closed.current = true
    if (timer.current) clearTimeout(timer.current)
    await clearLocalDraft(serviceId).catch(() => undefined)
  }, [serviceId])

  const discard = useCallback(async () => {
    await forget()
    if (draftId) await api.discardDraft(draftId).catch(() => undefined)
    setDraftId(null)
    setStatus('clean')
    setRestored(false)
  }, [draftId, forget])

  return { initialValues, ready, status, restored, record, discard, forget, draftId }
}
