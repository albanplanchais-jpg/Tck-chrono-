import { useState } from 'preact/hooks'
import { frError } from '../cloud/supabase'
import { claimLicence, findLicensee, type FoundLicensee } from '../cloud/links'

/** « Retrouve-toi » : l'athlète tape son nom et son prénom, choisit sa ligne, et son compte est relié à sa licence. */
export function FindMe({ defaultName, onLinked }: { defaultName?: string | null; onLinked: (msg: string) => void }) {
  const parts = (defaultName ?? '').trim().split(/\s+/)
  const [prenom, setPrenom] = useState(parts.length > 1 ? parts.slice(0, -1).join(' ') : '')
  const [nom, setNom] = useState(parts.length > 1 ? parts[parts.length - 1] : '')
  const [found, setFound] = useState<FoundLicensee[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [manual, setManual] = useState(false)
  const [licence, setLicence] = useState('')

  const search = async (e: Event) => {
    e.preventDefault()
    setBusy(true); setErr(''); setFound(null)
    try { setFound(await findLicensee(nom, prenom)) } catch (x) { setErr(frError(x as any)) }
    setBusy(false)
  }
  const claim = async (lic: string, n: string) => {
    setBusy(true); setErr('')
    try {
      const l = (await claimLicence(lic, n))[0]
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
          Personne à ce nom. Vérifie l'orthographe du nom de famille (complet). Seuls les licenciés déjà classés en descente sont dans la liste.
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
              <button class="pill solid" disabled={busy} onClick={() => claim(l.licence, l.nom)}>C'est moi</button>
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
