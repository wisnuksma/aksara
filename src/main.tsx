import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Font disimpan di dalam aplikasi (bukan dari internet) supaya tetap tampil saat offline.
import '@fontsource-variable/lora/wght.css'
import '@fontsource-variable/lora/wght-italic.css'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import './styles/tokens.css'
import './styles/base.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
