// Front matter YAML sederhana di awal file Markdown:
// ---
// judul: "Adegan 1"
// tokoh: []
// ---
type Value = string | number | string[]

export function toFrontMatter(data: Record<string, Value>, body = ''): string {
  const lines = Object.entries(data).map(([k, v]) => {
    if (Array.isArray(v)) return `${k}: [${v.map((x) => JSON.stringify(x)).join(', ')}]`
    if (typeof v === 'number') return `${k}: ${v}`
    return `${k}: ${JSON.stringify(v)}`
  })
  return `---\n${lines.join('\n')}\n---\n\n${body}`
}
