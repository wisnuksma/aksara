import { entryName, factionColor, KIND_LABEL, type BibleKind } from '../lib/bible'
import type { Project } from '../lib/project'

interface Props {
  project: Project
  onOpen: (kind: BibleKind, file?: string) => void
  onCreate: (kind: BibleKind) => void
}

/** Blok story bible di binder: kartu faksi + jumlah entri, atau ajakan bila kosong. */
export default function BibleSummary({ project: p, onOpen, onCreate }: Props) {
  const b = p.bible
  const total = b.tokoh.length + b.tempat.length + b.faksi.length + b.lore.length
  return (
    <div className="bible-block">
      <span className="binder-label">Story bible</span>
      {total === 0 ? (
        <div className="bible-empty">
          <span>Catat tokoh, tempat, dan faksi dunia ceritamu di sini.</span>
          <div className="bible-chips">
            {(['tokoh', 'tempat', 'faksi'] as BibleKind[]).map((k) => (
              <button key={k} onClick={() => onCreate(k)}>+ {KIND_LABEL[k]}</button>
            ))}
          </div>
        </div>
      ) : (
        <>
          {b.faksi.length > 0 && (
            <div className="bible-factions">
              {b.faksi.slice(0, 4).map((f) => {
                const c = factionColor(f.meta.warna)
                const members = b.tokoh.filter((t) => t.meta.faksi === entryName(f)).length
                const places = b.tempat.filter((t) => t.meta.faksi === entryName(f)).length
                return (
                  <button key={f.file} className="faction-card" style={{ background: c.card }} onClick={() => onOpen('faksi', f.file)}>
                    <span className="faction-name">{entryName(f)}</span>
                    <span className="faction-sub" style={{ color: c.text }}>{members} tokoh{places ? ` · ${places} tempat` : ''}</span>
                  </button>
                )
              })}
            </div>
          )}
          <div className="bible-counts">
            {(['tokoh', 'tempat', 'faksi', 'lore'] as BibleKind[]).map((k) => (
              <button key={k} onClick={() => onOpen(k)}>
                <span>{KIND_LABEL[k]}</span><span className="bible-n">{b[k].length}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
