import { createHash } from 'node:crypto'
import { politeFetch } from '../lib/http.mjs'
import { fold, fromObjects } from '../lib/normalize.mjs'

/**
 * Source « classement descente » (site indépendant classements-descente.plargentanck.fr).
 * ⚠️ À n'activer en production qu'avec l'ACCORD DE L'AUTEUR DU SITE : ce n'est pas la FFCK.
 *
 *   CLASSEMENT_LIST_URL     liste des classements (défaut : …/ranking/list)
 *   CLASSEMENT_RANKING_URL  athlètes d'un classement, avec {id} (ex. …/ranking/{id}) — à confirmer
 *   CLASSEMENT_MAX          nombre maximal de classements lus par nuit (défaut 80)
 *
 * Le site donne prénom + NOM, club et catégorie (ex. « C1D »), sans numéro de licence :
 * on fabrique alors un identifiant stable « CL-… » à partir du nom, du prénom et du club.
 * Points, rang et nombre de courses sont ignorés (non nécessaires).
 */
const LIST = () => process.env.CLASSEMENT_LIST_URL || 'https://api.classements-descente.plargentanck.fr/ranking/list'

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

export async function load({ limit } = {}) {
  const tpl = process.env.CLASSEMENT_RANKING_URL
  if (!tpl || !tpl.includes('{id}')) throw new Error('CLASSEMENT_RANKING_URL manquant ou sans {id} (adresse des athlètes d’un classement).')
  const listBody = await (await politeFetch(LIST(), { headers: { Accept: 'application/json' } })).json()
  const rankings = findArray(listBody)
  if (!rankings?.length) throw new Error('Liste des classements introuvable dans la réponse (structure modifiée ?).')
  const ids = rankings
    .map((x) => (typeof x === 'object' ? pick(x, ['id', 'ranking', 'rankingid', 'code', 'numero']) : x))
    .filter((x) => x !== undefined && x !== null)
    .slice(0, Number(process.env.CLASSEMENT_MAX ?? 80))
  if (!ids.length) throw new Error('Aucun identifiant de classement trouvé (structure modifiée ?).')

  const rows = []
  for (const id of ids) {
    const body = await (await politeFetch(tpl.replace('{id}', encodeURIComponent(String(id))), { headers: { Accept: 'application/json' } })).json()
    const arr = findArray(body)
    if (!arr) throw new Error(`Classement ${id} : liste des athlètes introuvable (structure modifiée ?).`)
    for (const r of arr) {
      const row = toRow(r)
      if (row) rows.push(row)
    }
    if (limit && rows.length >= limit) break
  }
  // Un même athlète apparaît dans plusieurs classements : la normalisation garde le premier.
  return { ...fromObjects(limit ? rows.slice(0, limit) : rows), label: `classement descente (${ids.length} classements)` }
}
