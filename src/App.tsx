import { useCallback, useEffect, useState } from 'react'
import Welcome from './screens/Welcome'
import NewNovelDialog from './screens/NewNovelDialog'
import Workspace from './screens/Workspace'
import { listRecent, rememberProject, type RecentProject } from './lib/recent'
import { loadProject, NotAProjectError, PermissionError, totalWords, type Project } from './lib/project'
import { fsSupported } from './lib/fs'
import type { Template } from './lib/types'
import { usePwa } from './lib/pwa'

export default function App() {
  const [recent, setRecent] = useState<RecentProject[]>([])
  const [toast, setToast] = useState<string | null>(null)
  // null = dialog tertutup; selain itu = template yang dipilih di awal
  const [newDialog, setNewDialog] = useState<Template | null>(null)
  const [project, setProject] = useState<Project | null>(null)
  const [busy, setBusy] = useState(false)
  const pwa = usePwa()

  const refreshRecent = useCallback(() => {
    listRecent().then(setRecent).catch(() => setRecent([]))
  }, [])
  useEffect(refreshRecent, [refreshRecent])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  /** Buka folder novel ke ruang kerja. */
  const openFolder = useCallback(async (root: FileSystemDirectoryHandle) => {
    if (busy) return
    setBusy(true)
    try {
      const p = await loadProject(root)
      await rememberProject({
        id: p.data.id, title: p.data.judul, genre: p.data.genre, words: totalWords(p),
        lastOpened: new Date().toISOString(), handle: root,
      }).catch(() => {})
      setProject(p)
    } catch (e) {
      if (e instanceof NotAProjectError) setToast(`Folder "${root.name}" bukan novel Aksara (tidak ada project.json).`)
      else if (e instanceof PermissionError) setToast('Izin membuka folder ditolak. Coba lagi dan pilih "Izinkan".')
      else if ((e as DOMException)?.name === 'NotFoundError') setToast('Folder novel tidak ditemukan. Mungkin sudah dipindah — gunakan Buka proyek.')
      else { console.error(e); setToast('Gagal membuka novel.') }
    } finally {
      setBusy(false)
    }
  }, [busy])

  const handleNew = useCallback((template?: Template) => setNewDialog(template ?? 'kosong'), [])
  const handleOpen = useCallback(async () => {
    if (!fsSupported()) { setToast('Buka aplikasi lewat Google Chrome untuk membuka folder.'); return }
    try {
      const dir = await window.showDirectoryPicker({ id: 'novel-open', mode: 'readwrite', startIn: 'documents' })
      await openFolder(dir)
    } catch (e) {
      if ((e as DOMException).name !== 'AbortError') setToast('Folder tidak bisa dibuka.')
    }
  }, [openFolder])
  const handleImport = useCallback(() => {
    setToast('Impor naskah (.docx / Markdown) termasuk Fase 2.')
  }, [])
  const handleOpenRecent = useCallback((r: RecentProject) => {
    if (r.handle) openFolder(r.handle)
    else setToast('Lokasi novel ini tidak tersimpan. Gunakan Buka proyek.')
  }, [openFolder])

  // Pintasan keyboard di layar sambutan: ⌘N, ⌘O, ⇧⌘I (Ctrl di Windows).
  useEffect(() => {
    if (project) return
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return
      const k = e.key.toLowerCase()
      if (e.shiftKey) {
        if (k === 'i') { e.preventDefault(); handleImport() }
        return
      }
      if (k === 'n') { e.preventDefault(); handleNew() }
      else if (k === 'o') { e.preventDefault(); handleOpen() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [project, handleNew, handleOpen, handleImport])

  const updateBanner = (pwa.needRefresh || pwa.offlineReady) && (
    <div className="toast update-toast" role="status">
      {pwa.needRefresh ? <>
        <span>Versi baru Aksara tersedia.</span>
        <button onClick={pwa.reload}>Muat ulang</button>
        <button className="ghost" onClick={pwa.dismiss}>Nanti</button>
      </> : <>
        <span>Aksara siap dipakai tanpa internet.</span>
        <button className="ghost" onClick={pwa.dismiss}>Tutup</button>
      </>}
    </div>
  )

  if (project) {
    return (
      <>
      <Workspace
        key={project.data.id}
        project={project}
        onClose={() => { setProject(null); refreshRecent() }}
      />
      {updateBanner}
      </>
    )
  }

  return (
    <>
      <div className="screen" inert={newDialog !== null}>
        <Welcome
          recent={recent}
          onNew={handleNew}
          onOpen={handleOpen}
          onImport={handleImport}
          onOpenRecent={handleOpenRecent}
        />
      </div>
      {newDialog && (
        <NewNovelDialog
          key={newDialog}
          initialTemplate={newDialog}
          onCancel={() => setNewDialog(null)}
          onCreated={async ({ root }) => {
            setNewDialog(null)
            await openFolder(root)
          }}
        />
      )}
      {toast ? <div className="toast" role="status">{toast}</div> : updateBanner}
    </>
  )
}
