// Ekstensi TipTap untuk naskah. Disimpan sebagai Markdown; paragraf/judul yang
// rata tengah/kanan/kiri-kanan disimpan sebagai HTML kecil karena Markdown
// tidak punya cara menulis perataan.
import StarterKit from '@tiptap/starter-kit'
import Paragraph from '@tiptap/extension-paragraph'
import Heading from '@tiptap/extension-heading'
import TextAlign from '@tiptap/extension-text-align'
import { Markdown } from '@tiptap/markdown'
import type { JSONContent } from '@tiptap/core'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const MARK_TAG: Record<string, string> = { bold: 'strong', italic: 'em', underline: 'u', strike: 's' }

function inlineHtml(content: JSONContent[] = []): string {
  return content.map((n) => {
    if (n.type === 'hardBreak') return '<br>'
    let html = esc(n.text ?? '')
    for (const m of n.marks ?? []) {
      const tag = MARK_TAG[m.type]
      if (tag) html = `<${tag}>${html}</${tag}>`
    }
    return html
  }).join('')
}

const alignedHtml = (tag: string, node: JSONContent) => {
  const a = node.attrs?.textAlign
  if (!a || a === 'left' || !node.content?.length) return null
  return `<${tag} style="text-align: ${a}">${inlineHtml(node.content)}</${tag}>`
}

const AlignedParagraph = Paragraph.extend({
  renderMarkdown(node, h, ctx) {
    return alignedHtml('p', node) ?? this.parent?.(node, h, ctx) ?? ''
  },
})

const AlignedHeading = Heading.extend({
  renderMarkdown(node, h, ctx) {
    return alignedHtml(`h${node.attrs?.level ?? 1}`, node) ?? this.parent?.(node, h, ctx) ?? ''
  },
}).configure({ levels: [1, 2, 3] })

export const editorExtensions = [
  StarterKit.configure({
    paragraph: false,
    heading: false,
    code: false,
    codeBlock: false,
    link: false,
    // Naskah novel: tanpa daftar berpoin, supaya "* * *" tetap teks biasa.
    bulletList: false,
    orderedList: false,
    listItem: false,
    listKeymap: false,
  }),
  AlignedParagraph,
  AlignedHeading,
  TextAlign.configure({ types: ['heading', 'paragraph'], alignments: ['left', 'center', 'right', 'justify'] }),
  Markdown,
]
