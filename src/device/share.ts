import type { Session } from '../core/model'
import { ranking } from '../core/results'
import { fmtDate, fmtDuration, fmtGap } from '../core/format'

export function resultsText(s: Session): string {
  const lines = ranking(s).map((r) =>
    r.rank ? `${r.rank}. ${r.athlete.name} — ${fmtDuration(r.best!)} ${r.gap ? `(${fmtGap(r.gap)})` : ''}`.trim() : `–  ${r.athlete.name} — pas de temps`
  )
  return `TCK Chrono · ${fmtDate(s.createdAt)}\n\n${lines.join('\n')}`
}

export function resultsCsv(s: Session): string {
  const n = s.splits ?? 0
  const inter = Array.from({ length: n }, (_, i) => `Inter ${i + 1}`)
  const rows = [['Rang', 'Athlète', 'Passage', ...inter, 'Temps', 'Temps (ms)', 'Meilleur']]
  for (const r of ranking(s)) {
    if (!r.runs.length) rows.push(['', r.athlete.name, '', ...inter.map(() => ''), '', '', ''])
    r.runs.forEach((run, i) =>
      rows.push([String(r.rank ?? ''), r.athlete.name, String(i + 1), ...inter.map((_, j) => (run.splits[j] !== undefined ? fmtDuration(run.splits[j]) : '')), fmtDuration(run.time), String(Math.round(run.time)), run.time === r.best ? 'oui' : ''])
    )
  }
  return rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(';')).join('\n')
}

export async function shareResults(s: Session): Promise<'shared' | 'copied' | 'failed'> {
  const text = resultsText(s)
  const file = new File(['﻿' + resultsCsv(s)], `chrono-${new Date(s.createdAt).toISOString().slice(0, 10)}.csv`, { type: 'text/csv' })
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ text, files: [file] })
      return 'shared'
    }
    if (navigator.share) {
      await navigator.share({ text })
      return 'shared'
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') return 'shared'
  }
  try {
    await navigator.clipboard.writeText(text)
    return 'copied'
  } catch {
    return 'failed'
  }
}
