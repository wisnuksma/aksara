import { useEffect } from 'react'
import { EditorContent, useEditor, useEditorState, type Editor as TEditor } from '@tiptap/react'
import { Placeholder } from '@tiptap/extensions'
import { editorExtensions } from '../lib/editorExtensions'
import { countWords } from '../lib/words'
import Select from './Select'
import './editor.css'

interface Props {
  markdown: string
  heading: string       // "Bab 1 · Adegan 2"
  title: string         // judul adegan
  zoom: number
  onZoom: (z: number) => void
  /** Dipanggil setiap isi berubah, dengan jumlah kata terbaru. */
  onChange: (words: number) => void
  /** Memberi fungsi untuk mengambil isi sebagai Markdown (dipakai saat menyimpan). */
  onReady: (getMarkdown: () => string) => void
}

export const editorWords = (e: TEditor) => countWords(e.getText({ blockSeparator: '\n' }))

export default function Editor({ markdown, heading, title, zoom, onZoom, onChange, onReady }: Props) {
  const editor = useEditor({
    extensions: [...editorExtensions, Placeholder.configure({ placeholder: 'Mulai menulis di sini…' })],
    content: markdown,
    contentType: 'markdown',
    autofocus: 'end',
    editorProps: { attributes: { class: 'manuscript', spellcheck: 'true', lang: 'id', 'aria-label': `Naskah: ${title}` } },
    onUpdate: ({ editor }) => onChange(editorWords(editor)),
  })

  useEffect(() => {
    if (editor) onReady(() => editor.getMarkdown())
  }, [editor, onReady])

  return (
    <div className="editor-column">
      {editor && <Toolbar editor={editor} zoom={zoom} onZoom={onZoom} />}
      <div className="page-scroller">
        <article className="page" style={{ zoom: zoom / 100 }}>
          <span className="page-heading">{heading}</span>
          <h1 className="page-title">{title}</h1>
          <EditorContent editor={editor} />
        </article>
      </div>
    </div>
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
      <span className="tb-static tb-font" title="Font naskah">Literata</span>
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
