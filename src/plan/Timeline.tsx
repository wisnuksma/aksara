import { useEffect, useRef, useState } from 'react'
import Combo from '../components/Combo'
import Confirm from '../components/Confirm'
import { entryName } from '../lib/bible'
import { loadTimeline, newId, saveTimeline, type TimelineEvent } from '../lib/plan'
import { chapterLabel, sceneId, type Project } from '../lib/project'

interface Props {
  project: Project
  openSceneById: (id: string) => void
  onError: (msg: string) => void
}

/** Timeline peristiwa cerita (urutan kronologis di dunia cerita). */
export default function Timeline({ project: p, openSceneById, onError }: Props) {
  const [events, setEvents] = useState<TimelineEvent[] | null>(null)
  const [del, setDel] = useState<TimelineEvent | null>(null)
  const [drag, setDrag] = useState<number | null>(null)
  const [dropAt, setDropAt] = useState<number | null>(null)
  const [focusId, setFocusId] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const latest = useRef<TimelineEvent[]>([])

  useEffect(() => { loadTimeline(p.root).then((e) => { setEvents(e); latest.current = e }) }, [p])
  // simpan saat keluar dari tampilan ini
  useEffect(() => () => { if (timer.current) { window.clearTimeout(timer.current); saveTimeline(p.root, latest.current).catch(() => {}) } }, [p])

  const commit = (next: TimelineEvent[], now = false) => {
    setEvents(next)
    latest.current = next
    window.clearTimeout(timer.current)
    const save = () => { timer.current = undefined; saveTimeline(p.root, latest.current).catch(() => onError('Gagal menyimpan timeline.')) }
    if (now) save(); else timer.current = window.setTimeout(save, 700)
  }

  const scenes = p.chapters.flatMap((c) => c.scenes.map((s) => ({ id: sceneId(c, s), label: `${chapterLabel(p, c)} · ${String(s.meta.judul || '')}` })))
  const sceneLabel = (id: string) => scenes.find((x) => x.id === id)?.label ?? 'Adegan dihapus'
  const tokoh = p.bible.tokoh.map(entryName)

  if (!events) return null
  const update = (i: number, patch: Partial<TimelineEvent>) => commit(events.map((e, j) => (j === i ? { ...e, ...patch } : e)))
  const move = (from: number, to: number) => {
    if (to < 0 || to >= events.length || from === to) return
    const next = [...events]
    const [x] = next.splice(from, 1)
    next.splice(to, 0, x)
    commit(next, true)
  }
  const add = () => {
    const e: TimelineEvent = { id: newId(), waktu: '', judul: '', deskripsi: '', adegan: [], tokoh: [] }
    commit([...events, e], true)
    setFocusId(e.id)
  }

  return (
    <div className="tl">
      <div className="plan-bar">
        <span className="plan-hint">Urutan kejadian di dunia cerita — boleh berbeda dengan urutan bab. Geser ⠿ untuk mengurutkan.</span>
        <button className="btn btn-primary btn-sm" onClick={add}>+ Peristiwa</button>
      </div>
      {events.length === 0 ? (
        <div className="plan-empty">
          <span className="plan-empty-title">Belum ada peristiwa</span>
          <span>Catat kejadian penting dunia ceritamu — perang lama, kelahiran tokoh, hari surat dari Navea tiba — lalu hubungkan ke adegan.</span>
          <button className="btn btn-primary" onClick={add}>Tambah peristiwa pertama</button>
        </div>
      ) : (
        <ol className="tl-list">
          {events.map((e, i) => (
            <li key={e.id} className={'tl-item' + (drag === i ? ' is-dragging' : '') + (dropAt === i && drag !== null && drag !== i ? (drag < i ? ' drop-after' : ' drop-before') : '')}
              onDragOver={(ev) => { if (drag === null) return; ev.preventDefault(); setDropAt(i) }}
              onDrop={(ev) => { ev.preventDefault(); if (drag !== null) move(drag, i); setDrag(null); setDropAt(null) }}>
              <div className="tl-rail" aria-hidden="true"><span className="tl-dot" /></div>
              <div className="tl-card">
                <div className="tl-top">
                  <span className="tl-handle" draggable title="Geser untuk mengurutkan"
                    onDragStart={(ev) => { ev.dataTransfer.effectAllowed = 'move'; ev.dataTransfer.setData('text/plain', e.id); setDrag(i) }}
                    onDragEnd={() => { setDrag(null); setDropAt(null) }}>⠿</span>
                  <input className="tl-when" value={e.waktu} placeholder="Kapan? mis. Tahun 312" aria-label="Waktu cerita"
                    onChange={(ev) => update(i, { waktu: ev.target.value })} />
                  <input className="tl-title" value={e.judul} placeholder="Apa yang terjadi?" aria-label="Judul peristiwa"
                    autoFocus={focusId === e.id} onChange={(ev) => update(i, { judul: ev.target.value })} />
                  <div className="tl-tools">
                    <button aria-label="Pindah ke atas" title="Pindah ke atas" onClick={() => move(i, i - 1)} disabled={i === 0}>↑</button>
                    <button aria-label="Pindah ke bawah" title="Pindah ke bawah" onClick={() => move(i, i + 1)} disabled={i === events.length - 1}>↓</button>
                    <button aria-label="Hapus peristiwa" title="Hapus" onClick={() => setDel(e)}>×</button>
                  </div>
                </div>
                <textarea className="tl-desc" rows={2} value={e.deskripsi} placeholder="Keterangan (opsional)" aria-label="Keterangan"
                  onChange={(ev) => update(i, { deskripsi: ev.target.value })} />
                <div className="tl-links">
                  {e.adegan.map((id) => (
                    <span key={id} className="chip tl-scene">
                      <button className="tl-open" onClick={() => openSceneById(id)} title="Buka adegan">{sceneLabel(id)}</button>
                      <button aria-label="Lepas adegan" onClick={() => update(i, { adegan: e.adegan.filter((x) => x !== id) })}>×</button>
                    </span>
                  ))}
                  {e.tokoh.map((t) => (
                    <span key={t} className="chip tl-person">{t}
                      <button aria-label={`Lepas ${t}`} onClick={() => update(i, { tokoh: e.tokoh.filter((x) => x !== t) })}>×</button>
                    </span>
                  ))}
                </div>
                <div className="tl-add">
                  <Combo value="" clearOnPick options={scenes.filter((x) => !e.adegan.includes(x.id)).map((x) => x.label)} placeholder="+ Hubungkan adegan"
                    onChange={(label) => { const s = scenes.find((x) => x.label === label); if (s) update(i, { adegan: [...e.adegan, s.id] }) }} aria-label="Hubungkan adegan" />
                  <Combo value="" clearOnPick options={tokoh.filter((t) => !e.tokoh.includes(t))} placeholder="+ Tokoh"
                    onChange={(t) => { if (t && !e.tokoh.includes(t)) update(i, { tokoh: [...e.tokoh, t] }) }} aria-label="Tambah tokoh" />
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
      {del && (
        <Confirm danger title="Hapus peristiwa ini?" confirmLabel="Hapus"
          message={`“${del.judul || 'Peristiwa tanpa judul'}” akan dihapus dari timeline. Adegan dan tokoh yang terhubung tidak ikut terhapus.`}
          onConfirm={() => { commit(events.filter((x) => x !== del), true); setDel(null) }} onCancel={() => setDel(null)} />
      )}
    </div>
  )
}
