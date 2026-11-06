import { Component, type ComponentChildren } from 'preact'

/**
 * Filet de sécurité : une erreur d'affichage n'écrase plus l'app sur un écran blanc.
 * La séance en cours est enregistrée sur le téléphone (IndexedDB) : recharger ne perd rien.
 */
export class ErrorBoundary extends Component<{ children: ComponentChildren }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error) { console.error('[TCK Chrono]', error) }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div class="screen crash px">
        <img src="/logo.png" alt="" width={88} height={88} />
        <h1>Oups, un souci d'affichage</h1>
        <p>Tes chronos sont enregistrés sur le téléphone : rien n'est perdu.</p>
        <button class="btn primary" onClick={() => location.reload()}>Recharger l'app</button>
        <button class="link dim" onClick={() => this.setState({ error: null })}>Réessayer sans recharger</button>
        <small class="mono">{String(this.state.error.message || this.state.error).slice(0, 160)}</small>
      </div>
    )
  }
}
