// Membaca dan menyimpan proyek novel dari folder (CLAUDE.md bagian 3).
import { ensurePermission, writeJson, writeText } from './fs'
import { parseFrontMatter, toFrontMatter, type FrontMatter } from './frontmatter'
import { countMarkdownWords } from './words'
import type { ProjectFile } from './types'
import { loadBible, type Bible } from './bible'

export interface Scene {
  file: string          // "01-adegan-1.md"
  meta: FrontMatter     // front matter apa adanya
  body: string          // isi Markdown (dimuat saat proyek dibuka)
  words: number
}
export interface Chapter {
  folder: string        // "01-bab-satu"
  judul: string
  catatan: string
  scenes: Scene[]
}
export interface Project {
  root: FileSystemDirectoryHandle
  data: ProjectFile
  chapters: Chapter[]
  bible: Bible
}

export class NotAProjectError extends Error {}
export class PermissionError extends Error {}

async function readText(dir: FileSystemDirectoryHandle, name: string): Promise<string | null> {
  try {
    const f = await (await dir.getFileHandle(name)).getFile()
    return await f.text()
  } catch {
    return null
  }
}

async function listEntries(dir: FileSystemDirectoryHandle) {
  const dirs: string[] = []
  const files: string[] = []
  for await (const [name, h] of (dir as unknown as AsyncIterable<[string, FileSystemHandle]>)) {
    if (name.startsWith('.')) continue
    if (h.kind === 'directory') dirs.push(name)
    else files.push(name)
  }
  return { dirs: dirs.sort(), files: files.sort() }
}

/** Urutan: ikuti binder di project.json, lalu tambahkan yang belum tercatat (urut nama). */
function ordered(known: string[] | undefined, actual: string[]): string[] {
  const set = new Set(actual)
  const first = (known ?? []).filter((x) => set.has(x))
  return [...first, ...actual.filter((x) => !first.includes(x))]
}

export async function loadProject(root: FileSystemDirectoryHandle): Promise<Project> {
  if (!(await ensurePermission(root))) throw new PermissionError()
  const raw = await readText(root, 'project.json')
  if (raw == null) throw new NotAProjectError()
  let data: ProjectFile
  try { data = JSON.parse(raw) } catch { throw new NotAProjectError() }
  data.binder ??= []

  const manuscript = await root.getDirectoryHandle('manuscript', { create: true })
  const { dirs } = await listEntries(manuscript)
  const chapters: Chapter[] = []
  for (const folder of ordered(data.binder.map((b) => b.bab), dirs)) {
    const dir = await manuscript.getDirectoryHandle(folder)
    const babRaw = await readText(dir, '_bab.json')
    let bab: { judul?: string; catatan?: string } = {}
    try { bab = babRaw ? JSON.parse(babRaw) : {} } catch { /* biarkan kosong */ }
    const { files } = await listEntries(dir)
    const mdFiles = files.filter((f) => f.endsWith('.md'))
    const known = data.binder.find((b) => b.bab === folder)?.adegan
    const scenes: Scene[] = []
    for (const file of ordered(known, mdFiles)) {
      const { data: meta, body } = parseFrontMatter((await readText(dir, file)) ?? '')
      scenes.push({ file, meta, body, words: countMarkdownWords(body) })
    }
    chapters.push({ folder, judul: bab.judul || folder, catatan: bab.catatan ?? '', scenes })
  }
  const bible = await loadBible(root)
  return { root, data, chapters, bible }
}

export async function saveScene(p: Project, chapter: Chapter, scene: Scene) {
  const manuscript = await p.root.getDirectoryHandle('manuscript')
  const dir = await manuscript.getDirectoryHandle(chapter.folder)
  const body = scene.body.endsWith('\n') || scene.body === '' ? scene.body : scene.body + '\n'
  await writeText(dir, scene.file, toFrontMatter(scene.meta, body))
}

export async function saveProjectFile(p: Project) {
  p.data.binder = p.chapters.map((c) => ({ bab: c.folder, adegan: c.scenes.map((s) => s.file) }))
  await writeJson(p.root, 'project.json', p.data)
}

export const totalWords = (p: Project) =>
  p.chapters.reduce((n, c) => n + c.scenes.reduce((m, s) => m + s.words, 0), 0)

export const sceneId = (c: Chapter, s: Scene) => `${c.folder}/${s.file}`

/** Prolog, epilog, dan sejenisnya tidak diberi nomor bab. */
export const isUnnumbered = (judul: string) =>
  /^\s*(prolog|prologue|epilog|epilogue|interlude|intermezo)\b/i.test(judul)

/** Nomor bab (1, 2, …) dengan melewati prolog/epilog; null bila tidak bernomor. */
export function chapterNumber(p: Project, c: Chapter): number | null {
  if (isUnnumbered(c.judul)) return null
  let n = 0
  for (const x of p.chapters) {
    if (!isUnnumbered(x.judul)) n++
    if (x === c) return n
  }
  return null
}

/** "Bab 3" atau "Prolog" — dipakai di atas halaman. */
export function chapterLabel(p: Project, c: Chapter): string {
  const n = chapterNumber(p, c)
  return n == null ? c.judul.trim() : `Bab ${n}`
}

/** Nama bawaan untuk bab baru: "Bab <nomor berikutnya>". */
export const nextChapterTitle = (p: Project) =>
  `Bab ${p.chapters.filter((c) => !isUnnumbered(c.judul)).length + 1}`
