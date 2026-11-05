/**
 * Normalisation des licenciés : on ne garde QUE les champs prévus par l'accord FFCK
 * (n° de licence, nom, prénom, club, catégorie d'âge, embarcation/discipline).
 * Toute autre colonne de la source (adresse, téléphone, e-mail, date de naissance…) est ignorée.
 */

/** Champs conservés, dans l'ordre du fichier publié. */
export const FIELDS = ['licence', 'nom', 'prenom', 'club', 'categorie', 'embarcation']
/** Champs sans lesquels la source est considérée comme cassée. */
export const REQUIRED = ['licence', 'nom', 'prenom', 'club']

/** Noms de colonnes acceptés pour chaque champ (comparés sans accents ni casse). */
const ALIASES = {
  licence: ['licence', 'n licence', 'no licence', 'numero licence', 'numero de licence', 'num licence', 'license', 'license number', 'id licence', 'code adherent'],
  nom: ['nom', 'nom de famille', 'last name', 'lastname', 'surname'],
  prenom: ['prenom', 'first name', 'firstname'],
  club: ['club', 'nom club', 'nom du club', 'structure', 'association'],
  categorie: ['categorie', 'categorie d age', 'cat', 'categorie age', 'age category'],
  embarcation: ['embarcation', 'discipline', 'bateau', 'activite', 'specialite']
}

export const fold = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** Associe chaque champ à l'index de colonne de la source. Lève une erreur claire si un champ requis manque. */
export function mapColumns(header) {
  const folded = header.map(fold)
  const map = {}
  for (const f of FIELDS) {
    const i = folded.findIndex((h) => ALIASES[f].includes(h))
    if (i >= 0) map[f] = i
  }
  const missing = REQUIRED.filter((f) => map[f] === undefined)
  if (missing.length)
    throw new Error(
      `Structure de la source inattendue : colonne(s) introuvable(s) ${missing.join(', ')}. ` +
        `Colonnes reçues : ${header.join(' | ')}. Rien n'est publié.`
    )
  return map
}

const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim()
/** « DUPONT » / « dupont » → « Dupont », « jean-marie » → « Jean-Marie ». */
const nice = (v) => clean(v).toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase())

/** Une ligne brute → licencié normalisé, ou null si inutilisable. */
export function toLicensee(get) {
  const licence = clean(get('licence')).replace(/\s/g, '')
  const nom = clean(get('nom'))
  const prenom = clean(get('prenom'))
  if (!/^[A-Za-z0-9-]{3,20}$/.test(licence) || !nom || !prenom) return null
  return {
    licence,
    nom: nom.toUpperCase(),
    prenom: nice(prenom),
    club: clean(get('club')) || null,
    categorie: clean(get('categorie')) || null,
    embarcation: clean(get('embarcation')) || null
  }
}

/** Tableau de lignes CSV → licenciés ({ list, invalid }). Doublons de licence : on garde le premier. */
export function fromTable(header, rows) {
  const map = mapColumns(header)
  const seen = new Set()
  const list = []
  let invalid = 0
  for (const r of rows) {
    const l = toLicensee((f) => (map[f] === undefined ? '' : r[map[f]]))
    if (!l) { invalid++; continue }
    if (seen.has(l.licence)) continue
    seen.add(l.licence)
    list.push(l)
  }
  return { list, invalid }
}

/** Objets JSON (API) → licenciés, avec les mêmes alias de champs. */
export function fromObjects(objs) {
  const header = [...new Set(objs.flatMap((o) => Object.keys(o)))]
  return fromTable(header, objs.map((o) => header.map((h) => o[h])))
}
