import { useCallback, useEffect, useState } from 'react'
import Welcome from './screens/Welcome'
import NewNovelDialog from './screens/NewNovelDialog'
import { listRecent, rememberProject, type RecentProject } from './lib/recent'
import type { Template } from './lib/types'

export default function App() {
  const [recent, setRecent] = useState<RecentProject[]>([])
  const [toast, setToast] = useState<string | null>(null)
  // null = dialog tertutup; selain itu = template yang dipilih di awal
  const [newDialog, setNewDialog] = useState<Template | null>(null)

  const refreshRecent = useCallback(() => {
    listRecent().then(setRecent).catch(() => setRecent([]))
  }, [])
  useEffect(refreshRecent, [refreshRecent])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  const handleNew = useCallback((template?: Template) => setNewDialog(template ?? 'kosong'), [])
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
      <div className="screen" inert={newDialog !== null}>
      <Welcome
        recent={recent}
        onNew={handleNew}
        onOpen={handleOpen}
        onImport={handleImport}
        onOpenRecent={() => handleOpen()}
      />
      </div>
      {newDialog && (
        <NewNovelDialog
          key={newDialog}
          initialTemplate={newDialog}
          onCancel={() => setNewDialog(null)}
          onCreated={async ({ root, project, folder, parent }) => {
            setNewDialog(null)
            await rememberProject({
              id: project.id, title: project.judul, genre: project.genre,
              words: 0, lastOpened: new Date().toISOString(), handle: root,
            }).catch(() => {})
            refreshRecent()
            setToast(`Novel "${project.judul}" dibuat di folder ${parent}/${folder}/`)
          }}
        />
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  )
}
