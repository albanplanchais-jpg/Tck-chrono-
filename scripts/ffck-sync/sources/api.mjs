import { politeFetch } from '../lib/http.mjs'
import { fromObjects } from '../lib/normalize.mjs'

/**
 * API JSON paginée fournie par la FFCK.
 *   FFCK_API_URL     adresse avec {page} (ex. https://…/licencies?page={page}&per_page=500)
 *   FFCK_API_TOKEN   (secret) jeton, envoyé en « Authorization: Bearer … »
 * Réponse attendue : un tableau, ou un objet avec « data » / « items » / « results ».
 * Pause de 1,5 s entre deux pages, arrêt à la première page vide.
 */
export async function load({ limit } = {}) {
  const tpl = process.env.FFCK_API_URL
  if (!tpl || !tpl.includes('{page}')) throw new Error('FFCK_API_URL manquant ou sans {page}.')
  const headers = { Accept: 'application/json', ...(process.env.FFCK_API_TOKEN ? { Authorization: `Bearer ${process.env.FFCK_API_TOKEN}` } : {}) }
  const all = []
  for (let page = 1; page <= 10000; page++) {
    const res = await politeFetch(tpl.replace('{page}', String(page)), { headers })
    const body = await res.json().catch(() => {
      throw new Error(`Page ${page} : la réponse n'est pas du JSON (structure de l'API modifiée ?).`)
    })
    const items = Array.isArray(body) ? body : body.data ?? body.items ?? body.results
    if (!Array.isArray(items)) throw new Error(`Page ${page} : liste de licenciés introuvable dans la réponse (structure modifiée).`)
    if (!items.length) break
    all.push(...items)
    if (limit && all.length >= limit) break
  }
  return { ...fromObjects(limit ? all.slice(0, limit) : all), label: 'API FFCK' }
}
