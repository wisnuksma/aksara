import { useEffect, useRef, useState, type FormEvent } from 'react'
import { get, set } from 'idb-keyval'
import { createProject, FolderExistsError } from '../lib/createProject'
import { ensurePermission, folderName, fsSupported } from '../lib/fs'
import type { ProjectFile, Template } from '../lib/types'
import './dialog.css'

const GENRES = ['Fantasi', 'Romansa', 'Misteri', 'Fiksi ilmiah', 'Drama', 'Lainnya']

const STRUKTUR: { id: Template; name: string; desc: string }[] = [
  { id: 'kosong', name: 'Kosong', desc: 'Mulai bebas' },
  { id: 'tiga-babak', name: 'Tiga babak', desc: 'Awal · konflik · resolusi' },
  { id: 'fantasi-epik', name: 'Fantasi epik', desc: 'Plus faksi, peta, lore' },
]

const PARENT_KEY = 'parent-folder'

interface Props {
  initialTemplate?: Template
  onCancel: () => void
  onCreated: (r: { root: FileSystemDirectoryHandle; project: ProjectFile; folder: string; parent: string }) => void
}

/** "80.000" atau "80000" -> 80000 */
const parseNumber = (s: string) => Number(s.replace(/[^\d]/g, '')) || 0
const formatTyping = (s: string) => {
  const n = parseNumber(s)
  return n ? new Intl.NumberFormat('id-ID').format(n) : ''
}

export default function NewNovelDialog({ initialTemplate = 'kosong', onCancel, onCreated }: Props) {
  const [judul, setJudul] = useState('')
  const [genre, setGenre] = useState('Fantasi')
  const [target, setTarget] = useState('')
  const [template, setTemplate] = useState<Template>(initialTemplate)
  const [parent, setParent] = useState<FileSystemDirectoryHandle | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    titleRef.current?.focus()
    get<FileSystemDirectoryHandle>(PARENT_KEY).then((h) => h && setParent(h)).catch(() => {})
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onCancel])

  async function chooseFolder(): Promise<FileSystemDirectoryHandle | null> {
    try {
      const h = await window.showDirectoryPicker({ id: 'novel-parent', mode: 'readwrite', startIn: 'documents' })
      setParent(h)
      setError(null)
      await set(PARENT_KEY, h).catch(() => {})
      return h
    } catch (e) {
      if ((e as DOMException).name !== 'AbortError') setError('Folder tidak bisa dipakai. Coba pilih folder lain.')
      return null
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    if (!fsSupported()) {
      setError('Browser ini tidak bisa menyimpan ke folder. Buka aplikasi lewat Google Chrome.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const dir = parent ?? (await chooseFolder())
      if (!dir) return
      if (!(await ensurePermission(dir))) {
        setError('Izin menyimpan ke folder ditolak. Klik "Ubah…" dan pilih folder lagi.')
        return
      }
      const r = await createProject(dir, {
        judul: judul.trim() || 'Novel tanpa judul',
        genre,
        targetKata: parseNumber(target),
        template,
      })
      onCreated({ ...r, parent: dir.name })
    } catch (err) {
      if (err instanceof FolderExistsError) {
        setError(`Sudah ada folder "${err.message}" di sini. Ganti judul atau pilih folder lain — folder lama tidak akan ditimpa.`)
      } else {
        console.error(err)
        setError('Gagal membuat novel. Pastikan folder masih ada dan bisa ditulisi.')
      }
    } finally {
      setBusy(false)
    }
  }

  const preview = `${parent ? parent.name : '…'}/${folderName(judul.trim() || 'Novel tanpa judul')}/`

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !busy && onCancel()}>
      <form className="dialog" role="dialog" aria-modal="true" aria-labelledby="nn-title" onSubmit={submit}>
        <div className="dialog-head">
          <h1 id="nn-title">Novel baru</h1>
          <p>Semua bisa diubah nanti. Isi seadanya dulu.</p>
        </div>

        <div className="dialog-body">
          <label className="field">
            <span className="field-label">Judul</span>
            <input ref={titleRef} className="input input-serif" placeholder="Judul sementara juga boleh"
              value={judul} onChange={(e) => setJudul(e.target.value)} maxLength={120} />
          </label>

          <div className="field-row">
            <label className="field">
              <span className="field-label">Genre</span>
              <select className="input" value={genre} onChange={(e) => setGenre(e.target.value)}>
                {GENRES.map((g) => <option key={g}>{g}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Target kata</span>
              <input className="input" inputMode="numeric" placeholder="mis. 80.000"
                value={target} onChange={(e) => setTarget(formatTyping(e.target.value))} />
            </label>
          </div>

          <fieldset className="field">
            <legend className="field-label">Struktur awal</legend>
            <div className="choices">
              {STRUKTUR.map((s) => (
                <label key={s.id} className={'choice' + (template === s.id ? ' is-selected' : '')}>
                  <span className="choice-name">
                    <input type="radio" name="struktur" checked={template === s.id} onChange={() => setTemplate(s.id)} />
                    {s.name}
                  </span>
                  <span className="choice-desc">{s.desc}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="field">
            <span className="field-label">Disimpan di</span>
            <div className="location">
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--gold-text)" strokeWidth="1.6" strokeLinejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
              <span className="location-path">{parent ? preview : 'Belum dipilih — misalnya folder Documents'}</span>
              <button type="button" className="btn btn-small" onClick={chooseFolder} disabled={busy}>
                {parent ? 'Ubah…' : 'Pilih…'}
              </button>
            </div>
            <span className="hint">Ingin tersinkron ke Mac lain? Pilih folder di dalam iCloud Drive.</span>
          </div>

          {error && <p className="dialog-error" role="alert">{error}</p>}
        </div>

        <div className="dialog-foot">
          <button type="button" className="btn" onClick={onCancel} disabled={busy}>Batal</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Membuat…' : 'Buat novel'}</button>
        </div>
      </form>
    </div>
  )
}
