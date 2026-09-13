import type { ServiceCategory, ServiceDefinition } from '../types'

/**
 * Finding a service by what a resident calls it.
 *
 * **This runs on the device, against the cached catalogue.** The catalogue is
 * already held in localStorage so the emergency hotlines work with no signal,
 * and searching it locally comes free with that: results are instant, cost the
 * network nothing, and still work on a phone with one bar outside the municipal
 * hall — which is exactly where someone is standing when they need to know
 * which office they want.
 *
 * Matching is deliberately plain. Every query word must appear somewhere in the
 * service's text, which is predictable in a way fuzzy matching is not: a
 * resident who types more words expects fewer results, and a search that
 * "helpfully" returns a birth certificate for "building permit" teaches people
 * not to trust it.
 */

/**
 * Lowercases, strips accents, and folds punctuation to spaces.
 *
 * The apostrophe matters here: the catalogue writes "mayor’s permit" with a
 * typographic apostrophe and every phone keyboard produces a straight one, so
 * without this the most obvious search for a business permit finds nothing.
 */
export function normalise(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export interface ServiceMatch {
  service: ServiceDefinition
  office: ServiceCategory | undefined
}

/**
 * Services matching every word in the query, best first.
 *
 * Ranked by where the match landed rather than by how many times it occurred: a
 * word in the service's name means the resident has found the thing itself, and
 * that belongs above a service that merely lists it as a requirement.
 */
export function searchServices(
  query: string,
  services: ServiceDefinition[],
  findCategory: (id: string) => ServiceCategory | undefined
): ServiceMatch[] {
  const words = normalise(query).split(' ').filter(Boolean)
  if (words.length === 0) return []

  const scored: Array<{ match: ServiceMatch; score: number }> = []
  for (const service of services) {
    const office = findCategory(service.categoryId)
    const name = normalise(service.name)
    const terms = normalise((service.searchTerms ?? []).join(' '))
    const description = normalise(service.shortDescription)
    const requirements = normalise(service.requirements.join(' '))
    const officeText = normalise(`${office?.name ?? ''} ${office?.officeName ?? ''}`)
    const haystack = `${name} ${terms} ${description} ${requirements} ${officeText}`

    if (!words.every((word) => haystack.includes(word))) continue

    // Highest-value place any query word landed decides the rank.
    let score = 0
    for (const word of words) {
      if (name.includes(word)) score += 8
      else if (terms.includes(word)) score += 6
      else if (description.includes(word)) score += 3
      else if (officeText.includes(word)) score += 2
      else score += 1
    }
    // A whole-phrase hit on the name is somebody typing the thing's actual
    // title; nothing should outrank it.
    if (name.includes(normalise(query))) score += 20
    scored.push({ match: { service, office }, score })
  }

  return scored
    .sort((a, b) => b.score - a.score || a.match.service.name.localeCompare(b.match.service.name))
    .map((s) => s.match)
}
