import { useCallback, useEffect, useState } from 'react'
import Welcome, { type Template } from './screens/Welcome'
import { listRecent, type RecentProject } from './lib/recent'

export default function App() {
  const [recent, setRecent] = useState<RecentProject[]>([])
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    listRecent().then(setRecent).catch(() => setRecent([]))
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2800)
    return () => clearTimeout(t)
  }, [toast])

  // Sementara: tombol-tombol ini akan diisi pada langkah berikutnya.
  const handleNew = useCallback((template?: Template) => {
    setToast(`Dialog novel baru${template ? ` (template: ${template})` : ''} dibuat di langkah 2.`)
  }, [])
  const handleOpen = useCallback(() => {
    setToast('Buka proyek akan aktif setelah ruang kerja siap (langkah 3).')
  }, [])
  const handleImport = useCallback(() => {
    setToast('Impor naskah (.docx / Markdown) termasuk Fase 2.')
  }, [])

  // Pintasan keyboard: ⌘N (Ctrl+N di Windows) dan ⌘O.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return
      const k = e.key.toLowerCase()
      if (k === 'n') { e.preventDefault(); handleNew() }
      else if (k === 'o') { e.preventDefault(); handleOpen() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleNew, handleOpen])

  return (
    <>
      <Welcome
        recent={recent}
        onNew={handleNew}
        onOpen={handleOpen}
        onImport={handleImport}
        onOpenRecent={() => handleOpen()}
      />
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  )
}
