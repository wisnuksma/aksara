import { useMemo, useState, type DragEvent } from 'react'
import { chapterLabel, sceneId, type Chapter, type Project, type Scene } from '../lib/project'
import { formatNumber } from '../lib/recent'
import type { FrontMatter } from '../lib/frontmatter'
import Select from '../components/Select'

const STATUS: Record<string, string> = { ide: 'Ide', draf: 'Draf', revisi: 'Revisi', selesai: 'Selesai' }

interface Props {
  project: Project
  activeId: string | null
  openScene: (c: Chapter, s: Scene) => void
  addScene: (c: Chapter) => void
  moveScene: (src: Chapter, s: Scene, dst: Chapter, index: number) => void
  updateMeta: (c: Chapter, s: Scene, patch: FrontMatter) => void
}

/** Papan plot: kolom per bab, kartu per adegan (seperti papan gabus). */
export default function Corkboard({ project: p, activeId, openScene, addScene, moveScene, updateMeta }: Props) {
  const [drag, setDrag] = useState<{ c: Chapter; s: Scene } | null>(null)
  const [drop, setDrop] = useState<{ c: Chapter; index: number } | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [alur, setAlur] = useState('')
  const alurs = useMemo(() => {
    const set = new Set<string>()
    for (const c of p.chapters) for (const s of c.scenes) if (s.meta.alur) set.add(String(s.meta.alur))
    return [...set]
  }, [p, p.chapters.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const over = (e: DragEvent, c: Chapter, index: number) => {
    if (!drag) return
    e.preventDefault()
    e.stopPropagation()
    setDrop({ c, index })
  }
  const dropHere = (e: DragEvent) => {
    e.preventDefault()
    if (drag && drop) moveScene(drag.c, drag.s, drop.c, drop.index)
    setDrag(null); setDrop(null)
  }

  return (
    <div className="cork">
      <div className="plan-bar">
        <span className="plan-hint">Geser kartu untuk mengurutkan · klik untuk membuka · klik dua kali sinopsis untuk mengubah</span>
        {alurs.length > 0 && (
          <div className="plan-filter">
            <span>Alur</span>
            <Select className="tb-select" value={alur} options={['', ...alurs]} label={(v) => v || 'Semua'} onChange={setAlur} aria-label="Saring alur" />
          </div>
        )}
        <div className="cork-legend" aria-label="Warna status">
          {Object.entries(STATUS).map(([k, v]) => <span key={k}><i className={'st-dot st-' + k} />{v}</span>)}
        </div>
      </div>
      <div className="cork-cols">
        {p.chapters.map((c) => {
          const words = c.scenes.reduce((n, s) => n + s.words, 0)
          return (
            <section key={c.folder} className="cork-col" onDragOver={(e) => over(e, c, c.scenes.length)} onDrop={dropHere}>
              <header className="cork-head">
                <span className="cork-num">{chapterLabel(p, c)}</span>
                {c.judul.toLowerCase() !== chapterLabel(p, c).toLowerCase() && <span className="cork-title">{c.judul}</span>}
                <span className="cork-words">{c.scenes.length} adegan · {formatNumber(words)} kata</span>
              </header>
              {c.scenes.map((s, i) => {
                const id = sceneId(c, s)
                const st = String(s.meta.status || 'ide')
                const dim = alur && String(s.meta.alur || '') !== alur
                return (
                  <div key={s.file}>
                    {drop?.c === c && drop.index === i && <div className="cork-drop" />}
                    <article className={'cork-card st-' + st + (id === activeId ? ' is-active' : '') + (dim ? ' is-dim' : '') + (drag?.s === s ? ' is-dragging' : '')}
                      draggable onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id); setDrag({ c, s }) }}
                      onDragEnd={() => { setDrag(null); setDrop(null) }}
                      onDragOver={(e) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); over(e, c, e.clientY < r.top + r.height / 2 ? i : i + 1) }}
                      onDrop={dropHere}>
                      <button className="cork-open" onClick={() => openScene(c, s)}>
                        <span className="cork-scene">{String(s.meta.judul || 'Tanpa judul')}</span>
                      </button>
                      {editing === id ? (
                        <textarea className="cork-syn-edit" autoFocus defaultValue={String(s.meta.sinopsis || '')} aria-label="Sinopsis"
                          onBlur={(e) => { setEditing(null); if (e.target.value !== String(s.meta.sinopsis || '')) updateMeta(c, s, { sinopsis: e.target.value }) }}
                          onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); setEditing(null) } if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) (e.target as HTMLTextAreaElement).blur() }} />
                      ) : (
                        <p className={'cork-syn' + (s.meta.sinopsis ? '' : ' is-empty')} onDoubleClick={() => setEditing(id)} title="Klik dua kali untuk mengubah sinopsis">
                          {String(s.meta.sinopsis || 'Belum ada sinopsis.')}
                        </p>
                      )}
                      <footer className="cork-foot">
                        <span className="cork-status"><i className={'st-dot st-' + st} />{STATUS[st] ?? st}</span>
                        {s.meta.pov ? <span>POV {String(s.meta.pov)}</span> : null}
                        <span className="cork-w">{formatNumber(s.words)} kata</span>
                      </footer>
                    </article>
                  </div>
                )
              })}
              {drop?.c === c && drop.index === c.scenes.length && <div className="cork-drop" />}
              <button className="cork-add" onClick={() => addScene(c)}>+ Adegan</button>
            </section>
          )
        })}
      </div>
    </div>
  )
}
