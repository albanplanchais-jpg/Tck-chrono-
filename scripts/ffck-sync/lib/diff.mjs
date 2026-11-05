import { FIELDS } from './normalize.mjs'

/**
 * Compare la liste du jour à l'état connu (veille).
 *  - ajoutés, modifiés, réactivés : mis à jour ;
 *  - disparus de la source : marqués inactifs (jamais supprimés : l'historique des séances reste cohérent) ;
 *  - opposition : retirés et jamais réimportés.
 * @param {Map<string, object>} prev  état connu, par licence
 * @param {object[]} today            licenciés de la source
 * @param {Set<string>} oppositions   licences à ne jamais importer
 * @param {string} now                horodatage ISO
 */
export function diff(prev, today, oppositions, now) {
  const next = new Map()
  const added = []
  const modified = []
  const reactivated = []
  const deactivated = []
  const removed = [] // opposition
  for (const l of today) {
    if (oppositions.has(l.licence)) continue
    const old = prev.get(l.licence)
    if (!old) {
      const row = { ...l, active: true, first_seen: now, updated_at: now, inactive_since: null }
      next.set(l.licence, row)
      added.push(row)
      continue
    }
    const changed = FIELDS.some((f) => (old[f] ?? null) !== (l[f] ?? null))
    const row = { ...old, ...l, active: true, inactive_since: null, updated_at: changed || !old.active ? now : old.updated_at }
    next.set(l.licence, row)
    if (!old.active) reactivated.push(row)
    else if (changed) modified.push(row)
  }
  for (const [licence, old] of prev) {
    if (oppositions.has(licence)) { removed.push(licence); continue }
    if (next.has(licence)) continue
    if (old.active) {
      const row = { ...old, active: false, inactive_since: now, updated_at: now }
      next.set(licence, row)
      deactivated.push(row)
    } else next.set(licence, old)
  }
  return { next, added, modified, reactivated, deactivated, removed, changed: [...added, ...modified, ...reactivated, ...deactivated] }
}
