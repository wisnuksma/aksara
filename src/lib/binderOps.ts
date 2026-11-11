// Operasi binder: tambah, ubah nama, dan pindah bab/adegan.
// Urutan resmi disimpan di project.json (binder); nama file/folder tidak
// pernah diganti saat mengubah nama, supaya aman.
import { pad2, slugify, subdir, writeJson, writeText } from './fs'
import { toFrontMatter } from './frontmatter'
import { saveProjectFile, saveScene, type Chapter, type Project, type Scene } from './project'

const manuscriptDir = (p: Project) => p.root.getDirectoryHandle('manuscript', { create: true })
const chapterDir = async (p: Project, c: Chapter) => (await manuscriptDir(p)).getDirectoryHandle(c.folder)

async function names(dir: FileSystemDirectoryHandle): Promise<Set<string>> {
  const out = new Set<string>()
  for await (const k of dir.keys()) out.add(k)
  return out
}

/** "07-bab-baru" — nomor berikutnya setelah nomor terbesar yang sudah ada. */
function nextName(existing: Set<string>, title: string, ext = ''): string {
  let max = 0
  for (const n of existing) {
    const m = /^(\d+)-/.exec(n)
    if (m) max = Math.max(max, Number(m[1]))
  }
  const slug = slugify(title)
  let i = max + 1
  while (existing.has(`${pad2(i)}-${slug}${ext}`)) i++
  return `${pad2(i)}-${slug}${ext}`
}

function newSceneMeta(judul: string) {
  return {
    id: crypto.randomUUID(),
    judul, status: 'ide', pov: '', lokasi: '', waktu_cerita: '', alur: '', sinopsis: '', tokoh: [] as string[],
  }
}

export async function addChapter(p: Project, judul: string): Promise<Chapter> {
  const ms = await manuscriptDir(p)
  const folder = nextName(await names(ms), judul)
  const dir = await subdir(ms, folder)
  await writeJson(dir, '_bab.json', { judul, catatan: '' })
  const sceneFile = '01-adegan-1.md'
  const scene: Scene = { file: sceneFile, meta: newSceneMeta('Adegan 1'), body: '', words: 0 }
  await writeText(dir, sceneFile, toFrontMatter(scene.meta))
  const c: Chapter = { folder, judul, catatan: '', scenes: [scene] }
  p.chapters.push(c)
  await saveProjectFile(p)
  return c
}

export async function addScene(p: Project, c: Chapter, judul: string): Promise<Scene> {
  const dir = await chapterDir(p, c)
  const file = nextName(await names(dir), judul, '.md')
  const scene: Scene = { file, meta: newSceneMeta(judul), body: '', words: 0 }
  await writeText(dir, file, toFrontMatter(scene.meta))
  c.scenes.push(scene)
  await saveProjectFile(p)
  return scene
}

export async function renameChapter(p: Project, c: Chapter, judul: string) {
  const dir = await chapterDir(p, c)
  await writeJson(dir, '_bab.json', { judul, catatan: c.catatan })
  c.judul = judul
}

/** `s.body` harus sudah berisi isi terbaru sebelum memanggil ini. */
export async function renameScene(p: Project, c: Chapter, s: Scene, judul: string) {
  const old = s.meta.judul
  s.meta.judul = judul
  try {
    await saveScene(p, c, s)
  } catch (e) {
    s.meta.judul = old
    throw e
  }
}

export async function moveChapter(p: Project, from: number, to: number) {
  if (from === to) return
  const [c] = p.chapters.splice(from, 1)
  p.chapters.splice(to, 0, c)
  await saveProjectFile(p)
}

/**
 * Pindahkan adegan ke posisi `index` di bab `dst`. Bila pindah bab, file
 * ditulis dulu di folder tujuan, baru file lama dihapus (tidak ada yang hilang
 * kalau gagal di tengah). `s.body` harus sudah berisi isi terbaru.
 */
export async function moveScene(p: Project, src: Chapter, s: Scene, dst: Chapter, index: number) {
  const from = src.scenes.indexOf(s)
  if (src === dst) {
    if (index > from) index--
    if (index === from) return
    src.scenes.splice(from, 1)
    src.scenes.splice(index, 0, s)
    await saveProjectFile(p)
    return
  }
  const srcDir = await chapterDir(p, src)
  const dstDir = await chapterDir(p, dst)
  const existing = await names(dstDir)
  const file = existing.has(s.file) ? nextName(existing, String(s.meta.judul || 'adegan'), '.md') : s.file
  const body = s.body.endsWith('\n') || s.body === '' ? s.body : s.body + '\n'
  await writeText(dstDir, file, toFrontMatter(s.meta, body))
  const oldFile = s.file
  src.scenes.splice(from, 1)
  s.file = file
  dst.scenes.splice(index, 0, s)
  await saveProjectFile(p)
  await srcDir.removeEntry(oldFile)
}
