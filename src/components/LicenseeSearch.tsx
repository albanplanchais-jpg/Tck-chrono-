import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { uid, type Athlete } from '../core/model'
import { parseBib } from '../core/startOrder'
import { search, type Index, type Licensee } from '../ffck/search'
import type { FfckStatus } from '../ffck/store'
import { Icon } from './Icon'

interface Props {
  index?: Index
  count?: number
  version?: string
  status: FfckStatus
  myClub: string
  /** Groupe du coach : un licencié déjà connu garde son identifiant (historique continu). */
  roster: Athlete[]
  isAdded: (a: { name: string; licence?: string }) => boolean
  onAdd: (a: Athlete) => void
}

const niceName = (nom: string) => nom.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase())
export const licenseeName = (l: Licensee) => `${l.prenom} ${niceName(l.nom)}`

const STATUS: Partial<Record<FfckStatus, string>> = {
  checking: 'vérification…',
  downloading: 'mise à jour…',
  offline: 'hors ligne',
  forbidden: 'réservée aux coachs validés',
  missing: 'pas encore publiée',
  error: 'mise à jour impossible'
}

/** Ajout d'un athlète : autocomplétion sur les licenciés FFCK (« Mon club » d'abord), ou saisie libre. */
export function LicenseeSearch({ index, count, version, status, myClub, roster, isAdded, onAdd }: Props) {
  const [q, setQ] = useState('')
  const [bib, setBib] = useState('')

  // Une seule liste : mon club d'abord (bonus de score), puis les autres clubs.
  const hits = useMemo(() => (index && q.trim() ? search(index, q, { myClub, limit: 10 }) : []), [index, q, myClub])
  const firstOther = hits.findIndex((h) => !h.mine)

  const reset = () => { setQ(''); setBib('') }
  // Les suggestions restent visibles au-dessus du bas de l'écran.
  const listRef = useRef<HTMLUListElement>(null)
  useEffect(() => { listRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [q.trim().length >= 2, hits.length])

  const pick = (l: Licensee) => {
    const known = roster.find((a) => a.licence === l.licence) ?? roster.find((a) => !a.licence && a.name.toLowerCase() === licenseeName(l).toLowerCase())
    const b = parseBib(bib)
    onAdd({
      ...(known ?? { id: uid() }),
      name: licenseeName(l),
      licence: l.licence,
      ...(l.club ? { club: l.club } : {}),
      ...(l.categorie ? { categorie: l.categorie } : {}),
      ...(l.embarcation ? { embarcation: l.embarcation } : {}),
      ...(b !== undefined ? { bib: b } : known?.bib !== undefined ? { bib: known.bib } : {}),
      withPrev: undefined
    })
    reset()
  }

  const manual = () => {
    const n = q.trim()
    if (!n) return
    const known = roster.find((a) => a.name.toLowerCase() === n.toLowerCase())
    const b = parseBib(bib)
    onAdd({ ...(known ?? { id: uid(), name: n }), withPrev: undefined, ...(b !== undefined ? { bib: b } : {}) })
    reset()
  }

  const submit = (e: Event) => {
    e.preventDefault()
    const first = hits.find((h) => !isAdded({ name: licenseeName(h.l), licence: h.l.licence }))
    if (first && hits.length === 1) pick(first.l)
    else manual()
  }

  const day = version ? new Date(version).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : ''
  const info = index
    ? `Liste FFCK${day ? ` du ${day}` : ''} · ${count?.toLocaleString('fr-FR')} licenciés${STATUS[status] ? ` · ${STATUS[status]}` : ''}`
    : STATUS[status]
      ? `Liste FFCK ${STATUS[status]}`
      : ''

  return (
    <div class="lic">
      <form onSubmit={submit}>
        <label class="label" for="nm">Ajouter un athlète</label>
        <div class="field">
          <input
            id="nm"
            value={q}
            onInput={(e) => setQ((e.target as HTMLInputElement).value)}
            placeholder={index ? 'Nom, prénom ou club' : "Nom de l'athlète"}
            autocapitalize="words"
            autocomplete="off"
            spellcheck={false}
            enterkeyhint="done"
            role="combobox"
            aria-expanded={hits.length > 0}
            aria-controls="lic-results"
          />
          <input class="bib-in mono" value={bib} onInput={(e) => setBib((e.target as HTMLInputElement).value)} placeholder="n°" inputMode="numeric" aria-label="Dossard" />
          <button type="submit" class="add" aria-label="Ajouter"><Icon name="plus" size={28} stroke={2.6} /></button>
        </div>
      </form>

      {info && <p class="lic-info mono">{info}</p>}

      {q.trim().length >= 2 && (
        <ul class="lic-results" id="lic-results" role="listbox" ref={listRef}>
          {hits.map(({ l }, i) => {
            const added = isAdded({ name: licenseeName(l), licence: l.licence })
            return (
              <li key={l.licence} role="option" aria-selected={false} class={i === firstOther && i > 0 ? 'lic-sep' : ''}>
                <button class={`lic-row ${added ? 'added' : ''}`} disabled={added} onClick={() => pick(l)}>
                  <span class="lic-main">
                    <b>{l.prenom} <span class="caps">{l.nom}</span></b>
                    <small>{[l.club, l.categorie, l.embarcation, `n° ${l.licence}`].filter(Boolean).join(' · ')}</small>
                  </span>
                  <span class="lic-side">
                    {added ? <small>Ajouté</small> : <Icon name="plus" size={20} stroke={2.6} />}
                    {!l.active && <i>licence non renouvelée</i>}
                  </span>
                </button>
              </li>
            )
          })}
          <li>
            <button class="lic-row manual" onClick={manual}>
              <span class="lic-main">
                <b>Ajouter « {q.trim()} » à la main</b>
                <small>{hits.length ? 'Pas dans la liste ?' : index ? 'Aucun licencié trouvé' : 'Saisie libre'}</small>
              </span>
              <Icon name="plus" size={20} stroke={2.6} />
            </button>
          </li>
        </ul>
      )}
    </div>
  )
}
