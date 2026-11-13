// Story bible: tokoh, tempat, faksi, lore — satu file Markdown per entri
// di bible/<jenis>/<slug>.md (CLAUDE.md bagian 3).
import { exists, slugify, subdir, writeText } from './fs'
import { parseFrontMatter, toFrontMatter, type FrontMatter } from './frontmatter'

export type BibleKind = 'tokoh' | 'tempat' | 'faksi' | 'lore'
export const KINDS: BibleKind[] = ['tokoh', 'tempat', 'faksi', 'lore']
export const KIND_LABEL: Record<BibleKind, string> = { tokoh: 'Tokoh', tempat: 'Tempat', faksi: 'Faksi', lore: 'Lore' }

/** Field bawaan per jenis (selain nama & alias). Sisanya = field bebas. */
export const KIND_FIELDS: Record<BibleKind, { key: string; label: string; hint: string }[]> = {
  tokoh: [{ key: 'faksi', label: 'Faksi', hint: '' }, { key: 'peran', label: 'Peran', hint: 'mis. tokoh utama, penasihat raja' }],
  tempat: [{ key: 'faksi', label: 'Wilayah faksi', hint: '' }, { key: 'jenis', label: 'Jenis', hint: 'mis. kota, benteng, sungai' }],
  faksi: [{ key: 'jenis', label: 'Jenis', hint: 'mis. kerajaan, serikat, ordo' }, { key: 'pemimpin', label: 'Pemimpin', hint: 'mis. Ratu Seraphine' }],
  lore: [{ key: 'jenis', label: 'Jenis', hint: 'mis. sejarah, sihir, agama' }],
}
const RESERVED = new Set(['id', 'nama', 'alias', 'warna', 'faksi', 'peran', 'jenis', 'pemimpin'])

/** Warna faksi (dipakai juga untuk sorotan nama di naskah nanti). */
export const FACTION_COLORS: { key: string; label: string; text: string; card: string }[] = [
  { key: 'biru', label: 'Biru (Estelle)', text: '#B4CAEC', card: '#22304A' },
  { key: 'merah', label: 'Merah anggur (Navea)', text: '#E8AABD', card: '#3A2330' },
  { key: 'hijau', label: 'Hijau', text: '#B5D3B0', card: '#24382B' },
  { key: 'emas', label: 'Emas', text: '#E3C88E', card: '#3A3222' },
  { key: 'ungu', label: 'Ungu', text: '#CDB8E8', card: '#30264A' },
  { key: 'abu', label: 'Abu-abu', text: '#C9CBD8', card: '#2F3448' },
]
export const factionColor = (key: unknown) => FACTION_COLORS.find((c) => c.key === key) ?? FACTION_COLORS[5]

export interface Entry {
  kind: BibleKind
  file: string
  meta: FrontMatter
  body: string
}
export type Bible = Record<BibleKind, Entry[]>

export const entryName = (e: Entry) => String(e.meta.nama || '').trim() || 'Tanpa nama'
export const entryAliases = (e: Entry): string[] => (Array.isArray(e.meta.alias) ? e.meta.alias : [])
export const freeFields = (e: Entry): [string, string][] =>
  Object.entries(e.meta).filter(([k]) => !RESERVED.has(k)).map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : String(v)])

export const sortEntries = (list: Entry[]) => list.sort((a, b) => entryName(a).localeCompare(entryName(b), 'id'))

const bibleDir = async (root: FileSystemDirectoryHandle, kind: BibleKind) =>
  subdir(await subdir(root, 'bible'), kind)

export async function loadBible(root: FileSystemDirectoryHandle): Promise<Bible> {
  const out = { tokoh: [], tempat: [], faksi: [], lore: [] } as Bible
  for (const kind of KINDS) {
    const dir = await bibleDir(root, kind)
    for await (const [name, h] of (dir as unknown as AsyncIterable<[string, FileSystemHandle]>)) {
      if (h.kind !== 'file' || !name.endsWith('.md') || name.startsWith('.')) continue
      const text = await (await (h as FileSystemFileHandle).getFile()).text()
      const { data, body } = parseFrontMatter(text)
      out[kind].push({ kind, file: name, meta: data, body })
    }
    sortEntries(out[kind])
  }
  return out
}

export async function saveEntry(root: FileSystemDirectoryHandle, e: Entry) {
  const dir = await bibleDir(root, e.kind)
  const body = e.body === '' || e.body.endsWith('\n') ? e.body : e.body + '\n'
  await writeText(dir, e.file, toFrontMatter(e.meta, body))
}

export async function createEntry(root: FileSystemDirectoryHandle, bible: Bible, kind: BibleKind, nama: string): Promise<Entry> {
  const dir = await bibleDir(root, kind)
  const base = slugify(nama)
  let file = `${base}.md`
  for (let i = 2; await exists(dir, file); i++) file = `${base}-${i}.md`
  const meta: FrontMatter = { id: crypto.randomUUID(), nama, alias: [] }
  for (const f of KIND_FIELDS[kind]) meta[f.key] = ''
  if (kind === 'faksi') meta.warna = FACTION_COLORS[bible.faksi.length % FACTION_COLORS.length].key
  const e: Entry = { kind, file, meta, body: '' }
  await saveEntry(root, e)
  bible[kind].push(e)
  sortEntries(bible[kind])
  return e
}

/** Hapus file entri. Pemanggil WAJIB sudah meminta konfirmasi pengguna. */
export async function deleteEntry(root: FileSystemDirectoryHandle, bible: Bible, e: Entry) {
  const dir = await bibleDir(root, e.kind)
  await dir.removeEntry(e.file)
  bible[e.kind] = bible[e.kind].filter((x) => x !== e)
}

/**
 * Sesuaikan nama file dengan nama entri (mis. "tokoh-baru.md" -> "elara.md").
 * Aman: file baru ditulis dulu, baru file lama dihapus.
 */
export async function syncEntryFile(root: FileSystemDirectoryHandle, e: Entry): Promise<boolean> {
  const base = slugify(entryName(e))
  if (new RegExp(`^${base}(-\\d+)?\\.md$`).test(e.file)) return false
  const dir = await bibleDir(root, e.kind)
  let file = `${base}.md`
  for (let i = 2; await exists(dir, file); i++) file = `${base}-${i}.md`
  const old = e.file
  e.file = file
  try {
    await saveEntry(root, e)
  } catch (err) {
    e.file = old
    throw err
  }
  await dir.removeEntry(old)
  return true
}
