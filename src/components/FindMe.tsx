import { useState } from 'preact/hooks'
import { frError } from '../cloud/supabase'
import { claimLicence, claimLicenceListed, findLicensee, findLicenseeApi, type FoundLicensee } from '../cloud/links'

/** « Retrouve-toi » : l'athlète tape son nom et son prénom, choisit sa ligne, et son compte est relié à sa licence. */
export function FindMe({ defaultName, onLinked }: { defaultName?: string | null; onLinked: (msg: string) => void }) {
  // Prénom = premier mot, nom = le reste (« Loig Le Guennec » → Loig / Le Guennec).
  const parts = (defaultName ?? '').trim().split(/\s+/).filter(Boolean)
  const [prenom, setPrenom] = useState(parts.length > 1 ? parts[0] : '')
  const [nom, setNom] = useState(parts.length > 1 ? parts.slice(1).join(' ') : '')
  const [found, setFound] = useState<(FoundLicensee & { api?: boolean })[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [manual, setManual] = useState(false)
  const [licence, setLicence] = useState('')

  const search = async (e: Event) => {
    e.preventDefault()
    setBusy(true); setErr(''); setFound(null)
    // 1. Base (synchro de nuit) ; 2. sinon, classement en direct via la fonction Vercel.
    let rows: (FoundLicensee & { api?: boolean })[] = []
    let failed: unknown = null
    try { rows = await findLicensee(nom, prenom) } catch (x) { failed = x }
    if (!rows.length) {
      const api = await findLicenseeApi(nom, prenom)
      rows = api.map((l) => ({ ...l, api: true }))
    }
    if (!rows.length && failed && !/introuvable|Indique/i.test(String((failed as any)?.message))) setErr(frError(failed as any))
    setFound(rows)
    setBusy(false)
  }
  const claim = async (lic: string, n: string, listed?: FoundLicensee) => {
    setBusy(true); setErr('')
    try {
      const l = (listed ? await claimLicenceListed(listed) : await claimLicence(lic, n))[0]
      onLinked(`Compte relié à ${l.prenom} ${l.nom}${l.club ? ` (${l.club})` : ''}.`)
    } catch (x) { setErr(frError(x as any)) }
    setBusy(false)
  }

  return (
    <div class="findme">
      <form class="login-form" onSubmit={search}>
        <div class="row2">
          <label>
            <span class="label">Prénom</span>
            <input value={prenom} onInput={(e) => setPrenom((e.target as HTMLInputElement).value)} autocomplete="given-name" autocapitalize="words" required />
          </label>
          <label>
            <span class="label">Nom de famille</span>
            <input value={nom} onInput={(e) => setNom((e.target as HTMLInputElement).value)} autocomplete="family-name" autocapitalize="characters" required />
          </label>
        </div>
        <button class="btn primary" type="submit" disabled={busy}>Me chercher</button>
      </form>

      {found && !found.length && (
        <p class="muted find-none">
          Personne à ce nom. Vérifie l'orthographe du nom de famille (en entier). Seuls les licenciés classés en descente sont dans la liste : sinon, relie-toi avec ton numéro de licence.
        </p>
      )}
      {found && found.length > 0 && (
        <ul class="find-list" aria-label="Résultats">
          {found.map((l) => (
            <li key={l.licence}>
              <span class="fm-main">
                <b>{l.prenom} {l.nom}</b>
                <small>{[l.club, l.categorie].filter(Boolean).join(' · ')}</small>
              </span>
              <button class="pill solid" disabled={busy} onClick={() => claim(l.licence, l.nom, l.api ? l : undefined)}>C'est moi</button>
            </li>
          ))}
        </ul>
      )}
      {err && <p class="form-msg err" role="status">{err}</p>}

      {manual ? (
        <form class="login-form" style={{ marginTop: 12 }} onSubmit={(e) => { e.preventDefault(); claim(licence, nom) }}>
          <label>
            <span class="label">Numéro de licence</span>
            <input value={licence} onInput={(e) => setLicence((e.target as HTMLInputElement).value)} inputMode="numeric" autocomplete="off" required />
          </label>
          <button class="btn outline" type="submit" disabled={busy || !nom.trim()}>Relier avec mon n° de licence</button>
        </form>
      ) : (
        <button class="link dim find-manual" onClick={() => setManual(true)}>Je connais mon numéro de licence</button>
      )}
    </div>
  )
}
