/**
 * Requêtes polies vers la FFCK : User-Agent identifiable avec contact, pause entre requêtes,
 * nouvel essai avec attente croissante (backoff exponentiel) sur 429 et 5xx, délai maximal.
 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let last = 0

export function userAgent() {
  const contact = process.env.FFCK_CONTACT || 'contact non renseigné'
  return `TCK Chrono (synchro licenciés ; contact : ${contact})`
}

export async function politeFetch(url, init = {}, { pauseMs = 1500, tries = 5, timeoutMs = 60000 } = {}) {
  for (let attempt = 1; ; attempt++) {
    const wait = last + pauseMs - Date.now()
    if (wait > 0) await sleep(wait)
    last = Date.now()
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), timeoutMs)
    let res
    try {
      res = await fetch(url, { ...init, headers: { 'User-Agent': userAgent(), ...(init.headers ?? {}) }, signal: ctrl.signal })
    } catch (e) {
      res = null
      if (attempt >= tries) throw new Error(`Réseau : ${url} injoignable (${e.message})`)
    } finally {
      clearTimeout(t)
    }
    if (res && res.ok) return res
    const status = res?.status ?? 0
    const retryable = !res || status === 429 || status >= 500
    if (!retryable || attempt >= tries) throw new Error(`HTTP ${status} sur ${url}${retryable ? ` après ${tries} essais` : ''}`)
    const after = Number(res?.headers.get('retry-after'))
    const delay = Number.isFinite(after) && after > 0 ? after * 1000 : Math.min(60000, 2000 * 2 ** (attempt - 1))
    console.warn(`  ↻ HTTP ${status || 'réseau'} — nouvel essai dans ${Math.round(delay / 1000)} s (${attempt}/${tries})`)
    await sleep(delay)
  }
}
