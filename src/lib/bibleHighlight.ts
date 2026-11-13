// Sorotan otomatis: nama & alias dari story bible diberi garis bawah titik-titik
// berwarna faksi di naskah (dekorasi tampilan saja; isi naskah tidak berubah).
import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as PMNode } from '@tiptap/pm/model'

export interface Term {
  text: string      // nama atau alias persis seperti ditulis
  id: string        // id entri
  light: string     // warna garis di mode terang
  dark: string      // warna garis di mode gelap
}

interface HState { terms: Term[]; re: RegExp | null; deco: DecorationSet }
export const bibleKey = new PluginKey<HState>('bibleHighlight')

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function buildRegex(terms: Term[]): RegExp | null {
  const words = [...new Set(terms.map((t) => t.text))].filter((t) => t.trim().length >= 2)
  if (!words.length) return null
  words.sort((a, b) => b.length - a.length) // nama panjang dulu ("Komandan Aldric" sebelum "Aldric")
  // Batas kata yang mengenal huruf Indonesia (bukan \b yang hanya ASCII)
  return new RegExp(`(?<![\\p{L}\\p{N}])(${words.map(escape).join('|')})(?![\\p{L}\\p{N}])`, 'gu')
}

function decorate(doc: PMNode, terms: Term[], re: RegExp | null): DecorationSet {
  if (!re) return DecorationSet.empty
  const byText = new Map(terms.map((t) => [t.text, t]))
  const decos: Decoration[] = []
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return
    re.lastIndex = 0
    for (let m; (m = re.exec(node.text)); ) {
      const t = byText.get(m[1])
      if (!t) continue
      decos.push(Decoration.inline(pos + m.index, pos + m.index + m[1].length, {
        class: 'bible-link',
        'data-entry': t.id,
        style: `--lk:${t.light};--lk-d:${t.dark}`,
      }))
    }
  })
  return DecorationSet.create(doc, decos)
}

export const BibleHighlight = Extension.create({
  name: 'bibleHighlight',
  addProseMirrorPlugins() {
    return [
      new Plugin<HState>({
        key: bibleKey,
        state: {
          init: (_, { doc }): HState => ({ terms: [], re: null, deco: decorate(doc, [], null) }),
          apply(tr, prev): HState {
            const terms: Term[] | undefined = tr.getMeta(bibleKey)
            if (terms) {
              const re = buildRegex(terms)
              return { terms, re, deco: decorate(tr.doc, terms, re) }
            }
            if (tr.docChanged) return { ...prev, deco: decorate(tr.doc, prev.terms, prev.re) }
            return prev
          },
        },
        props: { decorations: (state) => bibleKey.getState(state)?.deco },
      }),
    ]
  },
})
