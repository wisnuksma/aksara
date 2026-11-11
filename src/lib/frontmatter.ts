// Front matter YAML sederhana di awal file Markdown:
// ---
// judul: "Adegan 1"
// tokoh: []
// ---
export type FMValue = string | number | string[]
export type FrontMatter = Record<string, FMValue>

export function toFrontMatter(data: FrontMatter, body = ''): string {
  const lines = Object.entries(data).map(([k, v]) => {
    if (Array.isArray(v)) return `${k}: [${v.map((x) => JSON.stringify(x)).join(', ')}]`
    if (typeof v === 'number') return `${k}: ${v}`
    return `${k}: ${JSON.stringify(v)}`
  })
  return `---\n${lines.join('\n')}\n---\n\n${body}`
}

/** Pisahkan front matter dan isi. Toleran terhadap file yang ditulis tangan. */
export function parseFrontMatter(text: string): { data: FrontMatter; body: string } {
  const src = text.replace(/^﻿/, '').replace(/\r\n/g, '\n')
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(src)
  if (!m) return { data: {}, body: src }
  const data: FrontMatter = {}
  for (const line of m[1].split('\n')) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line)
    if (!kv) continue
    data[kv[1]] = parseValue(kv[2].trim())
  }
  return { data, body: src.slice(m[0].length).replace(/^\n/, '') }
}

function parseValue(raw: string): FMValue {
  if (raw === '') return ''
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw)
  if (raw.startsWith('[')) {
    try {
      const v = JSON.parse(raw)
      if (Array.isArray(v)) return v.map(String)
    } catch {
      return raw.slice(1, -1).split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
    }
  }
  if (raw.startsWith('"')) {
    try { return String(JSON.parse(raw)) } catch { /* jatuh ke bawah */ }
  }
  return raw.replace(/^'(.*)'$/, '$1')
}
