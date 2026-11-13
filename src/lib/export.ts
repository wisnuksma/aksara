// Ekspor naskah: Word (.docx), PDF (lewat cetak), Markdown.
import type { JSONContent } from '@tiptap/core'
import { chapterLabel, type Project } from './project'
import { markdownToHtml, markdownToJson } from './convert'

export interface ExportOptions {
  titlePage: boolean
  chapterTitles: boolean
  sceneTitles: boolean
}

interface MSScene { title: string; md: string }
interface MSChapter { label: string; title: string; scenes: MSScene[] }

function collect(p: Project): MSChapter[] {
  return p.chapters.map((c) => ({
    label: chapterLabel(p, c),
    title: c.judul.trim(),
    scenes: c.scenes.map((s) => ({ title: String(s.meta.judul || ''), md: s.body })),
  }))
}

/** "Bab 1" + judul bab, tanpa dobel bila judulnya memang "Bab 1". */
const chapterHeading = (ch: MSChapter) =>
  ch.title.toLowerCase() === ch.label.toLowerCase() ? { kicker: '', title: ch.title } : { kicker: ch.label, title: ch.title }

export const safeFileName = (s: string) => s.replace(/[/\\:*?"<>|]/g, '-').trim() || 'Naskah'

// ---------------------------------------------------------------- Markdown
export function toMarkdown(p: Project, o: ExportOptions): string {
  const out: string[] = []
  if (o.titlePage) out.push(`# ${p.data.judul}`, '')
  for (const ch of collect(p)) {
    if (o.chapterTitles) {
      const h = chapterHeading(ch)
      out.push(`## ${h.kicker ? `${h.kicker}: ` : ''}${h.title}`, '')
    }
    ch.scenes.forEach((s, i) => {
      if (o.sceneTitles && s.title) out.push(`### ${s.title}`, '')
      else if (i > 0) out.push('* * *', '')
      out.push(s.md.trim(), '')
    })
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n')
}

// ---------------------------------------------------------------- HTML (cetak/PDF)
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function toPrintHtml(p: Project, o: ExportOptions): string {
  const parts: string[] = []
  if (o.titlePage) parts.push(`<section class="pr-title"><h1>${esc(p.data.judul)}</h1>${p.data.genre ? `<p>${esc(p.data.genre)}</p>` : ''}</section>`)
  for (const ch of collect(p)) {
    parts.push('<section class="pr-chapter">')
    if (o.chapterTitles) {
      const h = chapterHeading(ch)
      parts.push(`<header>${h.kicker ? `<span>${esc(h.kicker)}</span>` : ''}<h2>${esc(h.title)}</h2></header>`)
    }
    ch.scenes.forEach((s, i) => {
      if (o.sceneTitles && s.title) parts.push(`<h3>${esc(s.title)}</h3>`)
      else if (i > 0) parts.push('<p class="pr-sep">*&nbsp;&nbsp;&nbsp;*&nbsp;&nbsp;&nbsp;*</p>')
      parts.push(`<div class="pr-scene">${markdownToHtml(s.md).replace(/<hr\s*\/?>/g, '<p class="pr-sep">*&nbsp;&nbsp;&nbsp;*&nbsp;&nbsp;&nbsp;*</p>')}</div>`)
    })
    parts.push('</section>')
  }
  return parts.join('\n')
}

/** Buka jendela cetak Chrome; pengguna memilih "Simpan sebagai PDF". */
export function printManuscript(p: Project, o: ExportOptions) {
  const root = document.createElement('div')
  root.className = 'print-root'
  root.innerHTML = toPrintHtml(p, o)
  document.body.appendChild(root)
  const prevTitle = document.title
  document.title = safeFileName(p.data.judul) // jadi nama file PDF bawaan
  const done = () => { root.remove(); document.title = prevTitle; window.removeEventListener('afterprint', done) }
  window.addEventListener('afterprint', done)
  setTimeout(() => window.print(), 50)
}

// ---------------------------------------------------------------- Word (.docx)
export async function toDocx(p: Project, o: ExportOptions): Promise<Blob> {
  const d = await import('docx')
  const { AlignmentType, HeadingLevel, Paragraph, TextRun, Document, Packer, PageBreak } = d
  const FONT = 'Lora'
  const align = (a?: string) =>
    a === 'center' ? AlignmentType.CENTER : a === 'right' ? AlignmentType.RIGHT : a === 'justify' ? AlignmentType.JUSTIFIED : AlignmentType.LEFT

  const runs = (content: JSONContent[] = [], extra: { italics?: boolean } = {}) =>
    content.map((n) => {
      if (n.type === 'hardBreak') return new TextRun({ text: '', break: 1 })
      const m = new Set((n.marks ?? []).map((x) => x.type))
      return new TextRun({
        text: n.text ?? '', bold: m.has('bold'), italics: m.has('italic') || extra.italics,
        underline: m.has('underline') ? {} : undefined, strike: m.has('strike'),
      })
    })

  const sep = () => new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 240, after: 240 }, children: [new TextRun('*   *   *')] })

  const body: InstanceType<typeof Paragraph>[] = []
  let firstInSection = true
  const para = (n: JSONContent, italics = false) => {
    const indent = firstInSection ? undefined : { firstLine: 360 }
    firstInSection = false
    body.push(new Paragraph({ alignment: align(n.attrs?.textAlign), indent, children: runs(n.content, { italics }) }))
  }
  const blocks = (doc: JSONContent) => {
    for (const n of doc.content ?? []) {
      if (n.type === 'paragraph') { if (n.content?.length) para(n); else body.push(new Paragraph({ children: [] })) }
      else if (n.type === 'heading') {
        body.push(new Paragraph({ heading: n.attrs?.level === 1 ? HeadingLevel.HEADING_3 : HeadingLevel.HEADING_4, alignment: align(n.attrs?.textAlign), children: runs(n.content) }))
        firstInSection = true
      } else if (n.type === 'horizontalRule') { body.push(sep()); firstInSection = true }
      else if (n.type === 'blockquote') for (const q of n.content ?? []) para(q, true)
    }
  }

  if (o.titlePage) {
    body.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 3600, after: 240 }, heading: HeadingLevel.TITLE, children: [new TextRun({ text: p.data.judul })] }))
    if (p.data.genre) body.push(new Paragraph({ style: 'Subtitle', alignment: AlignmentType.CENTER, children: [new TextRun({ text: p.data.genre, italics: true })] }))
  }
  collect(p).forEach((ch, ci) => {
    if (o.titlePage || ci > 0) body.push(new Paragraph({ children: [new PageBreak()] }))
    if (o.chapterTitles) {
      const h = chapterHeading(ch)
      if (h.kicker) body.push(new Paragraph({ style: 'Subtitle', alignment: AlignmentType.CENTER, spacing: { before: 1200, after: 120 }, children: [new TextRun({ text: h.kicker.toUpperCase(), size: 20, characterSpacing: 60 })] }))
      body.push(new Paragraph({ heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER, spacing: { before: h.kicker ? 0 : 1200, after: 600 }, children: [new TextRun(h.title)] }))
    }
    ch.scenes.forEach((s, i) => {
      if (o.sceneTitles && s.title) body.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(s.title)] }))
      else if (i > 0) body.push(sep())
      firstInSection = true
      blocks(markdownToJson(s.md))
    })
  })

  const doc = new Document({
    creator: 'Aksara',
    title: p.data.judul,
    styles: {
      default: { document: { run: { font: FONT, size: 24 }, paragraph: { spacing: { line: 360, after: 120 } } } },
      paragraphStyles: [
        { id: 'Title', name: 'Title', basedOn: 'Normal', next: 'Normal', run: { font: FONT, size: 56, bold: true } },
        { id: 'Subtitle', name: 'Subtitle', basedOn: 'Normal', next: 'Normal', run: { font: FONT, size: 22, color: '6E6555' } },
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 36, bold: true } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 28, bold: true }, paragraph: { spacing: { before: 360, after: 120 } } },
        { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', run: { font: FONT, size: 26, bold: true } },
        { id: 'Heading4', name: 'Heading 4', basedOn: 'Normal', next: 'Normal', run: { font: FONT, size: 24, bold: true } },
      ],
    },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } },
      children: body,
    }],
  })
  return Packer.toBlob(doc)
}

// ---------------------------------------------------------------- Simpan file
interface SaveType { description: string; accept: Record<string, string[]> }
export async function saveFile(blob: Blob, name: string, type: SaveType): Promise<boolean> {
  const w = window as Window & { showSaveFilePicker?: (o: unknown) => Promise<FileSystemFileHandle> }
  if (w.showSaveFilePicker) {
    try {
      const h = await w.showSaveFilePicker({ suggestedName: name, startIn: 'documents', types: [type] })
      const s = await h.createWritable()
      await s.write(blob)
      await s.close()
      return true
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return false
      throw e
    }
  }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  return true
}
