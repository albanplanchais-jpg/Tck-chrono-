import { render } from 'preact'
import { registerSW } from 'virtual:pwa-register'
import { App } from './app'
import { requestPersist } from './store/db'
import { unlockAudioOnFirstTouch } from './device/feedback'
import '@fontsource-variable/outfit/wght.css'
import '@fontsource/jetbrains-mono/latin-700.css'
import '@fontsource/jetbrains-mono/latin-800.css'
import './styles.css'

registerSW({ immediate: true })
requestPersist()
unlockAudioOnFirstTouch()
render(<App />, document.getElementById('app')!)
