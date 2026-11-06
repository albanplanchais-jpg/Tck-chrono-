import { useCallback, useEffect, useMemo, useState } from 'preact/hooks'
import { get, set } from 'idb-keyval'
import { gunzipSync, strFromU8 } from 'fflate'
import { supabase } from '../cloud/supabase'
import { accessToken } from '../cloud/links'
import { buildIndex, type Licensee } from './search'

/**
 * Liste des licenciés FFCK sur le téléphone (IndexedDB).
 * Au lancement : on lit la copie locale tout de suite (hors ligne compris), puis on regarde
 * meta.json en ligne ; si une version plus récente existe, on télécharge le fichier,
 * on le vérifie, et seulement alors on remplace la copie locale.
 */
const KEY = 'ffck-licencies'

interface Stored { version: string; count: number; rows: Licensee[]; checkedAt: number }
interface Meta { version: string; count: number; active: number; bytes: number; sha256: string }
interface File { version: string; fields: string[]; count: number; rows: (string | number)[][] }

export type FfckStatus = 'idle' | 'checking' | 'downloading' | 'ok' | 'offline' | 'forbidden' | 'missing' | 'error'

async function sha256(bytes: Uint8Array) {
  const h = await crypto.subtle.digest('SHA-256', bytes as BufferSource)
  return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Fichier publié → licenciés. Lève une erreur si la structure est inattendue. */
export function parseFile(f: File): Licensee[] {
  const need = ['licence', 'nom', 'prenom', 'club', 'categorie', 'embarcation', 'active']
  if (!Array.isArray(f.rows) || !need.every((k) => f.fields?.includes(k))) throw new Error('Fichier des licenciés invalide')
  const at = Object.fromEntries(f.fields.map((k, i) => [k, i]))
  return f.rows.map((r) => ({
    licence: String(r[at.licence]),
    nom: String(r[at.nom]),
    prenom: String(r[at.prenom]),
    club: (r[at.club] as string) || undefined,
    categorie: (r[at.categorie] as string) || undefined,
    embarcation: (r[at.embarcation] as string) || undefined,
    active: r[at.active] === 1
  }))
}

export async function loadLocal(): Promise<Stored | undefined> {
  try { return await get<Stored>(KEY) } catch { return undefined }
}

/**
 * Secours : liste tirée du classement en direct (fonction Vercel /api/licensees), quand le fichier
 * de nuit n'est pas encore publié. Réservé aux coachs validés (vérifié côté serveur). Gardée 1 jour.
 */
async function fromApi(current: Stored | undefined, onStatus?: (s: FfckStatus) => void): Promise<Stored | undefined> {
  const today = new Date().toISOString().slice(0, 10)
  if (current?.version === `api-${today}`) return onStatus?.('ok'), current
  const token = await accessToken()
  if (!token) return current
  try {
    onStatus?.('downloading')
    const r = await fetch('/api/licensees?all=1', { headers: { Authorization: `Bearer ${token}` } })
    if (r.status === 403) return onStatus?.('forbidden'), current
    if (!r.ok || !/json/.test(r.headers.get('content-type') ?? '')) return onStatus?.('missing'), current
    const body = await r.json()
    const rows: Licensee[] = (Array.isArray(body?.rows) ? body.rows : []).map((x: any) => ({
      licence: String(x.licence), nom: String(x.nom), prenom: String(x.prenom),
      club: x.club || undefined, categorie: x.categorie || undefined, embarcation: x.embarcation || undefined, active: true
    }))
    if (!rows.length) return onStatus?.('missing'), current
    const stored: Stored = { version: `api-${today}`, count: rows.length, rows, checkedAt: Date.now() }
    await set(KEY, stored).catch(() => {})
    onStatus?.('ok')
    return stored
  } catch {
    onStatus?.('error')
    return current
  }
}

/** Vérifie en ligne et met à jour si besoin. Ne remplace jamais la copie locale par un fichier douteux. */
export async function checkForUpdate(current?: Stored, onStatus?: (s: FfckStatus) => void): Promise<Stored | undefined> {
  if (!supabase) return current
  if (!navigator.onLine) return onStatus?.('offline'), current
  onStatus?.('checking')
  const metaRes = await supabase.storage.from('ffck').download('meta.json')
  if (metaRes.error) {
    // 400/403 : compte non validé comme coach ; 404 : pas encore de fichier publié.
    const m = `${(metaRes.error as any).statusCode ?? ''} ${metaRes.error.message}`
    const st: FfckStatus = /not.?found|404/i.test(m) ? 'missing' : /403|400|unauthori|denied|policy/i.test(m) ? 'forbidden' : 'error'
    onStatus?.(st)
    // Pas encore de fichier publié (ou erreur) : liste du classement en direct.
    if (st !== 'forbidden') return fromApi(current, onStatus)
    return current
  }
  const meta = JSON.parse(await metaRes.data.text()) as Meta
  if (current && current.version >= meta.version) {
    const fresh = { ...current, checkedAt: Date.now() }
    await set(KEY, fresh).catch(() => {})
    onStatus?.('ok')
    return fresh
  }
  onStatus?.('downloading')
  const fileRes = await supabase.storage.from('ffck').download('licencies.json.gz')
  if (fileRes.error) return onStatus?.('error'), current
  const gz = new Uint8Array(await fileRes.data.arrayBuffer())
  if ((await sha256(gz)) !== meta.sha256) return onStatus?.('error'), current // fichier incomplet ou corrompu
  const file = JSON.parse(strFromU8(gunzipSync(gz))) as File
  const rows = parseFile(file)
  if (!rows.length) return onStatus?.('error'), current
  const stored: Stored = { version: file.version, count: rows.length, rows, checkedAt: Date.now() }
  await set(KEY, stored)
  onStatus?.('ok')
  return stored
}

/** Licenciés pour l'écran de séance : copie locale immédiate, mise à jour en arrière-plan. */
export function useLicensees(enabled: boolean) {
  const [data, setData] = useState<Stored | undefined>()
  const [status, setStatus] = useState<FfckStatus>('idle')

  const refresh = useCallback(async () => {
    const local = await loadLocal()
    if (local) setData(local)
    if (!enabled) return
    try {
      const next = await checkForUpdate(local, setStatus)
      if (next && next !== local) setData(next)
    } catch {
      setStatus('error')
    }
  }, [enabled])

  useEffect(() => { refresh() }, [refresh])
  const index = useMemo(() => (data ? buildIndex(data.rows) : undefined), [data])
  return { list: data?.rows, version: data?.version, count: data?.count, index, status, refresh }
}
