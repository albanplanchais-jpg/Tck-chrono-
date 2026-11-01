import { useState } from 'preact/hooks'
import { uid, type Athlete } from '../core/model'
import { fmtDay } from '../core/format'
import type { Store } from '../store/useSession'
import { Icon } from '../components/Icon'

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true

export function Setup({ store }: { store: Store }) {
  const [list, setList] = useState<Athlete[]>(store.lastGroup)
  const [name, setName] = useState('')
  const [hint, setHint] = useState(isIOS && !standalone)

  const has = (n: string) => list.some((a) => a.name.toLowerCase() === n.trim().toLowerCase())
  const add = (a: Athlete) => !has(a.name) && setList((l) => [...l, a])
  const submit = (e: Event) => {
    e.preventDefault()
    const n = name.trim()
    if (!n) return
    const known = store.roster.find((a) => a.name.toLowerCase() === n.toLowerCase())
    add(known ?? { id: uid(), name: n })
    setName('')
  }
  const recents = store.roster.filter((a) => !has(a.name))

  return (
    <div class="screen setup">
      <div class="scroll px">
        <header class="head">
          <span class="label">{fmtDay(Date.now())}</span>
          <h1>Nouvelle séance</h1>
        </header>

        {hint && (
          <div class="banner">
            <span>Pour installer l'app : <b>Partager</b> → <b>Sur l'écran d'accueil</b>.</span>
            <button class="rm" onClick={() => setHint(false)} aria-label="Fermer"><Icon name="x" size={18} /></button>
          </div>
        )}

        <form onSubmit={submit} style={{ marginTop: 14 }}>
          <label class="label" for="nm">Ajouter un athlète</label>
          <div class="field">
            <input
              id="nm"
              value={name}
              onInput={(e) => setName((e.target as HTMLInputElement).value)}
              placeholder="Nom de l'athlète"
              autocapitalize="words"
              autocomplete="off"
              enterkeyhint="done"
            />
            <button type="submit" class="add" aria-label="Ajouter"><Icon name="plus" size={28} stroke={2.6} /></button>
          </div>
        </form>

        <div class="section-head">
          <span class="label white">Participants</span>
          <span class="count">{list.length} athlète{list.length > 1 ? 's' : ''}</span>
        </div>

        {list.length === 0 ? (
          <div class="empty-state">
            <div class="ico"><Icon name="user" size={24} stroke={1.8} /></div>
            <h3>Aucun athlète</h3>
            <p>Tapez un nom ci-dessus ou touchez un récent pour l'ajouter. Il faut au moins un athlète pour démarrer.</p>
          </div>
        ) : (
          <ul class="roster">
            {list.map((a, i) => (
              <li key={a.id}>
                <span class="idx">{String(i + 1).padStart(2, '0')}</span>
                <span class="name">{a.name}</span>
                <button class="rm" onClick={() => setList((l) => l.filter((x) => x.id !== a.id))} aria-label={`Retirer ${a.name}`}>
                  <Icon name="x" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {recents.length > 0 && (
          <section class="recents">
            <span class="label">Récents</span>
            <div class="chips">
              {recents.map((a) => (
                <button key={a.id} class="chip" onClick={() => add(a)}><Icon name="plus" size={18} stroke={2.6} />{a.name}</button>
              ))}
            </div>
          </section>
        )}
      </div>

      <footer class="bottom bar">
        <button class="btn primary" disabled={!list.length} onClick={() => store.start(list)}>Démarrer la séance</button>
      </footer>
    </div>
  )
}
