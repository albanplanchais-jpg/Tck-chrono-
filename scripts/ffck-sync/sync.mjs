#!/usr/bin/env node
/**
 * TCK Chrono — synchronisation quotidienne des licenciés FFCK.
 *
 * Tourne côté serveur (GitHub Actions), JAMAIS dans la PWA. Étapes :
 *   1. récupère les licenciés depuis la source FFCK (exemple / CSV / API) ;
 *   2. ne garde que les champs autorisés et vérifie la structure ;
 *   3. compare avec l'état de la veille (ajouts, modifications, désactivations) ;
 *   4. applique la liste d'opposition (jamais réimportés) ;
 *   5. publie licencies.json.gz + meta.json dans un bucket Supabase PRIVÉ.
 * En cas d'anomalie, la tâche s'arrête avec une erreur claire et ne publie rien :
 * la PWA garde alors la liste précédente.
 *
 * Usage :
 *   node scripts/ffck-sync/sync.mjs --test          10 licenciés, aucune écriture en ligne (dossier out/)
 *   node scripts/ffck-sync/sync.mjs --dry-run       vraie source, calcule le diff, ne publie rien
 *   node scripts/ffck-sync/sync.mjs                 synchro complète (production)
 * Options : --source sample|csv|api   --limit N
 */
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises'
import { diff } from './lib/diff.mjs'
import { FIELDS } from './lib/normalize.mjs'
import * as db from './lib/supabase.mjs'

const args = process.argv.slice(2)
const flag = (n) => args.includes(`--${n}`)
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d)

const TEST = flag('test')
const DRY = TEST || flag('dry-run')
const SOURCE = opt('source', process.env.FFCK_SOURCE || (TEST ? 'sample' : ''))
const LIMIT = Number(opt('limit', TEST ? 10 : 0)) || undefined
/** Baisse maximale tolérée du nombre de licenciés actifs d'un jour à l'autre (au-delà : arrêt). */
const MAX_DROP = Number(process.env.FFCK_MAX_DROP ?? 0.3)
/** Les licenciés inactifs restent dans le fichier ce nombre de jours (historique), puis en sortent. */
const KEEP_INACTIVE_DAYS = Number(process.env.FFCK_KEEP_INACTIVE_DAYS ?? 400)
const OUT = new URL('./out/', import.meta.url)

const log = (...a) => console.log(...a)

/** La tâche planifiée tourne à 2 h et 3 h UTC : seule l'exécution de 4 h (Paris) continue, été comme hiver. */
function rightHour() {
  if (!process.env.FFCK_ONLY_AT_PARIS_HOUR) return true
  const h = Number(new Intl.DateTimeFormat('fr-FR', { hour: 'numeric', hour12: false, timeZone: 'Europe/Paris' }).format(new Date()))
  return h === Number(process.env.FFCK_ONLY_AT_PARIS_HOUR)
}

async function alert(message) {
  const hook = process.env.DISCORD_WEBHOOK_URL
  if (!hook) return
  try {
    await fetch(hook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: `⚠️ **TCK Chrono — synchro FFCK en échec**\n${message}`.slice(0, 1900) })
    })
  } catch {}
}

async function summary(md) {
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, md + '\n')
}

/** État de la veille : table licensees en ligne, ou fichier local en mode test. */
async function loadState() {
  if (TEST) {
    try { return JSON.parse(await readFile(new URL('state.json', OUT), 'utf8')) } catch { return { rows: [], oppositions: [] } }
  }
  const [rows, opp] = await Promise.all([
    db.selectAll('licensees', 'licence,nom,prenom,club,categorie,embarcation,active,first_seen,updated_at,inactive_since'),
    db.selectAll('ffck_oppositions', 'licence')
  ])
  return { rows, oppositions: opp.map((o) => o.licence) }
}

/** Fichier publié : tableau compact (une ligne = un licencié) + version. */
function buildSnapshot(next, now) {
  const cutoff = Date.parse(now) - KEEP_INACTIVE_DAYS * 86400000
  const rows = [...next.values()]
    .filter((r) => r.active || (r.inactive_since && Date.parse(r.inactive_since) >= cutoff))
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr') || a.prenom.localeCompare(b.prenom, 'fr'))
    .map((r) => [...FIELDS.map((f) => r[f] ?? ''), r.active ? 1 : 0])
  const body = JSON.stringify({ version: now, generatedAt: now, fields: [...FIELDS, 'active'], count: rows.length, rows })
  const gz = gzipSync(Buffer.from(body), { level: 9 })
  const meta = {
    version: now,
    generatedAt: now,
    count: rows.length,
    active: rows.filter((r) => r[r.length - 1] === 1).length,
    bytes: gz.length,
    sha256: createHash('sha256').update(gz).digest('hex')
  }
  return { gz, meta, body }
}

async function main() {
  if (!rightHour()) return log('Pas encore 4 h à Paris : exécution ignorée.')
  if (!SOURCE) throw new Error('FFCK_SOURCE non défini (csv ou api) : rien n’est publié.')
  // Les données d'exemple sont fictives : jamais publiées en production.
  if (SOURCE === 'sample' && !DRY && process.env.FFCK_ALLOW_SAMPLE !== '1')
    throw new Error('La source « sample » (fictive) ne peut pas être publiée en production. Utilise --test ou --dry-run.')
  const now = new Date().toISOString()
  log(`▶ Synchro FFCK — source « ${SOURCE} »${LIMIT ? `, limite ${LIMIT}` : ''}${TEST ? ' — MODE TEST (rien n’est publié)' : DRY ? ' — À BLANC (rien n’est publié)' : ''}`)

  // 1-2. Récupération + normalisation
  const source = await import(`./sources/${SOURCE}.mjs`).catch(() => {
    throw new Error(`Source inconnue « ${SOURCE} » (sample, csv ou api).`)
  })
  const { list, invalid, label } = await source.load({ limit: LIMIT })
  log(`  récupérés : ${list.length} (${label})${invalid ? `, lignes inutilisables : ${invalid}` : ''}`)
  if (!list.length) throw new Error('La source n’a renvoyé aucun licencié. Rien n’est publié.')
  if (invalid > Math.max(5, list.length * 0.02))
    throw new Error(`${invalid} lignes inutilisables sur ${list.length + invalid} : structure de la source probablement modifiée. Rien n’est publié.`)

  // 3-4. Comparaison avec la veille
  const state = await loadState()
  const prev = new Map(state.rows.map((r) => [r.licence, r]))
  const oppositions = new Set(state.oppositions)
  const d = diff(prev, list, oppositions, now)
  const prevActive = state.rows.filter((r) => r.active).length
  const nextActive = [...d.next.values()].filter((r) => r.active).length
  log(`  ajoutés : ${d.added.length} · modifiés : ${d.modified.length} · réactivés : ${d.reactivated.length} · désactivés : ${d.deactivated.length} · opposition : ${d.removed.length}`)
  if (!LIMIT && prevActive > 50 && nextActive < prevActive * (1 - MAX_DROP) && process.env.FFCK_ALLOW_DROP !== '1')
    throw new Error(
      `Chute anormale des licenciés actifs : ${prevActive} → ${nextActive} (plus de ${Math.round(MAX_DROP * 100)} %). ` +
        'Source incomplète ? Rien n’est publié. (FFCK_ALLOW_DROP=1 pour forcer après vérification.)'
    )

  // 5. Publication
  const { gz, meta, body } = buildSnapshot(d.next, now)
  log(`  fichier : ${meta.count} licenciés (${meta.active} actifs), ${(meta.bytes / 1024).toFixed(1)} Ko compressé`)
  if (TEST) {
    await mkdir(OUT, { recursive: true })
    await writeFile(new URL('licencies.json.gz', OUT), gz)
    await writeFile(new URL('licencies.preview.json', OUT), JSON.stringify(JSON.parse(body), null, 1))
    await writeFile(new URL('meta.json', OUT), JSON.stringify(meta, null, 2))
    await writeFile(new URL('state.json', OUT), JSON.stringify({ rows: [...d.next.values()], oppositions: [...oppositions] }))
    log(`  ✓ mode test : fichiers écrits dans scripts/ffck-sync/out/ (rien n’a été publié)`)
  } else if (DRY) {
    log('  ✓ à blanc : rien n’a été publié')
  } else {
    if (d.removed.length) await db.remove('licensees', 'licence', d.removed)
    await db.upsert('licensees', d.changed, 'licence')
    await db.uploadObject('ffck', 'licencies.json.gz', gz, 'application/gzip')
    // meta.json en dernier : la PWA ne voit la nouvelle version qu'une fois le fichier complet en place.
    await db.uploadObject('ffck', 'meta.json', JSON.stringify(meta), 'application/json')
    log('  ✓ publié')
  }
  await summary(
    `### Synchro FFCK ${TEST ? '(test)' : DRY ? '(à blanc)' : ''}\n| récupérés | ajoutés | modifiés | réactivés | désactivés | opposition | publiés |\n|---|---|---|---|---|---|---|\n| ${list.length} | ${d.added.length} | ${d.modified.length} | ${d.reactivated.length} | ${d.deactivated.length} | ${d.removed.length} | ${DRY ? 0 : meta.count} |`
  )
}

main().catch(async (e) => {
  console.error(`✗ ${e.message}`)
  await summary(`### ✗ Synchro FFCK en échec\n${e.message}`)
  if (!TEST) await alert(e.message)
  process.exit(1)
})
