import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from 'react'
import { chapterNumber, sceneId, type Chapter, type Project, type Scene } from '../lib/project'
import { formatNumber } from '../lib/recent'
import './binder.css'

type Drag = { kind: 'chapter'; chapter: Chapter } | { kind: 'scene'; chapter: Chapter; scene: Scene }
type Drop = { key: string; pos: 'before' | 'after' | 'inside' }

export interface BinderActions {
  openScene: (c: Chapter, s: Scene) => void
  toggleChapter: (c: Chapter) => void
  addChapter: () => void
  addScene: (c: Chapter) => void
  renameChapter: (c: Chapter, judul: string) => void
  renameScene: (c: Chapter, s: Scene, judul: string) => void
  moveChapter: (from: number, to: number) => void
  moveScene: (src: Chapter, s: Scene, dst: Chapter, index: number) => void
}

interface Props extends BinderActions {
  project: Project
  activeId: string | null
  expanded: Set<string>
  /** Kunci item yang sedang diubah namanya ("ch:<folder>" / "sc:<id>"). */
  editing: string | null
  setEditing: (k: string | null) => void
  busy: boolean
}

const chKey = (c: Chapter) => `ch:${c.folder}`
const scKey = (c: Chapter, s: Scene) => `sc:${sceneId(c, s)}`

export default function Binder(props: Props) {
  const { project: p, activeId, expanded, editing, setEditing, busy } = props
  const [drag, setDrag] = useState<Drag | null>(null)
  const [drop, setDrop] = useState<Drop | null>(null)
  const [menu, setMenu] = useState<string | null>(null)
  const perChapterTarget = p.data.target_kata && p.chapters.length ? p.data.target_kata / p.chapters.length : 0
  const chapterWords = (c: Chapter) => c.scenes.reduce((n, s) => n + s.words, 0)
  /** Label kecil "Bab 2" di atas nama bab, hanya bila namanya bukan "Bab 2" itu sendiri. */
  const caption = (c: Chapter) => {
    const n = chapterNumber(p, c)
    if (n == null || c.judul.trim().toLowerCase() === `bab ${n}`) return null
    return `Bab ${n}`
  }

  const half = (e: DragEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    return e.clientY < r.top + r.height / 2 ? 'before' : 'after'
  }
  const endDrag = () => { setDrag(null); setDrop(null) }

  // ----- Bab sebagai sasaran -----
  function overChapter(e: DragEvent, c: Chapter) {
    if (!drag) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (drag.kind === 'chapter') setDrop({ key: chKey(c), pos: half(e) })
    else setDrop({ key: chKey(c), pos: 'inside' })
  }
  function dropOnChapter(e: DragEvent, c: Chapter, ci: number) {
    e.preventDefault()
    if (!drag || !drop) return endDrag()
    if (drag.kind === 'chapter') {
      const from = p.chapters.indexOf(drag.chapter)
      let to = drop.pos === 'after' ? ci + 1 : ci
      if (from < to) to--
      if (from !== to) props.moveChapter(from, to)
    } else {
      // Adegan dijatuhkan ke judul bab: taruh di akhir bab itu
      if (drag.chapter !== c || c.scenes[c.scenes.length - 1] !== drag.scene) {
        props.moveScene(drag.chapter, drag.scene, c, c.scenes.length)
      }
    }
    endDrag()
  }

  // ----- Adegan sebagai sasaran -----
  function overScene(e: DragEvent, c: Chapter, s: Scene) {
    if (!drag || drag.kind !== 'scene') return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    setDrop({ key: scKey(c, s), pos: half(e) })
  }
  function dropOnScene(e: DragEvent, c: Chapter, si: number) {
    e.preventDefault()
    e.stopPropagation()
    if (!drag || drag.kind !== 'scene' || !drop) return endDrag()
    props.moveScene(drag.chapter, drag.scene, c, drop.pos === 'after' ? si + 1 : si)
    endDrag()
  }

  const dropClass = (key: string) => (drop?.key === key ? ` drop-${drop.pos}` : '')

  return (
    <div className="binder-section">
      <span className="binder-label">Naskah</span>
      {p.chapters.map((c, ci) => {
        const open = expanded.has(c.folder)
        const isCurrent = c.scenes.some((s) => sceneId(c, s) === activeId)
        const w = chapterWords(c)
        const key = chKey(c)
        return (
          <div key={c.folder}
            className={'chapter' + (open ? ' is-open' : '') + (isCurrent ? ' is-current' : '') + (drag?.kind === 'chapter' && drag.chapter === c ? ' is-dragging' : '')}>
            <div className={'chapter-row' + dropClass(key)}
              onDragOver={(e) => overChapter(e, c)}
              onDragLeave={() => setDrop((d) => (d?.key === key ? null : d))}
              onDrop={(e) => dropOnChapter(e, c, ci)}>
              {editing === key ? (
                <InlineEdit className="chapter-edit" value={c.judul} label="Nama bab"
                  onDone={(v) => { setEditing(null); if (v && v !== c.judul) props.renameChapter(c, v) }} />
              ) : (
                <button className={'chapter-head' + (caption(c) ? ' has-caption' : '')} aria-expanded={open}
                  draggable={!busy}
                  onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', c.judul); setDrag({ kind: 'chapter', chapter: c }) }}
                  onDragEnd={endDrag}
                  onClick={() => props.toggleChapter(c)}
                  onDoubleClick={() => setEditing(key)}
                  title={`${c.judul}\nKlik untuk buka/tutup · klik dua kali untuk ubah nama · geser untuk mengurutkan`}>
                  <span className="chapter-text">
                    {caption(c) && <span className="chapter-num">{caption(c)}</span>}
                    <span className="chapter-name">{c.judul}</span>
                  </span>
                  <span className="chapter-words">{w ? formatNumber(w) : '—'}</span>
                </button>
              )}
              <RowMenu id={key} open={menu === key} setOpen={(o) => setMenu(o ? key : null)} items={[
                { label: 'Ubah nama', run: () => setEditing(key) },
                { label: 'Tambah adegan', run: () => props.addScene(c) },
                { label: 'Pindah ke atas', run: () => props.moveChapter(ci, ci - 1), disabled: ci === 0 || busy },
                { label: 'Pindah ke bawah', run: () => props.moveChapter(ci, ci + 1), disabled: ci === p.chapters.length - 1 || busy },
              ]} />
            </div>
            {open && perChapterTarget > 0 && (
              <span className="chapter-progress" aria-hidden="true">
                <span style={{ width: `${Math.min(100, (w / perChapterTarget) * 100)}%` }} />
              </span>
            )}
            {open && (
              <ul className="scene-list">
                {c.scenes.map((s, si) => {
                  const id = sceneId(c, s)
                  const k = scKey(c, s)
                  return (
                    <li key={s.file} className={'scene-row' + dropClass(k) + (drag?.kind === 'scene' && drag.scene === s ? ' is-dragging' : '')}
                      onDragOver={(e) => overScene(e, c, s)}
                      onDragLeave={() => setDrop((d) => (d?.key === k ? null : d))}
                      onDrop={(e) => dropOnScene(e, c, si)}>
                      {editing === k ? (
                        <InlineEdit className="scene-edit" value={String(s.meta.judul || '')} label="Nama adegan"
                          onDone={(v) => { setEditing(null); if (v && v !== s.meta.judul) props.renameScene(c, s, v) }} />
                      ) : (
                        <button className={'scene' + (id === activeId ? ' is-active' : '')}
                          aria-current={id === activeId ? 'page' : undefined}
                          draggable={!busy}
                          onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(s.meta.judul)); setDrag({ kind: 'scene', chapter: c, scene: s }) }}
                          onDragEnd={endDrag}
                          onClick={() => props.openScene(c, s)}
                          onDoubleClick={() => setEditing(k)}
                          title={`${String(s.meta.judul || s.file)}\nKlik dua kali untuk ubah nama · geser untuk mengurutkan`}>
                          {String(s.meta.judul || s.file)}
                        </button>
                      )}
                      <RowMenu id={k} open={menu === k} setOpen={(o) => setMenu(o ? k : null)} items={[
                        { label: 'Ubah nama', run: () => setEditing(k) },
                        { label: 'Pindah ke atas', run: () => props.moveScene(c, s, c, si - 1), disabled: si === 0 || busy },
                        { label: 'Pindah ke bawah', run: () => props.moveScene(c, s, c, si + 2), disabled: si === c.scenes.length - 1 || busy },
                      ]} />
                    </li>
                  )
                })}
                {c.scenes.length === 0 && <li className="scene-empty">Belum ada adegan</li>}
                <li>
                  <button className="binder-add binder-add-scene" onClick={() => props.addScene(c)} disabled={busy}>
                    <Plus /> Adegan
                  </button>
                </li>
              </ul>
            )}
          </div>
        )
      })}
      <button className="binder-add" onClick={props.addChapter} disabled={busy}>
        <Plus /> Tambah bab
      </button>
    </div>
  )
}

const Plus = () => (
  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
)

function InlineEdit({ value, label, className, onDone }: { value: string; label: string; className: string; onDone: (v: string | null) => void }) {
  const [v, setV] = useState(value)
  const ref = useRef<HTMLInputElement>(null)
  const done = useRef(false)
  useEffect(() => { ref.current?.focus(); ref.current?.select() }, [])
  const finish = (val: string | null) => {
    if (done.current) return
    done.current = true
    onDone(val === null ? null : val.trim() || null)
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); finish(v) }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(null) }
  }
  return (
    <div className="binder-edit">
      <input ref={ref} className={'binder-input ' + className} aria-label={label} value={v} maxLength={120}
        onChange={(e) => setV(e.target.value)} onKeyDown={onKey} onBlur={() => finish(v)} />
      <span className="binder-edit-hint" aria-hidden="true">Enter simpan · Esc batal</span>
    </div>
  )
}

interface MenuItem { label: string; run: () => void; disabled?: boolean }

function RowMenu({ id, open, setOpen, items }: { id: string; open: boolean; setOpen: (o: boolean) => void; items: MenuItem[] }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    ref.current?.querySelector<HTMLButtonElement>('[role=menuitem]:not(:disabled)')?.focus()
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open, setOpen])
  return (
    <div className={'row-menu' + (open ? ' is-open' : '')} ref={ref}>
      <button className="row-menu-btn" aria-label="Pilihan lain" aria-haspopup="menu" aria-expanded={open}
        aria-controls={`menu-${id}`} onClick={() => setOpen(!open)}>
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>
      </button>
      {open && (
        <div className="row-menu-list" role="menu" id={`menu-${id}`}>
          {items.map((it) => (
            <button key={it.label} role="menuitem" disabled={it.disabled}
              onClick={() => { setOpen(false); it.run() }}>{it.label}</button>
          ))}
        </div>
      )}
    </div>
  )
}
