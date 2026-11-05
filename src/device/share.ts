import type { Session } from '../core/model'
import { ranking } from '../core/results'
import { fmtDate, fmtDuration, fmtGap } from '../core/format'
import type { Cell } from './xlsx'

/** Secondes au centième, identique à l'affichage (tronqué). */
const sec = (ms: number) => Math.floor(ms / 10) / 100

/** Texte du classement, formaté pour WhatsApp (*gras*). */
export function resultsText(s: Session): string {
  const lines = ranking(s).map((r) => {
    const who = r.athlete.bib !== undefined ? `${r.athlete.bib} ${r.athlete.name}` : r.athlete.name
    if (!r.rank) return `–  ${who} · pas de temps`
    const gap = r.gap ? `  (${fmtGap(r.gap)})` : ''
    const best = r.runs.find((x) => x.time === r.best)
    const inters = best?.splits.length ? `\n     ${best.splits.map((x, i) => `int${i + 1} ${fmtDuration(x)}`).join(' · ')}` : ''
    return `${r.rank}. *${who}* — ${fmtDuration(r.best!)}${gap}${inters}`
  })
  return `*TCK Chrono* · ${fmtDate(s.createdAt)}\n\n${lines.join('\n')}`
}

export function shareWhatsApp(s: Session) {
  window.location.href = `https://wa.me/?text=${encodeURIComponent(resultsText(s))}`
}

export function resultsSheets(s: Session) {
  const n = s.splits ?? 0
  const inter = Array.from({ length: n }, (_, i) => `Inter ${i + 1}`)
  const rank = ranking(s)
  const classement: Cell[][] = [
    ['Rang', 'Dossard', 'Athlète', 'Meilleur temps', 'Écart', 'Meilleur (s)', 'Passages'],
    ...rank.map((r) => [
      r.rank ?? null,
      r.athlete.bib ?? null,
      r.athlete.name,
      r.best !== undefined ? fmtDuration(r.best) : 'Pas de temps',
      r.gap ? fmtGap(r.gap) : null,
      r.best !== undefined ? sec(r.best) : null,
      r.runs.length
    ])
  ]
  const passages: Cell[][] = [['Dossard', 'Athlète', 'Passage', ...inter, 'Temps', 'Temps (s)', 'Meilleur']]
  for (const r of rank)
    r.runs.forEach((run, i) =>
      passages.push([
        r.athlete.bib ?? null,
        r.athlete.name,
        i + 1,
        ...inter.map((_, j) => (run.splits[j] !== undefined ? fmtDuration(run.splits[j]) : null)),
        fmtDuration(run.time),
        sec(run.time),
        run.time === r.best ? 'oui' : null
      ])
    )
  return [
    { name: 'Classement', rows: classement, widths: [7, 9, 22, 15, 12, 13, 10] },
    { name: 'Passages', rows: passages, widths: [9, 22, 9, ...inter.map(() => 12), 12, 11, 10] }
  ]
}

const fileName = (s: Session) => {
  const d = new Date(s.createdAt)
  const p = (x: number) => String(x).padStart(2, '0')
  return `chrono-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}h${p(d.getMinutes())}.xlsx`
}

async function shareOrDownload(bytes: Uint8Array, name: string, title: string): Promise<'shared' | 'downloaded'> {
  const type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  const file = new File([bytes as BlobPart], name, { type })
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title })
      return 'shared'
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') return 'shared'
  }
  const url = URL.createObjectURL(file)
  const a = Object.assign(document.createElement('a'), { href: url, download: file.name })
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
  return 'downloaded'
}

/** Fichier Excel : partage (WhatsApp, mail, Fichiers…) sur téléphone, sinon téléchargement. */
export async function exportXlsx(s: Session): Promise<'shared' | 'downloaded'> {
  const { buildXlsx } = await import('./xlsx')
  return shareOrDownload(buildXlsx(resultsSheets(s)), fileName(s), 'Résultats TCK Chrono')
}

/** Toutes les séances du coach dans un seul classeur. */
export async function exportAllXlsx(sessions: Session[]): Promise<'shared' | 'downloaded'> {
  const { buildXlsx } = await import('./xlsx')
  const maxSplits = Math.max(0, ...sessions.map((s) => s.splits ?? 0))
  const inter = Array.from({ length: maxSplits }, (_, i) => `Inter ${i + 1}`)
  const day = (t: number) => new Date(t).toLocaleDateString('fr-FR')
  const hm = (t: number) => new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  const list: Cell[][] = [['Date', 'Heure', 'Séance', 'Athlètes', 'Passages', 'Meilleur temps', 'Meilleur athlète']]
  const runs: Cell[][] = [['Date', 'Séance', 'Dossard', 'Athlète', 'Passage', ...inter, 'Temps', 'Temps (s)', 'Meilleur de la séance']]
  for (const s of [...sessions].sort((a, b) => a.createdAt - b.createdAt)) {
    const rank = ranking(s)
    const title = s.title || `Séance ${hm(s.createdAt)}`
    const top = rank[0]?.best !== undefined ? rank[0] : undefined
    list.push([day(s.createdAt), hm(s.createdAt), title, rank.filter((r) => r.runs.length).length, rank.reduce((n, r) => n + r.runs.length, 0), top ? fmtDuration(top.best!, 2) : null, top?.athlete.name ?? null])
    for (const r of rank)
      r.runs.forEach((run, i) =>
        runs.push([
          day(s.createdAt), title, r.athlete.bib ?? null, r.athlete.name, i + 1,
          ...inter.map((_, j) => (run.splits[j] !== undefined ? fmtDuration(run.splits[j], 2) : null)),
          fmtDuration(run.time, 2), sec(run.time), run.time === r.best ? 'oui' : null
        ])
      )
  }
  const d = new Date()
  const name = `chrono-toutes-seances-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.xlsx`
  return shareOrDownload(
    buildXlsx([
      { name: 'Séances', rows: list, widths: [12, 8, 26, 10, 10, 15, 18] },
      { name: 'Passages', rows: runs, widths: [12, 26, 9, 20, 9, ...inter.map(() => 12), 12, 11, 12] }
    ]),
    name,
    'Toutes mes séances TCK Chrono'
  )
}
