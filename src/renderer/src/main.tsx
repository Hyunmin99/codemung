import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './App'
import './styles.css'
import './macos.css'
import { installSound } from './audio/sound'

const disposeSound = installSound()
if (import.meta.hot) import.meta.hot.dispose(() => { void disposeSound() })

const root = document.getElementById('root')

if (!root) {
  throw new Error('CodeMung renderer root was not found')
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
