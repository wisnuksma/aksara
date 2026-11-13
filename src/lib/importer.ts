// Impor naskah dari Word (.docx) atau Markdown: dipecah per judul menjadi bab,
// dan per pemisah (* * *, ---, garis) menjadi adegan.
import { htmlToMarkdown } from './convert'
import { countMarkdownWords } from './words'

export interface ImportedScene { judul: string; body: string }
export interface ImportedChapter { judul: string; scenes: ImportedScene[] }
export interface ImportedManuscript { fileName: string; title: string; chapters: ImportedChapter[]; words: number }

/** Paragraf yang hanya berisi tanda pemisah adegan, mis. "* * *", "***", "#", "~". */
const SEPARATOR = /^\s*(?:[*#~•◆◇·-]\s*){1,5}$/

export async function pickManuscriptFile(): Promise<File | null> {
  const w = window as Window & { showOpenFilePicker?: (o: unknown) => Promise<FileSystemFileHandle[]> }
  const accept = {
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    'text/markdown': ['.md', '.markdown'],
    'text/plain': ['.txt'],
  }
  if (w.showOpenFilePicker) {
    try {
      const [h] = await w.showOpenFilePicker({ types: [{ description: 'Naskah (Word / Markdown)', accept }], startIn: 'documents' })
      return await h.getFile()
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return null
      throw e
    }
  }
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.docx,.md,.markdown,.txt'
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.click()
  })
}

/** "Bab 3: Fajar" -> "Fajar" (nomor bab dihitung otomatis oleh Aksara). */
const cleanChapterTitle = (t: string) => {
  const m = /^\s*(?:bab|chapter)\s+(?:\d+|[ivxlcdm]+)\s*[:.\-—–]\s*(.+)$/i.exec(t)
  return m ? m[1].trim() : t
}

export async function parseManuscript(file: File): Promise<ImportedManuscript> {
  const parsed = file.name.toLowerCase().endsWith('.docx')
    ? await fromDocx(await file.arrayBuffer())
    : fromMarkdown(await file.text())
  const chapters = parsed.chapters.length
    ? parsed.chapters.map((c) => ({ ...c, judul: cleanChapterTitle(c.judul) }))
    : [{ judul: 'Bab 1', scenes: [{ judul: 'Adegan 1', body: '' }] }]
  const words = chapters.reduce((n, c) => n + c.scenes.reduce((m, s) => m + countMarkdownWords(s.body), 0), 0)
  return { fileName: file.name, title: parsed.title || file.name.replace(/\.[^.]+$/, ''), chapters, words }
}


type Piece = { kind: 'text'; value: string } | { kind: 'break'; title?: string }

/** Pecah urutan isi menjadi adegan: setiap pemisah/subjudul memulai adegan baru. */
function toScenes(pieces: Piece[], render: (parts: string[]) => string): ImportedScene[] {
  const scenes: ImportedScene[] = []
  let cur: { title: string; parts: string[] } = { title: '', parts: [] }
  const push = () => {
    const body = cur.parts.length ? render(cur.parts).trim() : ''
    if (body || cur.title) scenes.push({ judul: cur.title || `Adegan ${scenes.length + 1}`, body })
  }
  for (const pc of pieces) {
    if (pc.kind === 'break') { push(); cur = { title: pc.title ?? '', parts: [] } }
    else cur.parts.push(pc.value)
  }
  push()
  return scenes.length ? scenes : [{ judul: 'Adegan 1', body: '' }]
}

// ---------------------------------------------------------------- Word
async function fromDocx(buf: ArrayBuffer): Promise<{ title: string; chapters: ImportedChapter[] }> {
  const mammoth = await import('mammoth')
  const { value: html } = await mammoth.convertToHtml(
    { arrayBuffer: buf },
    {
      styleMap: [
        "p[style-name='Title'] => h1.doc-title:fresh", "p[style-name='Judul'] => h1.doc-title:fresh",
        // Label kecil (mis. 'BAB 1', genre di halaman judul) bukan bagian naskah
        "p[style-name='Subtitle'] => !", "p[style-name='Subjudul'] => !",
      ],
    },
  )
  const dom = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  const nodes = [...dom.body.children]

  // Judul dokumen (gaya "Title") jadi judul novel
  let docTitle = ''
  const titleEl = nodes.find((n) => n.matches('h1.doc-title'))
  if (titleEl) { docTitle = titleEl.textContent?.trim() ?? ''; nodes.splice(nodes.indexOf(titleEl), 1) }

  // Tingkat judul bab = tingkat judul tertinggi yang ada (h1, lalu h2, ...)
  const level = [1, 2, 3].find((l) => nodes.some((n) => n.tagName === `H${l}`))
  const out: { judul: string; pieces: Piece[] }[] = []
  let cur: { judul: string; pieces: Piece[] } | null = null
  for (const n of nodes) {
    const text = n.textContent ?? ''
    if (level && n.tagName === `H${level}`) {
      cur = { judul: text.trim() || `Bab ${out.length + 1}`, pieces: [] }
      out.push(cur)
      continue
    }
    if (!cur) { cur = { judul: '', pieces: [] }; out.push(cur) }
    if (level && n.tagName === `H${level + 1}`) cur.pieces.push({ kind: 'break', title: text.trim() })
    else if (n.tagName === 'HR' || (n.tagName === 'P' && text.trim() && SEPARATOR.test(text))) cur.pieces.push({ kind: 'break' })
    else cur.pieces.push({ kind: 'text', value: n.outerHTML })
  }
  const chapters: ImportedChapter[] = []
  for (const c of out) {
    const scenes = toScenes(c.pieces, (parts) => htmlToMarkdown(parts.join('')))
    if (!c.judul && scenes.every((x) => !x.body)) continue // halaman judul kosong
    chapters.push({ judul: c.judul || 'Pembuka', scenes })
  }
  return { title: docTitle, chapters }
}

// ---------------------------------------------------------------- Markdown
function fromMarkdown(md: string): { title: string; chapters: ImportedChapter[] } {
  const lines = md.replace(/\r\n/g, '\n').replace(/^---\n[\s\S]*?\n---\n/, '').split('\n')
  const heads = lines.map((l) => /^(#{1,3})\s+(.*)$/.exec(l)).filter(Boolean) as RegExpExecArray[]
  const levels = heads.map((h) => h[1].length)
  // Satu "# Judul" di paling atas + "## Bab" di bawahnya: # = judul novel
  let title = ''
  let level = levels.length ? Math.min(...levels) : 0
  if (level === 1 && levels.filter((l) => l === 1).length === 1 && levels.some((l) => l === 2)) {
    title = heads.find((h) => h[1].length === 1)![2].trim()
    level = 2
  }
  const isSep = (l: string) =>
    /^\s*(?:-{3,}|\*{3,}|_{3,}|(?:\*\s*){3,})\s*$/.test(l) || (!!l.trim() && SEPARATOR.test(l) && !/^\s*-\s+\S/.test(l))
  const out: { judul: string; pieces: Piece[] }[] = []
  let cur: { judul: string; pieces: Piece[] } | null = null
  for (const l of lines) {
    const h = /^(#{1,3})\s+(.*)$/.exec(l)
    if (h && h[1].length === 1 && title && h[2].trim() === title) continue
    if (h && h[1].length === level) { cur = { judul: h[2].trim(), pieces: [] }; out.push(cur); continue }
    if (!cur) { cur = { judul: '', pieces: [] }; out.push(cur) }
    if (h && h[1].length === level + 1) cur.pieces.push({ kind: 'break', title: h[2].trim() })
    else if (isSep(l)) cur.pieces.push({ kind: 'break' })
    else cur.pieces.push({ kind: 'text', value: l })
  }
  const chapters: ImportedChapter[] = []
  for (const c of out) {
    const scenes = toScenes(c.pieces, (parts) => parts.join('\n'))
    if (!c.judul && scenes.every((x) => !x.body)) continue
    chapters.push({ judul: c.judul || 'Pembuka', scenes })
  }
  return { title, chapters }
}
