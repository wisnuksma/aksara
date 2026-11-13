import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import Select from '../components/Select'
import Combo from '../components/Combo'
import { entryFaction, entryId, entryName, factionColor } from '../lib/bible'
import { loadRelations, newId, saveRelations, type RelationsFile } from '../lib/plan'
import type { Project } from '../lib/project'

const W = 1000, H = 620, R = 30
const KINDS = ['keluarga', 'saudara', 'orang tua', 'kekasih', 'sahabat', 'sekutu', 'mentor', 'atasan', 'rival', 'musuh']

interface Props {
  project: Project
  openEntry: (id: string) => void
  onError: (msg: string) => void
}

/** Peta relasi tokoh: lingkaran = tokoh (warna faksi), garis = relasi. */
export default function Relations({ project: p, openEntry, onError }: Props) {
  const [data, setData] = useState<RelationsFile | null>(null)
  const [focus, setFocus] = useState<string | null>(null)
  const [form, setForm] = useState({ dari: '', ke: '', jenis: '', catatan: '' })
  const svgRef = useRef<SVGSVGElement>(null)
  const dragging = useRef<{ id: string; moved: boolean } | null>(null)
  const justDragged = useRef(false)
  const tokoh = p.bible.tokoh

  useEffect(() => { loadRelations(p.root).then(setData) }, [p])
  const save = (d: RelationsFile) => { setData(d); saveRelations(p.root, d).catch(() => onError('Gagal menyimpan peta relasi.')) }

  // Posisi: yang tersimpan, atau melingkar untuk tokoh baru
  const pos = useMemo(() => {
    const out: Record<string, { x: number; y: number }> = {}
    tokoh.forEach((t, i) => {
      const id = entryId(t)
      const a = (i / Math.max(1, tokoh.length)) * Math.PI * 2 - Math.PI / 2
      out[id] = data?.posisi[id] ?? { x: W / 2 + Math.cos(a) * 230, y: H / 2 + Math.sin(a) * 210 }
    })
    return out
  }, [tokoh, data])

  if (!data) return null
  if (tokoh.length < 2) {
    return (
      <div className="plan-empty">
        <span className="plan-empty-title">Butuh minimal dua tokoh</span>
        <span>Tambahkan tokoh di mode Dunia, lalu kembali ke sini untuk menghubungkan mereka.</span>
      </div>
    )
  }
  const nameOf = (id: string) => entryName(tokoh.find((t) => entryId(t) === id) ?? tokoh[0])
  const idOf = (name: string) => entryId(tokoh.find((t) => entryName(t) === name)!)

  const toSvg = (e: PointerEvent) => {
    const pt = svgRef.current!.createSVGPoint()
    pt.x = e.clientX; pt.y = e.clientY
    const r = pt.matrixTransform(svgRef.current!.getScreenCTM()!.inverse())
    return { x: Math.max(R, Math.min(W - R, r.x)), y: Math.max(R, Math.min(H - R - 18, r.y)) }
  }
  const onMove = (e: PointerEvent) => {
    const d = dragging.current
    if (!d) return
    d.moved = true
    setData({ ...data, posisi: { ...data.posisi, [d.id]: toSvg(e) } })
  }
  const onUp = () => {
    const d = dragging.current
    dragging.current = null
    justDragged.current = !!d?.moved
    if (d?.moved) save({ ...data, posisi: { ...pos, ...data.posisi } })
  }

  const names = tokoh.map(entryName)
  const add = () => {
    if (!form.dari || !form.ke || form.dari === form.ke || !form.jenis.trim()) return
    save({ ...data, relasi: [...data.relasi, { id: newId(), dari: idOf(form.dari), ke: idOf(form.ke), jenis: form.jenis.trim(), catatan: form.catatan.trim() }] })
    setForm({ dari: form.dari, ke: '', jenis: '', catatan: '' })
  }
  const visible = data.relasi.filter((r) => pos[r.dari] && pos[r.ke])
  const related = (id: string) => !focus || id === focus || visible.some((r) => (r.dari === focus && r.ke === id) || (r.ke === focus && r.dari === id))

  return (
    <div className="rel">
      <div className="rel-canvas">
        <span className="plan-hint rel-hint">Geser lingkaran untuk menata · klik untuk menyorot relasinya · klik dua kali untuk membuka tokoh</span>
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="rel-svg" role="img" aria-label="Peta relasi tokoh"
          onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp} onClick={(e) => { if (e.target === svgRef.current) setFocus(null) }}>
          {visible.map((r) => {
            const a = pos[r.dari], b = pos[r.ke]
            const on = !focus || r.dari === focus || r.ke === focus
            return (
              <g key={r.id} className={'rel-edge' + (on ? '' : ' is-dim')}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
                <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 6} textAnchor="middle">{r.jenis}</text>
                <title>{`${nameOf(r.dari)} — ${r.jenis} — ${nameOf(r.ke)}${r.catatan ? `\n${r.catatan}` : ''}`}</title>
              </g>
            )
          })}
          {tokoh.map((t) => {
            const id = entryId(t)
            const c = pos[id]
            const f = entryFaction(p.bible, t)
            const col = f ? factionColor(f.meta.warna) : null
            const n = entryName(t)
            return (
              <g key={id} className={'rel-node' + (related(id) ? '' : ' is-dim') + (focus === id ? ' is-focus' : '')}
                transform={`translate(${c.x} ${c.y})`} tabIndex={0} role="button" aria-label={`${n}${f ? `, ${entryName(f)}` : ''}`}
                onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); dragging.current = { id, moved: false } }}
                onClick={() => { if (justDragged.current) { justDragged.current = false; return } setFocus(focus === id ? null : id) }}
                onDoubleClick={() => openEntry(id)}
                onKeyDown={(e) => { if (e.key === 'Enter') openEntry(id) }}>
                <circle r={R} style={{ fill: col?.card ?? 'var(--ink-card)', stroke: col?.text ?? 'var(--gold)' }} />
                <text className="rel-initial" y={7} textAnchor="middle" style={{ fill: col?.text ?? 'var(--gold)' }}>{n.charAt(0).toUpperCase()}</text>
                <text className="rel-name" y={R + 18} textAnchor="middle">{n.length > 18 ? n.slice(0, 17) + '…' : n}</text>
              </g>
            )
          })}
        </svg>
      </div>

      <aside className="rel-side">
        <span className="label">Tambah relasi</span>
        <div className="rel-form">
          <Select value={form.dari} options={['', ...names]} label={(v) => v || 'Tokoh…'} onChange={(v) => setForm({ ...form, dari: v })} aria-label="Dari tokoh" />
          <Combo value={form.jenis} options={KINDS} placeholder="Relasi, mis. saudara" onChange={(v) => setForm({ ...form, jenis: v })} aria-label="Jenis relasi" />
          <Select value={form.ke} options={['', ...names.filter((n) => n !== form.dari)]} label={(v) => v || 'dengan tokoh…'} onChange={(v) => setForm({ ...form, ke: v })} aria-label="Ke tokoh" />
          <input className="input" value={form.catatan} placeholder="Catatan (opsional)" onChange={(e) => setForm({ ...form, catatan: e.target.value })} aria-label="Catatan relasi" />
          <button className="btn btn-primary btn-sm" onClick={add} disabled={!form.dari || !form.ke || !form.jenis.trim()}>Tambah</button>
        </div>
        <span className="label">Relasi ({visible.length})</span>
        <ul className="rel-list">
          {visible.length === 0 && <li className="rel-none">Belum ada relasi.</li>}
          {visible.map((r) => (
            <li key={r.id} className={focus && r.dari !== focus && r.ke !== focus ? 'is-dim' : ''}>
              <span><b>{nameOf(r.dari)}</b> — {r.jenis} — <b>{nameOf(r.ke)}</b>{r.catatan && <small>{r.catatan}</small>}</span>
              <button aria-label="Hapus relasi" title="Hapus relasi" onClick={() => save({ ...data, relasi: data.relasi.filter((x) => x !== r) })}>×</button>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  )
}
