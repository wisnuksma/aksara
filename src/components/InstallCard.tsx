import { useState } from 'react'
import { isChrome, isInstalled, useInstall } from '../lib/pwa'
import './install.css'

const KEY = 'aksara-install-hidden'

/** Kartu di layar sambutan: ajakan memasang Aksara sebagai aplikasi di Dock. */
export default function InstallCard() {
  const { canPrompt, install } = useInstall()
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(KEY) === '1' } catch { return false } })
  const [steps, setSteps] = useState(false)
  if (hidden || isInstalled()) return null

  const hide = () => {
    setHidden(true)
    try { localStorage.setItem(KEY, '1') } catch { /* abaikan */ }
  }

  return (
    <div className="install-card">
      <img src="./pwa-192.png" alt="" width="44" height="44" className="install-icon" />
      <div className="install-text">
        <span className="install-title">Pasang Aksara di Dock</span>
        {!isChrome() ? (
          <span className="install-desc">Buka Aksara di <b>Google Chrome</b> untuk memasangnya sebagai aplikasi dan menyimpan naskah ke folder Anda.</span>
        ) : steps || !canPrompt ? (
          <span className="install-desc">
            Klik ikon <b>Pasang</b> <InstallGlyph /> di ujung kanan kolom alamat Chrome. Atau buka menu <b>⋮</b> →{' '}
            <b>Transmisikan, simpan, dan bagikan</b> → <b>Instal halaman sebagai aplikasi…</b>
          </span>
        ) : (
          <span className="install-desc">Buka seperti aplikasi Mac biasa, tetap bisa menulis tanpa internet.</span>
        )}
      </div>
      <div className="install-actions">
        {isChrome() && canPrompt && (
          <button className="btn btn-primary btn-sm" onClick={async () => { if (!(await install())) setSteps(true) }}>Pasang</button>
        )}
        <button className="install-later" onClick={hide}>Nanti saja</button>
      </div>
    </div>
  )
}

const InstallGlyph = () => (
  <svg aria-label="ikon pasang" role="img" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" style={{ verticalAlign: '-2px' }}>
    <rect x="3" y="4" width="18" height="14" rx="2" /><path d="M12 8v6M9 11l3 3 3-3M8 21h8" />
  </svg>
)
