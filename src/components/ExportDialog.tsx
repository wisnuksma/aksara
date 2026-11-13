import { useEffect, useState } from 'react'
import { printManuscript, safeFileName, saveFile, toDocx, toMarkdown, type ExportOptions } from '../lib/export'
import type { Project } from '../lib/project'
import { getAccessToken, getClientId, setClientId, uploadAsGoogleDoc } from '../lib/gdocs'
import '../screens/dialog.css'

type Format = 'docx' | 'pdf' | 'md' | 'gdocs'
const FORMATS: { id: Format; name: string; desc: string }[] = [
  { id: 'docx', name: 'Word (.docx)', desc: 'Bisa dibuka di Google Docs & Word' },
  { id: 'pdf', name: 'PDF', desc: 'Lewat jendela cetak Chrome' },
  { id: 'md', name: 'Markdown', desc: 'Teks biasa (.md)' },
  { id: 'gdocs', name: 'Google Docs', desc: 'Kirim langsung ke Google Drive' },
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
  const [clientId, setCid] = useState(getClientId)
  const [link, setLink] = useState<string | null>(null)

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
      if (format === 'gdocs') {
        setClientId(clientId)
        const token = await getAccessToken(clientId.trim())   // jendela izin Google
        const url = await uploadAsGoogleDoc(token, p.data.judul, await toDocx(p, o))
        setLink(url)
        window.open(url, '_blank', 'noopener')
        onDone('Naskah dikirim ke Google Docs.')
        return
      }
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
      setError(format === 'gdocs' && e instanceof Error ? e.message : 'Gagal mengekspor. Coba lagi, atau pilih lokasi lain.')
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
          {format === 'gdocs' && (
            <div className="gdocs">
              <label className="field">
                <span className="field-label">Google Client ID</span>
                <input className="input" value={clientId} onChange={(e) => setCid(e.target.value)} spellCheck={false}
                  placeholder="1234567890-abc…apps.googleusercontent.com" />
              </label>
              <details open={!clientId}>
                <summary>Cara membuat Client ID (sekali saja, ±10 menit)</summary>
                <ol>
                  <li>Buka <b>console.cloud.google.com</b> → buat proyek baru, mis. “Aksara”.</li>
                  <li><b>APIs &amp; Services → Library</b> → cari <b>Google Drive API</b> → <b>Enable</b>.</li>
                  <li><b>OAuth consent screen</b> → External → isi nama aplikasi dan email Anda → di <b>Test users</b> tambahkan email Google Anda.</li>
                  <li><b>Credentials → Create credentials → OAuth client ID</b> → jenis <b>Web application</b>.</li>
                  <li>Di <b>Authorized JavaScript origins</b> tambahkan <code>{location.origin}</code> lalu <b>Create</b>.</li>
                  <li>Salin <b>Client ID</b> dan tempel di atas.</li>
                </ol>
                <p>Aksara hanya meminta izin untuk file yang dibuatnya sendiri (bukan seluruh Drive Anda).</p>
              </details>
              {link && <p className="hint">Terkirim: <a href={link} target="_blank" rel="noopener">buka dokumen</a></p>}
            </div>
          )}
          {error && <p className="dialog-error" role="alert">{error}</p>}
        </div>
        <div className="dialog-foot">
          <button className="btn" onClick={onClose} disabled={busy}>Batal</button>
          <button className="btn btn-primary" onClick={run} disabled={busy || (format === 'gdocs' && !/\.apps\.googleusercontent\.com$/.test(clientId.trim()))}>
            {busy ? (format === 'gdocs' ? 'Mengirim…' : 'Menyiapkan…') : format === 'pdf' ? 'Buka jendela cetak' : format === 'gdocs' ? 'Kirim ke Google Docs' : 'Ekspor…'}
          </button>
        </div>
      </div>
    </div>
  )
}
