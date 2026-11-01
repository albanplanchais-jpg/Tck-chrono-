import type { Session } from '../core/model'
import { ranking } from '../core/results'
import { fmtDate, fmtDuration, fmtGap } from '../core/format'
import type { Cell } from './xlsx'

/** Secondes au centième, identique à l'affichage (tronqué). */
const sec = (ms: number) => Math.floor(ms / 10) / 100

/** Texte du classement, formaté pour WhatsApp (*gras*). */
export function resultsText(s: Session): string {
  const lines = ranking(s).map((r) => {
    if (!r.rank) return `–  ${r.athlete.name} · pas de temps`
    const gap = r.gap ? `  (${fmtGap(r.gap)})` : ''
    const best = r.runs.find((x) => x.time === r.best)
    const inters = best?.splits.length ? `\n     ${best.splits.map((x, i) => `int${i + 1} ${fmtDuration(x)}`).join(' · ')}` : ''
    return `${r.rank}. *${r.athlete.name}* — ${fmtDuration(r.best!)}${gap}${inters}`
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
    ['Rang', 'Athlète', 'Meilleur temps', 'Écart', 'Meilleur (s)', 'Passages'],
    ...rank.map((r) => [
      r.rank ?? null,
      r.athlete.name,
      r.best !== undefined ? fmtDuration(r.best) : 'Pas de temps',
      r.gap ? fmtGap(r.gap) : null,
      r.best !== undefined ? sec(r.best) : null,
      r.runs.length
    ])
  ]
  const passages: Cell[][] = [['Athlète', 'Passage', ...inter, 'Temps', 'Temps (s)', 'Meilleur']]
  for (const r of rank)
    r.runs.forEach((run, i) =>
      passages.push([
        r.athlete.name,
        i + 1,
        ...inter.map((_, j) => (run.splits[j] !== undefined ? fmtDuration(run.splits[j]) : null)),
        fmtDuration(run.time),
        sec(run.time),
        run.time === r.best ? 'oui' : null
      ])
    )
  return [
    { name: 'Classement', rows: classement, widths: [7, 22, 15, 12, 13, 10] },
    { name: 'Passages', rows: passages, widths: [22, 9, ...inter.map(() => 12), 12, 11, 10] }
  ]
}

const fileName = (s: Session) => {
  const d = new Date(s.createdAt)
  const p = (x: number) => String(x).padStart(2, '0')
  return `chrono-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}h${p(d.getMinutes())}.xlsx`
}

/** Fichier Excel : partage (WhatsApp, mail, Fichiers…) sur téléphone, sinon téléchargement. */
export async function exportXlsx(s: Session): Promise<'shared' | 'downloaded'> {
  const { buildXlsx } = await import('./xlsx')
  const bytes = buildXlsx(resultsSheets(s))
  const type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  const file = new File([bytes as BlobPart], fileName(s), { type })
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Résultats TCK Chrono' })
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
