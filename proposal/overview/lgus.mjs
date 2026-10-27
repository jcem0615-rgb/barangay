/**
 * The local governments this proposal is addressed to.
 *
 * `kind` decides the mayor's title and how the document refers to the place —
 * a city is not a municipality, and addressing a City Mayor as "Municipal
 * Mayor" is the kind of mistake that gets a proposal put down unread.
 *
 * `province` is a field rather than a constant: Bauang is in La Union, and a
 * letter that puts a town in the wrong province is the first thing its reader
 * notices.
 *
 * `mayor` is the incumbent's name where it is known. Given, it is printed and
 * the salutation uses the surname; absent, the line stays a ruled blank to be
 * filled in by hand. Never guessed — naming the wrong person as mayor is worse
 * than leaving the line empty.
 *
 * `barangays` is stated only where it has been verified. Malasiqui's 73 are
 * loaded and checked against the municipality's own listing; for the rest the
 * roster is taken from the PSGC listing at setup, and the document says that
 * rather than quoting a number nobody confirmed.
 */
export const LGUS = [
  { slug: 'malasiqui',  name: 'Malasiqui',       kind: 'municipality', province: 'Pangasinan', barangays: 73 },
  { slug: 'san-carlos', name: 'San Carlos City', kind: 'city',         province: 'Pangasinan' },
  { slug: 'bayambang',  name: 'Bayambang',       kind: 'municipality', province: 'Pangasinan' },
  { slug: 'basista',    name: 'Basista',         kind: 'municipality', province: 'Pangasinan' },
  { slug: 'calasiao',   name: 'Calasiao',        kind: 'municipality', province: 'Pangasinan' },
  { slug: 'dagupan',    name: 'Dagupan City',    kind: 'city',         province: 'Pangasinan' },
  { slug: 'rosales',    name: 'Rosales',         kind: 'municipality', province: 'Pangasinan' },
  { slug: 'sual',       name: 'Sual',            kind: 'municipality', province: 'Pangasinan',
    mayor: 'Liseldo D.Q. Calugay' },
  { slug: 'labrador',   name: 'Labrador',        kind: 'municipality', province: 'Pangasinan' },
  { slug: 'bauang',     name: 'Bauang',          kind: 'municipality', province: 'La Union',
    mayor: 'Ma. Clarissa T. Lee' },
]

export const FIRM = {
  name: 'FMCM IT SOLUTIONS',
  people: [
    { name: 'John Carlo E. Morales', title: 'Executive Director', phone: '0992 397 8537', email: 'jcem0615@gmail.com' },
    { name: 'Mark Lester Macaranas', title: 'Executive Director', phone: '0939 137 4106', email: 'lester477@gmail.com' },
  ],
}

export const titleFor = (l) => (l.kind === 'city' ? 'City Mayor' : 'Municipal Mayor')
export const placeFor = (l) => (l.kind === 'city' ? 'city' : 'municipality')

/** The surname a salutation uses. Last word unless the row says otherwise. */
export const surnameOf = (l) => l.surname ?? (l.mayor ? l.mayor.trim().split(/\s+/).at(-1) : null)
