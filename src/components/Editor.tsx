import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { EditorContent, useEditor, useEditorState, type Editor as TEditor } from '@tiptap/react'
import { Focus, Placeholder } from '@tiptap/extensions'
import { editorExtensions } from '../lib/editorExtensions'
import { BibleHighlight, bibleKey, type Term } from '../lib/bibleHighlight'
import { findText, SuggestHighlight, suggestKey } from '../lib/suggestHighlight'
import { countWords } from '../lib/words'
import Select from './Select'
import './editor.css'

interface Props {
  markdown: string
  heading: string       // "Bab 1 · Adegan 2"
  title: string         // judul adegan (bisa diubah di halaman)
  zoom: number
  /** Mode fokus: toolbar disembunyikan, paragraf lain diredupkan. */
  focusMode?: boolean
  /** Simpan judul adegan baru (diketik langsung di halaman). */
  onRename: (title: string) => void
  /** Nama & alias story bible yang disorot. */
  terms?: Term[]
  /** Isi kartu ringkas untuk sebuah entri. */
  describe?: (id: string) => EntryCard | null
  onOpenEntry?: (id: string) => void
  /** Taruh kursor di akhir naskah saat dibuka (default ya). */
  autoFocus?: boolean
  onZoom: (z: number) => void
  /** Dipanggil setiap isi berubah, dengan jumlah kata terbaru. */
  onChange: (words: number) => void
  /** Memberi fungsi untuk mengambil isi sebagai Markdown (dipakai saat menyimpan). */
  onReady: (api: EditorApi) => void
  /** Saran ejaan dari Asisten (ditandai garis bergelombang). */
  suggestions?: Suggestion[]
  onSuggestionDone?: (id: string) => void
}

export interface Suggestion { id: string; kutipan: string; ganti: string; alasan: string; jenis: string }
export interface EditorApi {
  getMarkdown: () => string
  /** Pilih & gulir ke teks persis di naskah. false bila tidak ditemukan. */
  select: (text: string) => boolean
  /** Ganti teks persis (dipakai saat pengguna menekan Terima). */
  replace: (text: string, by: string) => boolean
}

export const editorWords = (e: TEditor) => countWords(e.getText({ blockSeparator: '\n' }))

export interface EntryCard { name: string; kind: string; sub: string; aliases: string[]; notes: string; color: string; colorDark: string }

export default function Editor({ markdown, heading, title, zoom, focusMode = false, autoFocus = true, terms, describe, onOpenEntry, suggestions, onSuggestionDone, onZoom, onChange, onRename, onReady }: Props) {
  const editor = useEditor({
    extensions: [
      ...editorExtensions,
      Placeholder.configure({ placeholder: 'Mulai menulis di sini…' }),
      Focus.configure({ className: 'has-focus', mode: 'shallowest' }),
      BibleHighlight,
      SuggestHighlight,
    ],
    content: markdown,
    contentType: 'markdown',
    autofocus: autoFocus ? 'end' : false,
    editorProps: { attributes: { class: 'manuscript', spellcheck: 'true', lang: 'id', 'aria-label': `Naskah: ${title}` } },
    onUpdate: ({ editor }) => { const w = editorWords(editor); setEmpty(w === 0); onChange(w) },
  })
  const [empty, setEmpty] = useState(() => !markdown.trim())

  useEffect(() => {
    if (!editor) return
    onReady({
      getMarkdown: () => editor.getMarkdown(),
      select: (text) => {
        const r = findText(editor.state.doc, text)
        if (!r) return false
        editor.chain().focus().setTextSelection(r).scrollIntoView().run()
        return true
      },
      replace: (text, by) => {
        const r = findText(editor.state.doc, text)
        if (!r) return false
        editor.chain().focus().command(({ tr }) => { tr.insertText(by, r.from, r.to); return true }).run()
        return true
      },
    })
  }, [editor, onReady])

  // Tandai saran ejaan terbaru
  useEffect(() => {
    if (editor && !editor.isDestroyed) {
      editor.view.dispatch(editor.state.tr.setMeta(suggestKey, (suggestions ?? []).map((s) => ({ id: s.id, text: s.kutipan }))))
    }
  }, [editor, suggestions])

  // Kartu saran ejaan (klik garis bergelombang)
  const [sug, setSug] = useState<{ id: string; x: number; y: number; below: boolean } | null>(null)
  const sugInfo = sug ? suggestions?.find((s) => s.id === sug.id) : undefined
  const acceptSug = (s: Suggestion) => {
    if (editor) {
      const r = findText(editor.state.doc, s.kutipan)
      if (r) editor.chain().focus().command(({ tr }) => { tr.insertText(s.ganti, r.from, r.to); return true }).run()
    }
    setSug(null)
    onSuggestionDone?.(s.id)
  }

  // Kirim daftar nama terbaru ke penyorot
  useEffect(() => {
    if (editor && !editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta(bibleKey, terms ?? []))
  }, [editor, terms])

  // ----- Kartu ringkas saat kursor mouse di atas nama -----
  const [card, setCard] = useState<{ id: string; x: number; y: number; below: boolean } | null>(null)
  const showT = useRef<number | undefined>(undefined)
  const hideT = useRef<number | undefined>(undefined)
  const onOver = (ev: React.MouseEvent) => {
    const el = (ev.target as HTMLElement).closest<HTMLElement>('.bible-link')
    if (!el) return
    window.clearTimeout(hideT.current)
    window.clearTimeout(showT.current)
    showT.current = window.setTimeout(() => {
      const r = el.getBoundingClientRect()
      const below = r.top < 220
      setCard({ id: el.dataset.entry!, x: Math.min(r.left, window.innerWidth - 300), y: below ? r.bottom + 8 : r.top - 8, below })
    }, 280)
  }
  const onOut = (ev: React.MouseEvent) => {
    if (!(ev.target as HTMLElement).closest('.bible-link')) return
    window.clearTimeout(showT.current)
    hideT.current = window.setTimeout(() => setCard(null), 220)
  }
  const onClickLink = (ev: React.MouseEvent) => {
    const sm = (ev.target as HTMLElement).closest<HTMLElement>('.spell-mark')
    if (sm) {
      const r = sm.getBoundingClientRect()
      const below = r.top < 260
      setSug({ id: sm.dataset.sug!, x: Math.min(r.left, window.innerWidth - 300), y: below ? r.bottom + 8 : r.top - 8, below })
      setCard(null)
      return
    }
    const el = (ev.target as HTMLElement).closest<HTMLElement>('.bible-link')
    if (el && (ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); setCard(null); onOpenEntry?.(el.dataset.entry!) }
  }
  const info = card && describe ? describe(card.id) : null

  return (
    <div className={'editor-column' + (focusMode ? ' is-focus' : '')}>
      {editor && !focusMode && <Toolbar editor={editor} zoom={zoom} onZoom={onZoom} />}
      <div className="page-scroller" onMouseOver={onOver} onMouseOut={onOut} onClick={onClickLink}
        onScroll={() => { setCard(null); setSug(null) }}>
        <article className="page" style={{ zoom: zoom / 100 }}>
          <span className="page-heading">{heading}</span>
          <TitleInput value={title} onRename={onRename} onEnter={() => editor?.commands.focus('start')} />
          <EditorContent editor={editor} />
        </article>
        {empty && !focusMode && (
          <div className="page-hints" aria-label="Pintasan">
            <span><kbd>⌘N</kbd> adegan baru</span>
            <span><kbd>⌘.</kbd> mode fokus</span>
            <span><kbd>---</kbd> pemisah adegan</span>
          </div>
        )}
      </div>
      {sugInfo && sug && (
        <div className={'entry-card sug-card' + (sug.below ? ' is-below' : '')} role="dialog" aria-label="Saran ejaan"
          style={{ left: sug.x, top: sug.y }}>
          <span className="sug-kind">{sugInfo.jenis === 'kalimat' ? 'Kalimat' : 'Ejaan'}</span>
          <div className="sug-change"><s>{sugInfo.kutipan}</s><span aria-hidden="true">→</span><b>{sugInfo.ganti}</b></div>
          <p className="sug-why">{sugInfo.alasan}</p>
          <div className="sug-actions">
            <button className="sug-accept" onClick={() => acceptSug(sugInfo)}>Terima</button>
            <button className="sug-ignore" onClick={() => { setSug(null); onSuggestionDone?.(sugInfo.id) }}>Abaikan</button>
          </div>
        </div>
      )}
      {info && card && (
        <div className={'entry-card' + (card.below ? ' is-below' : '')} role="tooltip"
          style={{ left: card.x, top: card.y, ['--lk' as string]: info.color, ['--lk-d' as string]: info.colorDark }}
          onMouseEnter={() => window.clearTimeout(hideT.current)}
          onMouseLeave={() => { hideT.current = window.setTimeout(() => setCard(null), 220) }}>
          <span className="entry-card-kind">{info.kind}{info.sub ? ` · ${info.sub}` : ''}</span>
          <span className="entry-card-name">{info.name}</span>
          {info.aliases.length > 0 && <span className="entry-card-alias">Juga disebut: {info.aliases.join(', ')}</span>}
          {info.notes && <p className="entry-card-notes">{info.notes}</p>}
          <div className="entry-card-foot">
            <span>⌘-klik nama untuk membuka</span>
            <button onClick={() => { const id = card.id; setCard(null); onOpenEntry?.(id) }}>Buka</button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Judul adegan yang bisa diketik langsung di halaman. */
function TitleInput({ value, onRename, onEnter }: { value: string; onRename: (t: string) => void; onEnter: () => void }) {
  const [v, setV] = useState(value)
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => setV(value), [value])
  // Tinggi menyesuaikan isi (judul panjang turun ke baris berikutnya)
  useEffect(() => {
    const el = ref.current
    if (el) { el.style.height = '0'; el.style.height = el.scrollHeight + 'px' }
  }, [v])
  const commit = () => {
    const t = v.replace(/\s+/g, ' ').trim()
    if (!t) { setV(value); return }
    if (t !== value) onRename(t)
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); onEnter() }
    if (e.key === 'Escape') { e.preventDefault(); setV(value); ref.current?.blur() }
  }
  return (
    <textarea ref={ref} className="page-title" rows={1} value={v} placeholder="Judul adegan" aria-label="Judul adegan"
      maxLength={120} spellCheck={false}
      onChange={(e) => setV(e.target.value.replace(/\n/g, ' '))} onBlur={commit} onKeyDown={onKey} />
  )
}

const STYLES = ['p', 'h1', 'h2', 'h3']
const STYLE_LABEL: Record<string, string> = { p: 'Teks normal', h1: 'Judul 1', h2: 'Judul 2', h3: 'Judul 3' }
const ZOOMS = ['75', '90', '100', '110', '125', '150']

function Toolbar({ editor, zoom, onZoom }: { editor: TEditor; zoom: number; onZoom: (z: number) => void }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
      style: e.isActive('heading', { level: 1 }) ? 'h1' : e.isActive('heading', { level: 2 }) ? 'h2' : e.isActive('heading', { level: 3 }) ? 'h3' : 'p',
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      align: (['center', 'right', 'justify'] as const).find((a) => e.isActive({ textAlign: a })) ?? 'left',
    }),
  })
  const run = () => editor.chain().focus()
  const setStyle = (v: string) => {
    if (v === 'p') run().setParagraph().run()
    else run().setHeading({ level: Number(v[1]) as 1 | 2 | 3 }).run()
  }
  const btn = (label: string, active: boolean, onClick: () => void, child: React.ReactNode, extra = '', disabled = false) => (
    <button type="button" aria-label={label} title={label} aria-pressed={active}
      className={'tb-btn ' + extra + (active ? ' is-active' : '')}
      onMouseDown={(e) => e.preventDefault()} onClick={onClick} disabled={disabled}>{child}</button>
  )
  const icon = (d: string) => (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
  )

  return (
    <div className="toolbar" role="toolbar" aria-label="Format teks">
      {btn('Urungkan (⌘Z)', false, () => run().undo().run(), icon('M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3'), '', !s.canUndo)}
      {btn('Ulangi (⇧⌘Z)', false, () => run().redo().run(), icon('M15 14l5-5-5-5M20 9H9a5 5 0 0 0 0 10h3'), '', !s.canRedo)}
      <span className="tb-sep" aria-hidden="true" />
      <Select className="tb-select tb-style" value={s.style} options={STYLES} label={(v) => STYLE_LABEL[v]} onChange={setStyle} aria-label="Gaya paragraf" />
      <span className="tb-static tb-font" title="Font naskah">Lora</span>
      <span className="tb-static tb-size" title="Ukuran huruf">17</span>
      <span className="tb-sep" aria-hidden="true" />
      {btn('Tebal (⌘B)', s.bold, () => run().toggleBold().run(), <b>B</b>, 'tb-b')}
      {btn('Miring (⌘I)', s.italic, () => run().toggleItalic().run(), <i>I</i>, 'tb-i')}
      {btn('Garis bawah (⌘U)', s.underline, () => run().toggleUnderline().run(), <u>U</u>, 'tb-u')}
      <span className="tb-sep" aria-hidden="true" />
      {btn('Rata kiri', s.align === 'left', () => run().setTextAlign('left').run(), icon('M4 6h16M4 12h10M4 18h14'))}
      {btn('Rata tengah', s.align === 'center', () => run().setTextAlign('center').run(), icon('M4 6h16M7 12h10M5 18h14'))}
      {btn('Rata kanan', s.align === 'right', () => run().setTextAlign('right').run(), icon('M4 6h16M10 12h10M6 18h14'))}
      {btn('Rata kiri kanan', s.align === 'justify', () => run().setTextAlign('justify').run(), icon('M4 6h16M4 12h16M4 18h16'))}
      <span className="tb-flex" />
      <Select className="tb-select tb-zoom" value={String(zoom)} options={ZOOMS} label={(v) => v + '%'} onChange={(v) => onZoom(Number(v))} aria-label="Perbesaran" />
    </div>
  )
}
