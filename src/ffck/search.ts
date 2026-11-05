/** Recherche instantanée dans les licenciés : sans accents ni casse, tolérante aux petites fautes. */

export interface Licensee {
  licence: string
  nom: string
  prenom: string
  club?: string
  categorie?: string
  embarcation?: string
  active: boolean
}

export const fold = (s: string | undefined) =>
  (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const words = (s: string | undefined) => fold(s).split(' ').filter(Boolean)

/** Mots trop courants dans les noms de clubs pour servir au filtre « Mon club ». */
const CLUB_STOP = new Set(['canoe', 'kayak', 'ck', 'club', 'de', 'du', 'des', 'la', 'le', 'les', 'et', 'nautique', 'asso', 'association', 'cnk', 'cck', 'eaux', 'vives', 'sport', 'sports'])

export const clubKeys = (club: string | undefined) => words(club).filter((w) => !CLUB_STOP.has(w) && w.length > 1)

interface Entry { l: Licensee; name: string[]; club: string[]; clubText: string }

export interface Index { entries: Entry[] }

export function buildIndex(list: Licensee[]): Index {
  return {
    entries: list.map((l) => ({
      l,
      name: [...words(l.nom), ...words(l.prenom)],
      club: words(l.club),
      clubText: fold(l.club)
    }))
  }
}

/**
 * Vrai si a et b diffèrent d'au plus une faute : une lettre changée, ajoutée, retirée,
 * ou deux lettres voisines inversées. Linéaire, sans tableau (rapide sur 50 000 licenciés).
 */
function oneTypo(a: string, b: string): boolean {
  const la = a.length, lb = b.length
  if (Math.abs(la - lb) > 1) return false
  let i = 0
  while (i < la && i < lb && a[i] === b[i]) i++
  if (i === la && i === lb) return true
  if (la === lb) {
    // substitution, ou inversion de deux lettres voisines
    if (a.slice(i + 1) === b.slice(i + 1)) return true
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2)
  }
  // une lettre en plus d'un côté
  return la > lb ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1)
}

/** Score d'un mot de la recherche contre un mot du licencié (0 = pas de correspondance). */
function wordScore(q: string, w: string): number {
  if (w === q) return 4
  if (w.startsWith(q)) return 3
  // Faute de frappe légère : 1 erreur à partir de 4 lettres, sur le début du mot ou le mot entier.
  // (La première lettre doit être juste : c'est rarement là qu'on se trompe, et c'est bien plus rapide.)
  if (q.length < 4 || w[0] !== q[0]) return 0
  const n = q.length
  if (oneTypo(q, w.slice(0, n)) || oneTypo(q, w.slice(0, n + 1)) || oneTypo(q, w.slice(0, n - 1)) || oneTypo(q, w)) return 1
  return 0
}

export interface SearchOptions { myClub?: string; onlyMyClub?: boolean; limit?: number }
export interface Hit { l: Licensee; score: number; mine: boolean }

/** Recherche par nom, prénom ou club. Tous les mots tapés doivent correspondre. */
export function search(index: Index, query: string, { myClub, onlyMyClub = false, limit = 8 }: SearchOptions = {}): Hit[] {
  const q = words(query)
  if (!q.length || (q.length === 1 && q[0].length < 2)) return []
  const keys = clubKeys(myClub)
  const isMine = (e: Entry) => keys.length > 0 && keys.every((k) => e.clubText.includes(k))
  const hits: Hit[] = []
  for (const e of index.entries) {
    const mine = isMine(e)
    if (onlyMyClub && !mine) continue
    let total = 0
    let ok = true
    for (const t of q) {
      let best = 0
      for (const w of e.name) best = Math.max(best, wordScore(t, w))
      if (best < 3) for (const w of e.club) best = Math.max(best, wordScore(t, w) - 1)
      if (!best) { ok = false; break }
      total += best
    }
    if (ok) hits.push({ l: e.l, score: total + (mine ? 2 : 0) + (e.l.active ? 1 : 0), mine })
  }
  return hits
    .sort((a, b) => b.score - a.score || a.l.nom.localeCompare(b.l.nom, 'fr') || a.l.prenom.localeCompare(b.l.prenom, 'fr'))
    .slice(0, limit)
}
