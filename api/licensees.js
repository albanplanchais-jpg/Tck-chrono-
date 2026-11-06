/**
 * Fonction Vercel : licenciés tirés du classement descente, pour que l'app fonctionne
 * même quand la synchro de nuit n'a pas encore rempli la base.
 *
 *   GET /api/licensees?nom=…&prenom=…   « Retrouve-toi » : 5 personnes au plus, nom de famille complet exigé
 *   GET /api/licensees?all=1            liste complète (autocomplétion) : coachs validés uniquement
 *
 * Toujours avec « Authorization: Bearer <jeton Supabase> » : jamais de réponse à un inconnu.
 * Les licenciés de la liste d'opposition sont retirés. Données gardées en mémoire 6 h
 * (3 requêtes polies vers le site du classement au plus, par instance).
 * ⚠️ Source : site indépendant classements-descente — à utiliser avec l'accord de son auteur.
 */
import { load } from '../scripts/ffck-sync/sources/classement.mjs'
import { fold } from '../scripts/ffck-sync/lib/normalize.mjs'

const URL_ = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const ANON = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
const TTL = 6 * 3600 * 1000
let cache = { at: 0, list: null, pending: null }

export const compact = (s) => fold(s ?? '').replace(/[^a-z]/g, '')

/** Nom de famille complet + début du prénom, dans n'importe quel ordre, espaces / tirets ignorés. */
export function match(list, nom, prenom, max = 5) {
  const q = compact(`${prenom ?? ''} ${nom ?? ''}`)
  if (q.length < 4) return []
  const out = []
  for (const l of list) {
    const n = compact(l.nom)
    if (n.length < 2 || !q.includes(n)) continue
    const rest = q.replace(n, '')
    if (rest.length >= 2 && compact(l.prenom).startsWith(rest)) out.push(l)
    if (out.length >= max) break
  }
  return out
}

async function licensees() {
  if (cache.list && Date.now() - cache.at < TTL) return cache.list
  if (!cache.pending)
    cache.pending = load()
      .then(({ list }) => { cache = { at: Date.now(), list, pending: null }; return list })
      .catch((e) => { cache.pending = null; if (cache.list) return cache.list; throw e })
  return cache.pending
}

const supa = (path, token, init = {}) =>
  fetch(`${URL_}${path}`, { ...init, headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) } })

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store')
  res.setHeader('X-Robots-Tag', 'noindex, nofollow')
  if (req.method !== 'GET') return res.status(405).json({ error: 'Méthode non permise' })
  if (!URL_ || !ANON) return res.status(500).json({ error: 'Supabase non configuré sur Vercel' })
  const token = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ error: 'Connexion requise' })
  const me = await supa('/auth/v1/user', token).catch(() => null)
  if (!me?.ok) return res.status(401).json({ error: 'Connexion requise' })

  const all = req.query.all === '1'
  if (all) {
    const ok = await supa('/rest/v1/rpc/is_approved_coach', token, { method: 'POST', body: '{}' }).then((r) => r.json()).catch(() => false)
    if (ok !== true) return res.status(403).json({ error: 'Réservé aux coachs validés' })
  } else if (String(req.query.nom ?? '').trim().length < 2 || String(req.query.prenom ?? '').trim().length < 2) {
    return res.status(400).json({ error: 'Indique ton nom de famille complet et au moins 2 lettres du prénom' })
  }

  let list
  try { list = await licensees() } catch (e) { return res.status(502).json({ error: 'Classement injoignable pour le moment' }) }
  const rows = all ? list : match(list, req.query.nom, req.query.prenom)

  // Liste d'opposition (personnes retirées à leur demande).
  const opposed = await supa('/rest/v1/rpc/filter_opposed', token, { method: 'POST', body: JSON.stringify({ p_licences: rows.map((r) => r.licence) }) })
    .then((r) => (r.ok ? r.json() : []))
    .catch(() => [])
  const no = new Set(Array.isArray(opposed) ? opposed : [])
  const out = rows.filter((r) => !no.has(r.licence))
  return res.status(200).json({ source: 'classement', count: out.length, rows: out })
}
