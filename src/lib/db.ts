import { createStore, get, set, del, keys } from 'idb-keyval'
import type { Application } from '../types'

// Dedicated IndexedDB store for this app (separate DB from idb-keyval's default)
const applicationsStore = createStore('elgu-citizen-portal', 'applications')

const STORE_KEY_PREFIX = 'application:'

export async function saveApplication(app: Application): Promise<void> {
  await set(`${STORE_KEY_PREFIX}${app.id}`, app, applicationsStore)
}

export async function deleteApplication(id: string): Promise<void> {
  await del(`${STORE_KEY_PREFIX}${id}`, applicationsStore)
}

export async function getApplication(id: string): Promise<Application | undefined> {
  return get(`${STORE_KEY_PREFIX}${id}`, applicationsStore)
}

export async function getAllApplications(): Promise<Application[]> {
  const allKeys = await keys(applicationsStore)
  const apps = await Promise.all(
    allKeys
      .filter((k) => typeof k === 'string' && k.startsWith(STORE_KEY_PREFIX))
      .map((k) => get<Application>(k as string, applicationsStore))
  )
  return apps.filter((a): a is Application => Boolean(a)).sort(
    (a, b) => new Date(b.dateSubmitted).getTime() - new Date(a.dateSubmitted).getTime()
  )
}

const DATA_VERSION_KEY = 'schema-version'

// The service catalogue and workflow steps are demo data, so records saved by an
// older build can reference a service or a step index that no longer exists.
// When the version changes, start the on-device store clean instead of trying to
// migrate those records field by field. Anything the viewer drafted is cleared too.
export async function resetIfStale(version: string, seed: Application[]): Promise<void> {
  const storedVersion = await get<string>(DATA_VERSION_KEY, applicationsStore)
  if (storedVersion === version) return

  const allKeys = await keys(applicationsStore)
  await Promise.all(allKeys.map((k) => del(k as string, applicationsStore)))
  await Promise.all(seed.map((app) => saveApplication(app)))
  await set(DATA_VERSION_KEY, version, applicationsStore)
}
