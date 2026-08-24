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
