// Hitung kata: "apa-apa" dan "Navea's" dihitung satu kata.
const WORD = /[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu
export function countWords(text: string): number {
  return text.match(WORD)?.length ?? 0
}

/** Kata dari Markdown: buang tag HTML dan tanda format dulu. */
export function countMarkdownWords(md: string): number {
  return countWords(md.replace(/<[^>]+>/g, ' ').replace(/&[a-z0-9#]+;/gi, ' ').replace(/[*_~`#>]/g, ' '))
}
