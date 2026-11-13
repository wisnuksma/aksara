// Pengubah format memakai editor TipTap "tanpa layar" (aturan Markdown sama
// persis dengan editor naskah).
import { Editor, type JSONContent } from '@tiptap/core'
import { editorExtensions } from './editorExtensions'

function withEditor<T>(content: string, contentType: 'markdown' | 'html', fn: (e: Editor) => T): T {
  const e = new Editor({ element: document.createElement('div'), extensions: editorExtensions, content, contentType })
  try { return fn(e) } finally { e.destroy() }
}

export const markdownToJson = (md: string): JSONContent => withEditor(md, 'markdown', (e) => e.getJSON())
export const markdownToHtml = (md: string): string => withEditor(md, 'markdown', (e) => e.getHTML())
export const htmlToMarkdown = (html: string): string => withEditor(html, 'html', (e) => e.getMarkdown())
