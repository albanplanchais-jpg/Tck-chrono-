import { createHash } from 'node:crypto'
import { politeFetch } from '../lib/http.mjs'
import { fold, fromObjects } from '../lib/normalize.mjs'

/**
 * Source « classement descente » (site indépendant classements-descente.plargentanck.fr).
 * ⚠️ À n'activer en production qu'avec l'ACCORD DE L'AUTEUR DU SITE : ce n'est pas la FFCK.
 *
 * API vérifiée le 06/11/2026 (FastAPI, /openapi.json) :
 *   GET /ranking/list                    → [{ code_clt, code_liste, libelle }]  (une entrée par édition du classement)
 *   GET /ranking/{code_liste}?limit&offset → [{ code_bateau, code_epreuve, nom_prenom, club, numero_club, points, rang, nb_courses }]
 * On lit uniquement la DERNIÈRE édition, page par page (500 lignes, pause polie entre requêtes).
 * code_bateau = embarcation + numéro(s) de licence : « C1D423135 » → licence 423135 ;
 * biplace « C2D323482351422 » → 323482 et 351422 (noms et clubs séparés par « / »).
 * Points, rang et nombre de courses sont ignorés (non nécessaires).
 *
 *   CLASSEMENT_API   adresse de base (défaut https://api.classements-descente.plargentanck.fr)
 *   CLASSEMENT_LIST_URL / CLASSEMENT_RANKING_URL (avec {id}) : surcharges facultatives
 */
const API = () => (process.env.CLASSEMENT_API || 'https://api.classements-descente.plargentanck.fr').replace(/\/$/, '')
const LIST = () => process.env.CLASSEMENT_LIST_URL || `${API()}/ranking/list`
const RANKING = () => process.env.CLASSEMENT_RANKING_URL || `${API()}/ranking/{id}`
const PAGE = 500

/** Tableau d'objets, où qu'il soit dans la réponse. */
export function findArray(body) {
  if (Array.isArray(body)) return body
  if (body && typeof body === 'object') {
    for (const k of ['data', 'items', 'results', 'rankings', 'ranking', 'athletes', 'rows', 'list', 'entries'])
      if (Array.isArray(body[k])) return body[k]
    for (const v of Object.values(body)) if (Array.isArray(v) && v.length && typeof v[0] === 'object') return v
  }
  return null
}

const pick = (o, keys) => {
  for (const k of Object.keys(o)) if (keys.includes(fold(k).replace(/ /g, ''))) return o[k]
  return undefined
}

/** « Laura FONTAINE » → { prenom: 'Laura', nom: 'FONTAINE' } (les mots en majuscules forment le nom). */
export function splitName(full) {
  const words = String(full ?? '').trim().split(/\s+/).filter(Boolean)
  const isUpper = (w) => w.length > 1 && w === w.toUpperCase() && /\p{L}/u.test(w)
  const nom = words.filter(isUpper)
  const prenom = words.filter((w) => !isUpper(w))
  if (!nom.length || !prenom.length) return { prenom: words.slice(0, -1).join(' '), nom: words.slice(-1).join(' ') }
  return { prenom: prenom.join(' '), nom: nom.join(' ') }
}

/** « C1D », « K1H », « C2M » → « C1 », « K1 », « C2 ». */
export const boatOf = (cat) => (String(cat ?? '').toUpperCase().match(/\b([KC][1-4])/) ?? [])[1]

const stableId = (nom, prenom, club) =>
  'CL-' + createHash('sha1').update(`${fold(nom)}|${fold(prenom)}|${fold(club)}`).digest('hex').slice(0, 12).toUpperCase()

/** Une ligne de classement → objet avec les champs reconnus par la normalisation. */
export function toRow(r) {
  const full = pick(r, ['prenomsnoms', 'prenomnom', 'nomprenom', 'athlete', 'name', 'fullname', 'competiteur', 'nomcomplet'])
  let nom = pick(r, ['nom', 'lastname', 'surname'])
  let prenom = pick(r, ['prenom', 'prenoms', 'firstname'])
  if ((!nom || !prenom) && full) ({ nom, prenom } = splitName(full))
  const club = pick(r, ['club', 'clubname', 'nomclub', 'structure'])
  const categorie = pick(r, ['categorie', 'category', 'cat'])
  const licence = pick(r, ['licence', 'license', 'numerolicence', 'licensenumber', 'idlicence'])
  if (!nom || !prenom) return null
  return {
    licence: licence ? String(licence) : stableId(nom, prenom, club),
    nom, prenom, club, categorie,
    embarcation: pick(r, ['embarcation', 'bateau', 'boat']) ?? boatOf(categorie)
  }
}

/** Ligne réelle de l'API (code_bateau, nom_prenom…) → 1 ligne, ou 2 pour un biplace. */
export function toRows(r) {
  const code = String(r?.code_bateau ?? '')
  const m = code.match(/^([CK][1-4][A-Z])(\d+)$/)
  if (!m || !r.nom_prenom) return [toRow(r)].filter(Boolean)
  const names = String(r.nom_prenom).split('/').map((x) => x.trim())
  const clubs = String(r.club ?? '').split('/').map((x) => x.trim())
  const digits = m[2]
  const n = names.length
  const lic = n > 1 && digits.length % n === 0
    ? Array.from({ length: n }, (_, i) => digits.slice((digits.length / n) * i, (digits.length / n) * (i + 1)))
    : n === 1 ? [digits] : []
  return names.map((full, i) => {
    const { nom, prenom } = splitName(full)
    if (!nom || !prenom) return null
    const club = clubs[i] ?? clubs[0]
    return { licence: lic[i] ?? stableId(nom, prenom, club), nom, prenom, club, categorie: r.code_epreuve, embarcation: boatOf(r.code_epreuve ?? m[1]) }
  }).filter(Boolean)
}

const getJson = async (url) => (await politeFetch(url, { headers: { Accept: 'application/json' } })).json()

export async function load({ limit } = {}) {
  const lists = findArray(await getJson(LIST()))
  if (!lists?.length) throw new Error('Liste des classements introuvable dans la réponse (structure modifiée ?).')
  const ids = lists
    .map((x) => (typeof x === 'object' ? pick(x, ['codeliste', 'id', 'rankingid', 'code', 'numero']) : x))
    .filter((x) => x !== undefined && x !== null)
  if (!ids.length) throw new Error('Aucun identifiant de classement trouvé (structure modifiée ?).')
  // Dernière édition : le plus grand code_liste.
  const latest = ids.reduce((a, b) => (Number(b) > Number(a) ? b : a))
  const label = lists.find((x) => typeof x === 'object' && pick(x, ['codeliste', 'id']) === latest)?.libelle

  const rows = []
  for (let offset = 0, pages = 0; pages < 40; pages++, offset += PAGE) {
    const url = new URL(RANKING().replace('{id}', encodeURIComponent(String(latest))))
    url.searchParams.set('limit', String(PAGE))
    url.searchParams.set('offset', String(offset))
    const arr = findArray(await getJson(url.toString()))
    if (!arr) throw new Error(`Classement ${latest} : liste des athlètes introuvable (structure modifiée ?).`)
    for (const r of arr) rows.push(...toRows(r))
    if (arr.length < PAGE || (limit && rows.length >= limit)) break
  }
  if (!rows.length) throw new Error(`Classement ${latest} vide : rien n'est publié.`)
  // Un même athlète apparaît dans plusieurs épreuves : la normalisation garde la première ligne.
  return { ...fromObjects(limit ? rows.slice(0, limit) : rows), label: `classement descente ${latest}${label ? ` (${String(label).replace(/\s*:\s*$/, '')})` : ''}` }
}
