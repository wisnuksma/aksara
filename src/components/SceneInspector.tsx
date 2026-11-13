import { useEffect, useRef, useState } from 'react'
import Combo from './Combo'
import { entryAliases, entryName, type Bible } from '../lib/bible'
import type { FrontMatter } from '../lib/frontmatter'
import type { SceneStatus } from '../lib/types'
import './inspector.css'

const STATUSES: { id: SceneStatus; label: string }[] = [
  { id: 'ide', label: 'Ide' }, { id: 'draf', label: 'Draf' }, { id: 'revisi', label: 'Revisi' }, { id: 'selesai', label: 'Selesai' },
]

interface Props {
  meta: FrontMatter
  bible: Bible
  /** Nilai "alur" dan "waktu" yang sudah dipakai di adegan lain (untuk saran). */
  suggestions: { alur: string[]; waktu: string[] }
  /** Teks naskah adegan ini (untuk "Ambil dari naskah"). */
  getText: () => string
  onChange: (patch: FrontMatter) => void
}

export default function SceneInspector({ meta, bible, suggestions, getText, onChange }: Props) {
  const tokohNames = bible.tokoh.map(entryName)
  const tempatNames = bible.tempat.map(entryName)
  const tokoh = Array.isArray(meta.tokoh) ? meta.tokoh : []
  const status = (String(meta.status || 'ide') as SceneStatus)
  const [found, setFound] = useState<string | null>(null)

  const detect = () => {
    const text = getText()
    const hits = bible.tokoh.filter((t) => [entryName(t), ...entryAliases(t)].some((n) =>
      n.length >= 2 && new RegExp(`(?<![\\p{L}\\p{N}])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'u').test(text)))
      .map(entryName).filter((n) => !tokoh.includes(n))
    if (hits.length) onChange({ tokoh: [...tokoh, ...hits] })
    setFound(hits.length ? `Ditambahkan: ${hits.join(', ')}` : 'Tidak ada tokoh baru yang ditemukan di naskah.')
  }
  useEffect(() => { setFound(null) }, [meta.id])

  return (
    <div className="inspector">
      <div className="insp-field">
        <span className="insp-label">Status</span>
        <div className="status-group" role="radiogroup" aria-label="Status adegan">
          {STATUSES.map((s) => (
            <button key={s.id} role="radio" aria-checked={status === s.id}
              className={'status-btn status-' + s.id + (status === s.id ? ' is-on' : '')}
              onClick={() => onChange({ status: s.id })}>{s.label}</button>
          ))}
        </div>
      </div>

      <div className="insp-field">
        <span className="insp-label">Sinopsis</span>
        <AutoArea value={String(meta.sinopsis ?? '')} placeholder="Apa yang terjadi di adegan ini, dalam 1–3 kalimat?"
          onChange={(v) => onChange({ sinopsis: v })} />
      </div>

      <div className="insp-field">
        <span className="insp-label">Sudut pandang (POV)</span>
        <Combo value={String(meta.pov ?? '')} options={tokohNames} placeholder={tokohNames.length ? 'Pilih tokoh…' : 'Nama tokoh'}
          onChange={(v) => onChange({ pov: v })} aria-label="Sudut pandang" />
      </div>

      <div className="insp-row">
        <div className="insp-field">
          <span className="insp-label">Lokasi</span>
          <Combo value={String(meta.lokasi ?? '')} options={tempatNames} placeholder="Tempat…"
            onChange={(v) => onChange({ lokasi: v })} aria-label="Lokasi" />
        </div>
        <div className="insp-field">
          <span className="insp-label">Waktu cerita</span>
          <Combo value={String(meta.waktu_cerita ?? '')} options={suggestions.waktu} placeholder="mis. Hari 3, pagi"
            onChange={(v) => onChange({ waktu_cerita: v })} aria-label="Waktu cerita" />
        </div>
      </div>

      <div className="insp-field">
        <span className="insp-label">Alur</span>
        <Combo value={String(meta.alur ?? '')} options={suggestions.alur} placeholder="mis. Alur utama, Subplot Navea"
          onChange={(v) => onChange({ alur: v })} aria-label="Alur" />
      </div>

      <div className="insp-field">
        <span className="insp-label">Tokoh dalam adegan</span>
        {tokoh.length > 0 && (
          <div className="insp-chips">
            {tokoh.map((t) => (
              <span key={t} className="chip">{t}
                <button aria-label={`Hapus ${t}`} onClick={() => onChange({ tokoh: tokoh.filter((x) => x !== t) })}>×</button>
              </span>
            ))}
          </div>
        )}
        <Combo value="" clearOnPick options={tokohNames.filter((n) => !tokoh.includes(n))} placeholder="Tambah tokoh…"
          onChange={(v) => { if (v && !tokoh.includes(v)) onChange({ tokoh: [...tokoh, v] }) }} aria-label="Tambah tokoh" />
        {bible.tokoh.length > 0 && (
          <button className="insp-detect" onClick={detect}>Ambil dari naskah</button>
        )}
        {found && <span className="insp-found" role="status">{found}</span>}
      </div>
    </div>
  )
}

function AutoArea({ value, placeholder, onChange }: { value: string; placeholder: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  useEffect(() => {
    const el = ref.current
    if (el) { el.style.height = '0'; el.style.height = Math.max(76, el.scrollHeight) + 'px' }
  }, [v])
  return (
    <textarea ref={ref} className="insp-area" value={v} placeholder={placeholder} aria-label="Sinopsis"
      onChange={(e) => { setV(e.target.value); onChange(e.target.value) }} />
  )
}
