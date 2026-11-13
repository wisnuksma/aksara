import { useCallback, useEffect, useMemo, useState } from 'react'
import { diffWordsWithSpace } from 'diff'
import { listSnapshots, readSnapshot, type SnapshotInfo } from '../lib/snapshots'
import { markdownToJson } from '../lib/convert'
import { countMarkdownWords } from '../lib/words'
import type { Project, Scene } from '../lib/project'
import type { JSONContent } from '@tiptap/core'
import Confirm from './Confirm'
import './snapshots.css'

const KIND_LABEL: Record<string, string> = { otomatis: 'Otomatis', manual: 'Disimpan manual', 'sebelum-pulih': 'Sebelum dipulihkan', awal: 'Sebelum diubah' }
const fmt = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

interface Props {
  project: Project
  scene: Scene
  /** Berubah setiap ada snapshot baru → daftar dimuat ulang. */
  refresh: number
  getCurrent: () => string
  onSaveManual: (label: string) => Promise<void>
  onRestore: (body: string) => Promise<void>
}

export default function Snapshots({ project: p, scene, refresh, getCurrent, onSaveManual, onRestore }: Props) {
  const [list, setList] = useState<SnapshotInfo[] | null>(null)
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [compare, setCompare] = useState<{ info: SnapshotInfo; body: string } | null>(null)

  const load = useCallback(() => {
    listSnapshots(p, scene).then(setList).catch(() => setList([]))
  }, [p, scene])
  useEffect(load, [load, refresh])

  async function save() {
    setBusy(true)
    try { await onSaveManual(label.trim()); setLabel('') } finally { setBusy(false); load() }
  }
  async function open(info: SnapshotInfo) {
    setCompare({ info, body: await readSnapshot(p, scene, info.file) })
  }

  return (
    <div className="snaps">
      <div className="snaps-head">
        <span className="insp-label">Versi adegan</span>
        <span className="snaps-count">{list ? `${list.length} tersimpan` : ''}</span>
      </div>
      <div className="snaps-save">
        <input className="input" value={label} placeholder="Catatan versi (opsional)" maxLength={80}
          onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save() }} aria-label="Catatan versi" />
        <button className="btn btn-primary btn-sm" onClick={save} disabled={busy}>Simpan versi</button>
      </div>
      {list && list.length === 0 && (
        <p className="snaps-empty">Belum ada versi. Versi otomatis dibuat setiap kali Anda pindah adegan setelah mengubahnya.</p>
      )}
      <ul className="snaps-list">
        {list?.map((s) => (
          <li key={s.file}>
            <button className="snap" onClick={() => open(s)} title="Bandingkan dengan sekarang">
              <span className={'snap-dot snap-' + s.kind} aria-hidden="true" />
              <span className="snap-text">
                <span className="snap-date">{fmt.format(s.date)}</span>
                <span className="snap-kind">{s.label || KIND_LABEL[s.kind] || s.kind}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {compare && (
        <CompareDialog title={String(scene.meta.judul || 'Adegan')} info={compare.info} oldBody={compare.body} newBody={getCurrent()}
          onClose={() => setCompare(null)}
          onRestore={async () => { await onRestore(compare.body); setCompare(null); load() }} />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

/** Markdown -> teks biasa per paragraf (untuk dibandingkan). */
function plain(md: string): string {
  const out: string[] = []
  const walk = (n: JSONContent): string => (n.text ?? '') + (n.content ?? []).map(walk).join('')
  for (const b of markdownToJson(md).content ?? []) out.push(b.type === 'horizontalRule' ? '* * *' : walk(b))
  return out.join('\n\n').trim()
}

type Part = { value: string; added?: boolean; removed?: boolean }
type Seg = { value: string; marked: boolean }

/** Isi satu kolom: bagian yang ditandai (dihapus/ditambah) digabung bila hanya dipisah spasi. */
function column(parts: Part[], side: 'removed' | 'added'): Seg[] {
  const segs: Seg[] = parts
    .filter((x) => (side === 'removed' ? !x.added : !x.removed))
    .map((x) => ({ value: x.value, marked: !!x[side] }))
  const out: Seg[] = []
  for (let i = 0; i < segs.length; i++) {
    const cur = segs[i]
    const prev = out[out.length - 1]
    const bridge = !cur.marked && /^[ \t]+$/.test(cur.value) && prev?.marked && segs[i + 1]?.marked
    if (prev && prev.marked && (cur.marked || bridge)) prev.value += cur.value
    else out.push({ ...cur })
  }
  return out
}

function CompareDialog({ title, info, oldBody, newBody, onClose, onRestore }: {
  title: string; info: SnapshotInfo; oldBody: string; newBody: string; onClose: () => void; onRestore: () => void
}) {
  const [confirm, setConfirm] = useState(false)
  const parts = useMemo(() => diffWordsWithSpace(plain(oldBody), plain(newBody)), [oldBody, newBody])
  const same = parts.every((x) => !x.added && !x.removed)
  const added = parts.filter((x) => x.added).reduce((n, x) => n + countMarkdownWords(x.value), 0)
  const removed = parts.filter((x) => x.removed).reduce((n, x) => n + countMarkdownWords(x.value), 0)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !confirm) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [confirm, onClose])

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog compare" role="dialog" aria-modal="true" aria-labelledby="cmp-title">
        <div className="dialog-head">
          <h1 id="cmp-title">Bandingkan versi</h1>
          <p>{title} · versi {fmt.format(info.date)}{info.label ? ` (“${info.label}”)` : ''} dibandingkan dengan sekarang</p>
        </div>
        <div className="compare-legend">
          {same ? <span>Tidak ada perbedaan.</span> : <>
            <span><mark className="d-del">dihapus</mark> {removed} kata</span>
            <span><mark className="d-add">ditambah</mark> {added} kata</span>
          </>}
        </div>
        <div className="compare-cols">
          <section>
            <span className="label">Versi {fmt.format(info.date)}</span>
            <div className="compare-text">
              {column(parts, 'removed').map((x, i) => x.marked ? <del key={i} className="d-del">{x.value}</del> : <span key={i}>{x.value}</span>)}
            </div>
          </section>
          <section>
            <span className="label">Sekarang</span>
            <div className="compare-text">
              {column(parts, 'added').map((x, i) => x.marked ? <ins key={i} className="d-add">{x.value}</ins> : <span key={i}>{x.value}</span>)}
            </div>
          </section>
        </div>
        <div className="dialog-foot">
          <button className="btn" onClick={onClose}>Tutup</button>
          <button className="btn btn-primary" disabled={same} onClick={() => setConfirm(true)}>Pulihkan versi ini…</button>
        </div>
      </div>
      {confirm && (
        <Confirm title="Pulihkan versi ini?" confirmLabel="Pulihkan"
          message="Isi adegan sekarang akan diganti dengan versi ini. Isi yang sekarang tidak hilang: Aksara menyimpannya dulu sebagai versi “Sebelum dipulihkan”, jadi bisa dikembalikan kapan saja."
          onConfirm={() => { setConfirm(false); onRestore() }} onCancel={() => setConfirm(false)} />
      )}
    </div>
  )
}
