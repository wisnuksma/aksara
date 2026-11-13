import { useEffect, useState } from 'react'
import { printManuscript, safeFileName, saveFile, toDocx, toMarkdown, type ExportOptions } from '../lib/export'
import type { Project } from '../lib/project'
import '../screens/dialog.css'

type Format = 'docx' | 'pdf' | 'md'
const FORMATS: { id: Format; name: string; desc: string }[] = [
  { id: 'docx', name: 'Word (.docx)', desc: 'Bisa dibuka di Google Docs & Word' },
  { id: 'pdf', name: 'PDF', desc: 'Lewat jendela cetak Chrome' },
  { id: 'md', name: 'Markdown', desc: 'Teks biasa (.md)' },
]
const KEY = 'aksara-export'

interface Props {
  project: Project
  /** Simpan perubahan yang tertunda sebelum mengekspor. */
  beforeExport: () => Promise<void>
  onClose: () => void
  onDone: (msg: string) => void
}

export default function ExportDialog({ project: p, beforeExport, onClose, onDone }: Props) {
  const saved = (() => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') } catch { return {} } })()
  const [format, setFormat] = useState<Format>(saved.format ?? 'docx')
  const [o, setO] = useState<ExportOptions>({ titlePage: true, chapterTitles: true, sceneTitles: false, ...saved.options })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  async function run() {
    setBusy(true)
    setError(null)
    try { localStorage.setItem(KEY, JSON.stringify({ format, options: o })) } catch { /* abaikan */ }
    try {
      await beforeExport()
      const name = safeFileName(p.data.judul)
      if (format === 'pdf') {
        onClose()
        printManuscript(p, o)
        return
      }
      const ok = format === 'docx'
        ? await saveFile(await toDocx(p, o), `${name}.docx`, { description: 'Dokumen Word', accept: { 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'] } })
        : await saveFile(new Blob([toMarkdown(p, o)], { type: 'text/markdown' }), `${name}.md`, { description: 'Markdown', accept: { 'text/markdown': ['.md'] } })
      if (ok) { onClose(); onDone(`Naskah diekspor sebagai ${format === 'docx' ? 'Word (.docx)' : 'Markdown'}.`) }
    } catch (e) {
      console.error(e)
      setError('Gagal mengekspor. Coba lagi, atau pilih lokasi lain.')
    } finally {
      setBusy(false)
    }
  }

  const check = (key: keyof ExportOptions, label: string) => (
    <label className="check">
      <input type="checkbox" checked={o[key]} onChange={(e) => setO({ ...o, [key]: e.target.checked })} />
      <span>{label}</span>
    </label>
  )

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="ex-title">
        <div className="dialog-head">
          <h1 id="ex-title">Ekspor naskah</h1>
          <p>Seluruh bab dan adegan, sesuai urutan di binder.</p>
        </div>
        <div className="dialog-body">
          <fieldset className="field">
            <legend className="field-label">Format</legend>
            <div className="choices">
              {FORMATS.map((f) => (
                <label key={f.id} className={'choice' + (format === f.id ? ' is-selected' : '')}>
                  <span className="choice-name">
                    <input type="radio" name="format" checked={format === f.id} onChange={() => setFormat(f.id)} />
                    {f.name}
                  </span>
                  <span className="choice-desc">{f.desc}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="field">
            <legend className="field-label">Isi</legend>
            <div className="checks">
              {check('titlePage', 'Halaman judul')}
              {check('chapterTitles', 'Judul bab (mis. Bab 1 · Gadis Kecil dan Sepotong Roti)')}
              {check('sceneTitles', 'Judul adegan (bila tidak, adegan dipisah dengan * * *)')}
            </div>
          </fieldset>
          {format === 'pdf' && (
            <p className="hint">Di jendela cetak, pilih <b>Tujuan: Simpan sebagai PDF</b> lalu klik <b>Simpan</b>.</p>
          )}
          {format === 'docx' && (
            <p className="hint">Untuk Google Docs: unggah file ke Google Drive, lalu buka dengan Google Docs. Font Lora tersedia di sana.</p>
          )}
          {error && <p className="dialog-error" role="alert">{error}</p>}
        </div>
        <div className="dialog-foot">
          <button className="btn" onClick={onClose} disabled={busy}>Batal</button>
          <button className="btn btn-primary" onClick={run} disabled={busy}>{busy ? 'Menyiapkan…' : format === 'pdf' ? 'Buka jendela cetak' : 'Ekspor…'}</button>
        </div>
      </div>
    </div>
  )
}
