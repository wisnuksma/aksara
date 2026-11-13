import { useEffect, useRef, useState, type PointerEvent } from 'react'
import Combo from '../components/Combo'
import Confirm from '../components/Confirm'
import { entryId, entryName, findEntry } from '../lib/bible'
import { loadMap, mapImageUrl, newId, saveMap, storeMapImage, type MapFile, type Pin } from '../lib/plan'
import type { Project } from '../lib/project'

interface Props {
  project: Project
  openEntry: (id: string) => void
  onError: (msg: string) => void
}

/** Peta dunia: gambar peta milik penulis + pin yang bisa dihubungkan ke tempat. */
export default function WorldMap({ project: p, openEntry, onError }: Props) {
  const [map, setMap] = useState<MapFile | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [zoom, setZoom] = useState(100)
  const [adding, setAdding] = useState(false)
  const [sel, setSel] = useState<string | null>(null)
  const [del, setDel] = useState<Pin | null>(null)
  const imgRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ id: string; moved: boolean } | null>(null)
  const justDragged = useRef(false)

  useEffect(() => { loadMap(p.root).then(setMap) }, [p])
  useEffect(() => {
    let u: string | null = null
    if (map?.gambar) mapImageUrl(p.root, map.gambar).then((x) => { u = x; setUrl(x) })
    return () => { if (u) URL.revokeObjectURL(u) }
  }, [p, map?.gambar])

  const save = (m: MapFile) => { setMap(m); saveMap(p.root, m).catch(() => onError('Gagal menyimpan peta.')) }

  async function upload() {
    try {
      const w = window as Window & { showOpenFilePicker?: (o: unknown) => Promise<FileSystemFileHandle[]> }
      let file: File | null = null
      if (w.showOpenFilePicker) {
        const [h] = await w.showOpenFilePicker({ types: [{ description: 'Gambar peta', accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp'] } }] })
        file = await h.getFile()
      }
      if (!file) return
      const name = await storeMapImage(p.root, file)
      save({ gambar: name, pin: map?.pin ?? [] })
    } catch (e) {
      if ((e as DOMException).name !== 'AbortError') onError('Gambar tidak bisa disimpan ke folder novel.')
    }
  }

  if (!map) return null
  if (!map.gambar || !url) {
    return (
      <div className="plan-empty">
        <span className="plan-empty-title">Belum ada peta</span>
        <span>Unggah gambar peta duniamu (PNG atau JPG) — hasil gambar tangan yang difoto pun bisa. Gambarnya disalin ke folder <code>peta/</code> di dalam novel.</span>
        <button className="btn btn-primary" onClick={upload}>Unggah gambar peta…</button>
      </div>
    )
  }

  const tempat = p.bible.tempat
  const rel = (e: PointerEvent | React.MouseEvent) => {
    const r = imgRef.current!.getBoundingClientRect()
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) }
  }
  const pinLabel = (pin: Pin) => pin.judul || (pin.entri ? entryName(findEntry(p.bible, pin.entri) ?? tempat[0]) : 'Pin')
  const current = map.pin.find((x) => x.id === sel) ?? null
  const updatePin = (id: string, patch: Partial<Pin>) => save({ ...map, pin: map.pin.map((x) => (x.id === id ? { ...x, ...patch } : x)) })

  return (
    <div className="wmap">
      <div className="plan-bar">
        <button className={'btn btn-sm' + (adding ? ' btn-primary' : '')} onClick={() => setAdding(!adding)} aria-pressed={adding}>
          {adding ? 'Klik di peta untuk menaruh pin…' : '+ Pin'}
        </button>
        <span className="plan-hint">Geser pin untuk memindahkan · klik pin untuk mengubah</span>
        <div className="wmap-zoom">
          <button className="btn btn-sm" onClick={() => setZoom((z) => Math.max(50, z - 25))} aria-label="Perkecil">−</button>
          <span>{zoom}%</span>
          <button className="btn btn-sm" onClick={() => setZoom((z) => Math.min(300, z + 25))} aria-label="Perbesar">+</button>
          <button className="btn btn-sm" onClick={upload}>Ganti gambar…</button>
        </div>
      </div>
      <div className="wmap-scroll" onClick={() => setSel(null)}>
        <div ref={imgRef} className={'wmap-img' + (adding ? ' is-adding' : '')} style={{ width: `${zoom}%` }}
          onClick={(e) => {
            e.stopPropagation()
            if (!adding) { setSel(null); return }
            const { x, y } = rel(e)
            const pin: Pin = { id: newId(), x, y, judul: '', entri: '' }
            save({ ...map, pin: [...map.pin, pin] })
            setAdding(false)
            setSel(pin.id)
          }}
          onPointerMove={(e) => { const d = drag.current; if (!d) return; d.moved = true; const { x, y } = rel(e); setMap({ ...map, pin: map.pin.map((q) => (q.id === d.id ? { ...q, x, y } : q)) }) }}
          onPointerUp={() => { const d = drag.current; drag.current = null; justDragged.current = !!d?.moved; if (d?.moved) save(map) }}>
          <img src={url} alt={`Peta ${p.data.judul}`} draggable={false} />
          {map.pin.map((pin) => (
            <button key={pin.id} className={'wmap-pin' + (sel === pin.id ? ' is-sel' : '')} style={{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%` }}
              aria-label={pinLabel(pin)}
              onPointerDown={(e) => { e.stopPropagation(); (e.target as Element).setPointerCapture?.(e.pointerId); drag.current = { id: pin.id, moved: false } }}
              onClick={(e) => { e.stopPropagation(); if (justDragged.current) { justDragged.current = false; return } setSel(pin.id) }}>
              <svg aria-hidden="true" width="22" height="30" viewBox="0 0 22 30"><path d="M11 29s9-9.6 9-17A9 9 0 0 0 2 12c0 7.4 9 17 9 17z" /><circle cx="11" cy="12" r="3.5" /></svg>
              <span className="wmap-label">{pinLabel(pin)}</span>
            </button>
          ))}
        </div>
      </div>
      {current && (
        <div className="wmap-pop" role="dialog" aria-label="Ubah pin" onClick={(e) => e.stopPropagation()}>
          <span className="label">Pin</span>
          <span className="wmap-field">Nama di peta</span>
          <input className="input" value={current.judul} placeholder="Nama tempat di peta" aria-label="Nama pin" autoFocus
            onChange={(e) => updatePin(current.id, { judul: e.target.value })} />
          <span className="wmap-field">Tempat di story bible</span>
          <Combo value={current.entri ? entryName(findEntry(p.bible, current.entri) ?? tempat[0]) : ''} options={tempat.map(entryName)}
            placeholder={tempat.length ? 'Hubungkan ke tempat…' : 'Belum ada tempat di story bible'}
            onChange={(n) => { const t = tempat.find((x) => entryName(x) === n); updatePin(current.id, { entri: t ? entryId(t) : '' }) }} aria-label="Tempat di story bible" />
          <div className="wmap-pop-actions">
            {current.entri && <button className="btn btn-sm" onClick={() => openEntry(current.entri)}>Buka tempat</button>}
            <button className="btn btn-sm wmap-del" onClick={() => setDel(current)}>Hapus pin</button>
            <button className="btn btn-primary btn-sm" onClick={() => setSel(null)}>Selesai</button>
          </div>
        </div>
      )}
      {del && (
        <Confirm danger title="Hapus pin ini?" confirmLabel="Hapus" message={`Pin “${pinLabel(del)}” akan dihapus dari peta. Gambar peta dan entri tempat tidak ikut terhapus.`}
          onConfirm={() => { save({ ...map, pin: map.pin.filter((x) => x.id !== del.id) }); setDel(null); setSel(null) }} onCancel={() => setDel(null)} />
      )}
    </div>
  )
}
