import { politeFetch } from '../lib/http.mjs'
import { parseCsv } from '../lib/csv.mjs'
import { fromTable } from '../lib/normalize.mjs'

/**
 * Export CSV fourni par la FFCK.
 *   FFCK_CSV_URL       adresse de l'export
 *   FFCK_AUTH_HEADER   (secret) en-tête Authorization complet, ex. « Bearer xxx » ou « Basic xxx »
 *   FFCK_ENCODING      « utf-8 » (défaut) ou « windows-1252 » pour les exports Excel
 */
export async function load({ limit } = {}) {
  const url = process.env.FFCK_CSV_URL
  if (!url) throw new Error('FFCK_CSV_URL manquant.')
  const headers = process.env.FFCK_AUTH_HEADER ? { Authorization: process.env.FFCK_AUTH_HEADER } : {}
  const res = await politeFetch(url, { headers })
  const type = res.headers.get('content-type') ?? ''
  if (/text\/html/i.test(type)) throw new Error('La FFCK a renvoyé une page HTML au lieu du CSV (connexion expirée ou adresse modifiée).')
  const buf = Buffer.from(await res.arrayBuffer())
  const text = new TextDecoder(process.env.FFCK_ENCODING || 'utf-8').decode(buf)
  const { header, rows } = parseCsv(text)
  return { ...fromTable(header, limit ? rows.slice(0, limit) : rows), label: 'export CSV FFCK' }
}
