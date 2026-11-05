import { readFile } from 'node:fs/promises'
import { parseCsv } from '../lib/csv.mjs'
import { fromTable } from '../lib/normalize.mjs'

/** Source d'exemple : données FICTIVES, pour tester sans accès FFCK. */
export async function load({ limit } = {}) {
  const text = await readFile(new URL('../fixtures/licencies-exemple.csv', import.meta.url), 'utf8')
  const { header, rows } = parseCsv(text)
  return { ...fromTable(header, limit ? rows.slice(0, limit) : rows), label: 'fichier d’exemple (fictif)' }
}
