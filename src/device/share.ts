import type { Session } from '../core/model'
import { ranking } from '../core/results'
import { fmtDate, fmtDuration, fmtGap } from '../core/format'
import type { Cell } from './xlsx'

/** Secondes au centième, identique à l'affichage (tronqué). */
const sec = (ms: number) => Math.floor(ms / 10) / 100

/** Texte du classement pour WhatsApp (*gras*, _italique_) : tous les passages et inters de chacun. */
export function resultsText(s: Session): string {
  const lines = ranking(s).map((r) => {
    const who = r.athlete.bib !== undefined ? `${r.athlete.bib} ${r.athlete.name}` : r.athlete.name
    if (!r.rank) return `–  ${who} · pas de temps`
    const gap = r.gap ? `  (${fmtGap(r.gap)})` : ''
    const detail =
      r.runs.length > 1 || r.runs.some((x) => x.splits.length)
        ? r.runs.map((run, i) => {
            const star = r.runs.length > 1 && run.time === r.best ? ' ★' : ''
            const inters = run.splits.length ? ` · ${run.splits.map((x, j) => `int${j + 1} ${fmtDuration(x)}`).join(' · ')}` : ''
            const label = r.runs.length > 1 ? `P${i + 1} ` : ''
            return `\n     ${label}${fmtDuration(run.time)}${star}${inters}`
          }).join('')
        : ''
    return `${r.rank}. *${who}* — ${fmtDuration(r.best!)}${gap}${detail}`
  })
  const head = s.title ? `*${s.title}* · ${fmtDate(s.createdAt)}` : `*TCK Chrono* · ${fmtDate(s.createdAt)}`
  const comment = s.comment ? `\n_${s.comment}_` : ''
  return `${head}${comment}\n\n${lines.join('\n')}`
}

/** Ouvre WhatsApp sans quitter l'app (nouvel onglet ; repli si les fenêtres sont bloquées). */
export function shareWhatsApp(s: Session) {
  const url = `https://wa.me/?text=${encodeURIComponent(resultsText(s))}`
  // Sans « noopener » dans les options : avec, window.open renvoie toujours null.
  const w = window.open(url, '_blank')
  if (w) w.opener = null
  else window.location.href = url
}

/** Écart signé lisible : « — » si nul. */
const gapCell = (ms: number | undefined) => (ms === undefined ? null : ms === 0 ? '—' : `+${fmtDuration(ms, 2)}`)

export function resultsSheets(s: Session) {
  const n = s.splits ?? 0
  const inter = Array.from({ length: n }, (_, i) => `Inter ${i + 1}`)
  const rank = ranking(s)
  const lead = rank[0]?.best
  // Meilleur inter de la séance, pour les écarts aux inters.
  const bestSplit = inter.map((_, j) => {
    const v = rank.flatMap((r) => r.runs.map((x) => x.splits[j])).filter((x): x is number => x !== undefined)
    return v.length ? Math.min(...v) : undefined
  })
  const classement: Cell[][] = [
    ['Rang', 'Dossard', 'Athlète', 'Meilleur temps', 'Écart au 1er', 'Écart (s)', 'Meilleur (s)', 'Passages'],
    ...rank.map((r) => [
      r.rank ?? null,
      r.athlete.bib ?? null,
      r.athlete.name,
      r.best !== undefined ? fmtDuration(r.best, 2) : 'Pas de temps',
      gapCell(r.gap),
      r.gap !== undefined ? sec(r.gap) : null,
      r.best !== undefined ? sec(r.best) : null,
      r.runs.length
    ])
  ]
  const passages: Cell[][] = [[
    'Dossard', 'Athlète', 'Passage',
    ...inter.flatMap((h) => [h, `Écart ${h.toLowerCase()}`]),
    'Temps', 'Temps (s)', 'Écart au 1er', 'Écart à son meilleur', 'Meilleur'
  ]]
  for (const r of rank)
    r.runs.forEach((run, i) =>
      passages.push([
        r.athlete.bib ?? null,
        r.athlete.name,
        i + 1,
        ...inter.flatMap((_, j) => {
          const v = run.splits[j]
          return [v !== undefined ? fmtDuration(v, 2) : null, v !== undefined && bestSplit[j] !== undefined ? gapCell(v - bestSplit[j]!) : null]
        }),
        fmtDuration(run.time, 2),
        sec(run.time),
        lead !== undefined ? gapCell(run.time - lead) : null,
        r.best !== undefined ? gapCell(run.time - r.best) : null,
        run.time === r.best ? 'oui' : null
      ])
    )
  const infos: Cell[][] = [
    ['Séance', s.title ?? 'Séance'],
    ['Date', new Date(s.createdAt).toLocaleString('fr-FR')],
    ['Commentaire', s.comment ?? null],
    ['Athlètes classés', rank.filter((r) => r.rank).length],
    ['Passages', rank.reduce((x, r) => x + r.runs.length, 0)]
  ]
  return [
    { name: 'Classement', rows: classement, widths: [7, 9, 22, 15, 13, 10, 12, 10] },
    { name: 'Passages', rows: passages, widths: [9, 22, 9, ...inter.flatMap(() => [12, 12]), 12, 11, 13, 16, 10] },
    { name: 'Séance', rows: infos, widths: [18, 60] }
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
  const list: Cell[][] = [['Date', 'Heure', 'Séance', 'Commentaire', 'Athlètes', 'Passages', 'Meilleur temps', 'Meilleur athlète']]
  const runs: Cell[][] = [['Date', 'Séance', 'Dossard', 'Athlète', 'Passage', ...inter, 'Temps', 'Temps (s)', 'Écart au 1er', 'Écart à son meilleur', 'Meilleur de la séance']]
  for (const s of [...sessions].sort((a, b) => a.createdAt - b.createdAt)) {
    const rank = ranking(s)
    const title = s.title || `Séance ${hm(s.createdAt)}`
    const top = rank[0]?.best !== undefined ? rank[0] : undefined
    list.push([day(s.createdAt), hm(s.createdAt), title, s.comment ?? null, rank.filter((r) => r.runs.length).length, rank.reduce((n, r) => n + r.runs.length, 0), top ? fmtDuration(top.best!, 2) : null, top?.athlete.name ?? null])
    for (const r of rank)
      r.runs.forEach((run, i) =>
        runs.push([
          day(s.createdAt), title, r.athlete.bib ?? null, r.athlete.name, i + 1,
          ...inter.map((_, j) => (run.splits[j] !== undefined ? fmtDuration(run.splits[j], 2) : null)),
          fmtDuration(run.time, 2), sec(run.time),
          top ? gapCell(run.time - top.best!) : null, r.best !== undefined ? gapCell(run.time - r.best) : null,
          run.time === r.best ? 'oui' : null
        ])
      )
  }
  const d = new Date()
  const name = `chrono-toutes-seances-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.xlsx`
  return shareOrDownload(
    buildXlsx([
      { name: 'Séances', rows: list, widths: [12, 8, 26, 34, 10, 10, 15, 18] },
      { name: 'Passages', rows: runs, widths: [12, 26, 9, 20, 9, ...inter.map(() => 12), 12, 11, 13, 16, 12] }
    ]),
    name,
    'Toutes mes séances TCK Chrono'
  )
}
