// Saran ejaan dari Asisten ditandai garis bergelombang di naskah (hanya tampilan).
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as PMNode } from '@tiptap/pm/model'

export interface MarkItem { id: string; text: string }
interface SState { items: MarkItem[]; deco: DecorationSet }
export const suggestKey = new PluginKey<SState>('suggestHighlight')

/** Cari teks persis di naskah (boleh melintasi huruf tebal/miring dalam satu paragraf). */
export function findText(doc: PMNode, raw: string): { from: number; to: number } | null {
  const needle = raw.replace(/\s+/g, ' ').trim()
  if (!needle) return null
  let hit: { from: number; to: number } | null = null
  doc.descendants((node, pos) => {
    if (hit) return false
    if (!node.isTextblock) return true
    // peta posisi karakter -> posisi dokumen
    let text = ''
    const map: number[] = []
    node.forEach((child, offset) => {
      if (child.isText && child.text) {
        for (let i = 0; i < child.text.length; i++) map.push(pos + 1 + offset + i)
        text += child.text
      } else { text += '￼'; map.push(pos + 1 + offset) }
    })
    // Persis dulu; bila tidak ketemu, abaikan huruf besar-kecil (panjang teks tetap sama)
    let i = text.indexOf(needle)
    if (i < 0) i = text.toLocaleLowerCase('id').indexOf(needle.toLocaleLowerCase('id'))
    if (i >= 0) hit = { from: map[i], to: map[i + needle.length - 1] + 1 }
    return false
  })
  return hit
}

function decorate(doc: PMNode, items: MarkItem[]): DecorationSet {
  const decos: Decoration[] = []
  for (const it of items) {
    const r = findText(doc, it.text)
    if (r) decos.push(Decoration.inline(r.from, r.to, { class: 'spell-mark', 'data-sug': it.id }))
  }
  return DecorationSet.create(doc, decos)
}

export const SuggestHighlight = Extension.create({
  name: 'suggestHighlight',
  addProseMirrorPlugins() {
    return [new Plugin<SState>({
      key: suggestKey,
      state: {
        init: (): SState => ({ items: [], deco: DecorationSet.empty }),
        apply(tr, prev): SState {
          const items: MarkItem[] | undefined = tr.getMeta(suggestKey)
          if (items) return { items, deco: decorate(tr.doc, items) }
          if (tr.docChanged) return { ...prev, deco: decorate(tr.doc, prev.items) }
          return prev
        },
      },
      props: { decorations: (s) => suggestKey.getState(s)?.deco },
    })]
  },
})
