import { useEffect, useRef, useState } from 'preact/hooks'
import { frError } from '../cloud/supabase'
import { answerLink, findAccounts, linkSuggestions, myLinks, removeLink, requestLink, type Account, type Link } from '../cloud/links'
import { Icon } from './Icon'

/**
 * Liens coach ↔ athlète. Un athlète cherche ses coachs, un coach cherche des comptes athlètes (nom ou n° de licence).
 * Une demande devient un lien quand l'autre l'accepte. `onLinks` reçoit les liens acceptés (le coach les ajoute à son groupe).
 */
export function LinksPanel({ role, onLinks }: { role: 'coach' | 'athlete'; onLinks?: (accepted: Link[]) => void }) {
  const [links, setLinks] = useState<Link[] | null>(null)
  const [sugg, setSugg] = useState<Account[]>([])
  const [q, setQ] = useState('')
  const [found, setFound] = useState<Account[] | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const other = role === 'coach' ? 'athlète' : 'coach'

  const load = async () => {
    try {
      const l = await myLinks()
      setLinks(l)
      onLinks?.(l.filter((x) => x.status === 'accepted'))
      if (role === 'coach') setSugg(await linkSuggestions())
    } catch (x) { setErr(frError(x)); setLinks([]) }
  }
  useEffect(() => { load() }, [])

  useEffect(() => {
    clearTimeout(timer.current)
    if (q.trim().length < 2) return setFound(null)
    timer.current = window.setTimeout(async () => {
      try { setFound(await findAccounts(q)) } catch (x) { setErr(frError(x)) }
    }, 300)
  }, [q])

  const act = async (id: string, fn: () => Promise<unknown>) => {
    setBusy(id); setErr('')
    try { await fn(); await load() } catch (x) { setErr(frError(x)) }
    setBusy(null)
  }

  const incoming = links?.filter((l) => l.status === 'pending' && l.incoming) ?? []
  const outgoing = links?.filter((l) => l.status === 'pending' && !l.incoming) ?? []
  const accepted = links?.filter((l) => l.status === 'accepted') ?? []
  const sub = (a: Account) => [a.club, role === 'coach' && a.licence ? `licence ${a.licence}` : null].filter(Boolean).join(' · ')

  return (
    <div class="links">
      {incoming.length > 0 && (
        <>
          <p class="label links-cap">Demandes reçues · {incoming.length}</p>
          <ul class="link-list">
            {incoming.map((l) => (
              <li key={l.user_id} class="incoming">
                <span class="fm-main"><b>{l.name}</b><small>{sub(l) || `veut te relier comme ${other}`}</small></span>
                <span class="link-acts">
                  <button class="icon-btn" aria-label={`Refuser ${l.name}`} disabled={busy === l.user_id} onClick={() => act(l.user_id, () => answerLink(l.user_id, false))}><Icon name="x" size={18} /></button>
                  <button class="pill solid" disabled={busy === l.user_id} onClick={() => act(l.user_id, () => answerLink(l.user_id, true))}>Accepter</button>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {links && !accepted.length && !incoming.length && !outgoing.length && (
        <p class="muted" style={{ margin: '4px 0 10px' }}>
          {role === 'coach'
            ? "Aucun compte athlète relié. Cherche un athlète inscrit par son nom ou son n° de licence : il recevra ta demande."
            : "Aucun coach relié. Cherche ton coach par son nom : il recevra ta demande."}
        </p>
      )}
      {accepted.length > 0 && (
        <ul class="link-list">
          {accepted.map((l) => (
            <li key={l.user_id}>
              <span class="fm-main"><b><Icon name="check" size={14} stroke={2.6} />&nbsp;{l.name}</b><small>{sub(l) || 'relié'}</small></span>
              <button class="link dim" disabled={busy === l.user_id} onClick={() => act(l.user_id, () => removeLink(l.user_id))}>Retirer</button>
            </li>
          ))}
        </ul>
      )}
      {outgoing.length > 0 && (
        <ul class="link-list">
          {outgoing.map((l) => (
            <li key={l.user_id}>
              <span class="fm-main"><b>{l.name}</b><small>Demande envoyée · en attente</small></span>
              <button class="link dim" disabled={busy === l.user_id} onClick={() => act(l.user_id, () => removeLink(l.user_id))}>Annuler</button>
            </li>
          ))}
        </ul>
      )}

      {role === 'coach' && sugg.length > 0 && (
        <>
          <p class="label links-cap">Dans ton groupe, avec un compte</p>
          <ul class="link-list">
            {sugg.map((a) => (
              <li key={a.user_id}>
                <span class="fm-main"><b>{a.name}</b><small>{sub(a)}</small></span>
                <button class="pill outline" disabled={busy === a.user_id} onClick={() => act(a.user_id, () => requestLink(a.user_id))}>Relier</button>
              </li>
            ))}
          </ul>
        </>
      )}

      <input
        class="search"
        value={q}
        onInput={(e) => setQ((e.target as HTMLInputElement).value)}
        placeholder={role === 'coach' ? 'Chercher un athlète (nom ou n° de licence)' : 'Chercher mon coach'}
        aria-label={role === 'coach' ? 'Chercher un compte athlète' : 'Chercher un coach'}
      />
      {found && !found.length && <p class="muted" style={{ marginTop: 6 }}>Aucun compte {other} trouvé.</p>}
      {found && found.length > 0 && (
        <ul class="link-list">
          {found.map((a) => (
            <li key={a.user_id}>
              <span class="fm-main"><b>{a.name}</b><small>{sub(a) || other}</small></span>
              {a.linked === 'accepted' ? <span class="label">Relié</span>
                : a.linked === 'pending' ? <span class="label">En attente</span>
                : <button class="pill outline" disabled={busy === a.user_id} onClick={() => act(a.user_id, async () => { await requestLink(a.user_id); setQ('') })}>Demander</button>}
            </li>
          ))}
        </ul>
      )}
      {err && <p class="form-msg err" role="status" style={{ marginTop: 8 }}>{err}</p>}
    </div>
  )
}
