/**
 * The local governments this proposal is addressed to.
 *
 * `kind` decides the mayor's title and how the document refers to the place —
 * a city is not a municipality, and addressing a City Mayor as "Municipal
 * Mayor" is the kind of mistake that gets a proposal put down unread.
 *
 * `barangays` is stated only where it has been verified. Malasiqui's 73 are
 * loaded and checked against the municipality's own listing; for the rest the
 * roster is taken from the PSGC listing at setup, and the document says that
 * rather than quoting a number nobody confirmed.
 */
export const LGUS = [
  { slug: 'malasiqui', name: 'Malasiqui',       kind: 'municipality', barangays: 73 },
  { slug: 'san-carlos', name: 'San Carlos City', kind: 'city' },
  { slug: 'bayambang',  name: 'Bayambang',       kind: 'municipality' },
  { slug: 'basista',    name: 'Basista',         kind: 'municipality' },
  { slug: 'calasiao',   name: 'Calasiao',        kind: 'municipality' },
  { slug: 'dagupan',    name: 'Dagupan City',    kind: 'city' },
  { slug: 'rosales',    name: 'Rosales',         kind: 'municipality' },
  { slug: 'sual',       name: 'Sual',            kind: 'municipality' },
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
