import { createStore, del, get, keys, set } from 'idb-keyval'

// IndexedDB is no longer the source of truth — the API is. What lives here is
// the outbox: requests the resident submitted while offline, held on-device
// until the connection comes back and they can be POSTed for real.
const outboxStore = createStore('elgu-citizen-portal', 'outbox')

const OUTBOX_PREFIX = 'pending:'

export interface PendingSubmission {
  localId: string
  serviceId: string
  serviceName: string
  categoryId: string
  fee: number
  formValues: Record<string, string>
  createdAt: string
}

export async function queueSubmission(item: PendingSubmission): Promise<void> {
  await set(`${OUTBOX_PREFIX}${item.localId}`, item, outboxStore)
}

export async function getOutbox(): Promise<PendingSubmission[]> {
  const allKeys = await keys(outboxStore)
  const items = await Promise.all(
    allKeys
      .filter((k): k is string => typeof k === 'string' && k.startsWith(OUTBOX_PREFIX))
      .map((k) => get<PendingSubmission>(k, outboxStore))
  )
  return items
    .filter((i): i is PendingSubmission => Boolean(i))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export async function removeFromOutbox(localId: string): Promise<void> {
  await del(`${OUTBOX_PREFIX}${localId}`, outboxStore)
}

// Drafts get their own database rather than another store in the outbox's:
// idb-keyval opens a database at version 1 with a single object store, so two
// store names under one database name collide on upgrade.
const draftStore = createStore('elgu-citizen-portal-drafts', 'drafts')

export interface LocalDraft {
  serviceId: string
  formValues: Record<string, string>
  /** When this copy was written on this device. */
  savedAt: string
}

/**
 * The working copy of a form the resident is filling in right now.
 *
 * Written on every keystroke because it is free and local; the server copy is
 * debounced behind it. A local draft that is still here means the server has
 * not confirmed it yet — offline, or the request is still in flight — so it
 * wins over whatever the server last stored.
 */
export async function saveLocalDraft(draft: LocalDraft): Promise<void> {
  await set(draft.serviceId, draft, draftStore)
}

export async function getLocalDraft(serviceId: string): Promise<LocalDraft | undefined> {
  return get<LocalDraft>(serviceId, draftStore)
}

export async function clearLocalDraft(serviceId: string): Promise<void> {
  await del(serviceId, draftStore)
}

export async function getAllLocalDrafts(): Promise<LocalDraft[]> {
  const allKeys = await keys(draftStore)
  const items = await Promise.all(
    allKeys.filter((k): k is string => typeof k === 'string').map((k) => get<LocalDraft>(k, draftStore))
  )
  return items.filter((i): i is LocalDraft => Boolean(i))
}
