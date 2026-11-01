import { useState } from 'preact/hooks'
import { frError } from '../cloud/supabase'
import { resetPassword, signIn, signUp } from '../cloud/auth'

/** Connexion / inscription du coach (obligatoire pour créer une séance). */
export function Login() {
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  const submit = async (e: Event) => {
    e.preventDefault()
    setError('')
    setInfo('')
    setBusy(true)
    try {
      if (mode === 'in') await signIn(email, password)
      else {
        const active = await signUp(email, password, name)
        if (!active) {
          setInfo(`Compte créé. Un e-mail de confirmation a été envoyé à ${email.trim()} : clique sur le lien, puis reviens ici pour te connecter.`)
          setMode('in')
        }
      }
    } catch (err) {
      setError(frError(err))
    } finally {
      setBusy(false)
    }
  }

  const forgot = async () => {
    setError('')
    if (!email.trim()) return setError("Entre ton e-mail d'abord.")
    try {
      await resetPassword(email)
      setInfo('E-mail de réinitialisation envoyé.')
    } catch (err) {
      setError(frError(err))
    }
  }

  return (
    <div class="screen login">
      <div class="scroll px">
        <header class="login-head">
          <img src="/logo.png" alt="Torcy Canoë-Kayak" width={120} height={120} />
          <span class="label">TCK Chrono · Espace coach</span>
          <h1>{mode === 'in' ? 'Connexion' : 'Créer un compte'}</h1>
          <p class="muted">Un compte coach est nécessaire pour créer une séance et partager le lien aux athlètes.</p>
        </header>

        <form class="login-form" onSubmit={submit}>
          {mode === 'up' && (
            <label>
              <span class="label">Prénom et nom</span>
              <input value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} autocomplete="name" required />
            </label>
          )}
          <label>
            <span class="label">E-mail</span>
            <input type="email" value={email} onInput={(e) => setEmail((e.target as HTMLInputElement).value)} autocomplete="email" inputMode="email" required />
          </label>
          <label>
            <span class="label">Mot de passe</span>
            <input
              type="password"
              value={password}
              onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
              autocomplete={mode === 'in' ? 'current-password' : 'new-password'}
              minLength={6}
              required
            />
          </label>
          {error && <p class="form-msg err" role="alert">{error}</p>}
          {info && <p class="form-msg" role="status">{info}</p>}
          <button class="btn primary" type="submit" disabled={busy}>
            {busy ? '…' : mode === 'in' ? 'Se connecter' : 'Créer mon compte'}
          </button>
        </form>

        <div class="login-alt">
          <button class="link" onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setError(''); setInfo('') }}>
            {mode === 'in' ? 'Pas de compte ? Créer un compte' : "J'ai déjà un compte"}
          </button>
          {mode === 'in' && <button class="link" onClick={forgot}>Mot de passe oublié</button>}
        </div>
      </div>
    </div>
  )
}
