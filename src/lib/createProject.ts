// Membuat folder novel baru sesuai struktur di CLAUDE.md bagian 3.
import { exists, folderName, pad2, slugify, subdir, writeJson, writeText } from './fs'
import { toFrontMatter } from './frontmatter'
import type { ProjectFile, Template } from './types'

export interface NewNovel {
  judul: string
  genre: string
  targetKata: number
  template: Template
}

interface ChapterSeed { judul: string; catatan: string; adegan: string[] }

const STRUKTUR: Record<Template, ChapterSeed[]> = {
  kosong: [{ judul: 'Bab Satu', catatan: '', adegan: ['Adegan 1'] }],
  'tiga-babak': [
    { judul: 'Babak I — Awal', catatan: 'Perkenalkan tokoh utama, dunianya, dan apa yang ia inginkan. Akhiri dengan peristiwa pemicu yang mengubah segalanya.', adegan: ['Adegan pembuka'] },
    { judul: 'Babak II — Konflik', catatan: 'Rintangan makin berat. Di tengah babak ada titik balik; menjelang akhir, tokoh utama berada di titik terendah.', adegan: ['Adegan 1'] },
    { judul: 'Babak III — Resolusi', catatan: 'Klimaks: tokoh utama menghadapi konflik terbesar. Tutup dengan akibatnya dan dunia yang baru.', adegan: ['Adegan 1'] },
  ],
  'fantasi-epik': [
    { judul: 'Prolog', catatan: 'Sekilas tentang dunia atau peristiwa lama yang menjadi akar konflik.', adegan: ['Adegan 1'] },
    { judul: 'Bab Satu', catatan: '', adegan: ['Adegan 1'] },
  ],
}

export class FolderExistsError extends Error {}

/**
 * Membuat folder "<Judul>" di dalam `parent`. Tidak pernah menimpa:
 * bila folder dengan nama sama sudah ada, dilempar FolderExistsError.
 */
export async function createProject(parent: FileSystemDirectoryHandle, n: NewNovel) {
  const name = folderName(n.judul)
  if (await exists(parent, name)) throw new FolderExistsError(name)

  const root = await subdir(parent, name)
  const manuscript = await subdir(root, 'manuscript')
  const binder: ProjectFile['binder'] = []

  for (const [i, bab] of STRUKTUR[n.template].entries()) {
    const babFolder = `${pad2(i + 1)}-${slugify(bab.judul)}`
    const dir = await subdir(manuscript, babFolder)
    await writeJson(dir, '_bab.json', { judul: bab.judul, catatan: bab.catatan })
    const files: string[] = []
    for (const [j, judul] of bab.adegan.entries()) {
      const file = `${pad2(j + 1)}-${slugify(judul)}.md`
      await writeText(dir, file, toFrontMatter({
        id: crypto.randomUUID(),
        judul, status: 'ide', pov: '', lokasi: '', waktu_cerita: '', alur: '', sinopsis: '', tokoh: [],
      }))
      files.push(file)
    }
    binder.push({ bab: babFolder, adegan: files })
  }

  const bible = await subdir(root, 'bible')
  for (const kind of ['tokoh', 'tempat', 'faksi', 'lore']) await subdir(bible, kind)
  await subdir(root, 'snapshots')
  if (n.template === 'fantasi-epik') await subdir(root, 'peta')

  const project: ProjectFile = {
    format: 1,
    id: crypto.randomUUID(),
    judul: n.judul,
    genre: n.genre,
    target_kata: n.targetKata,
    target_harian: 500,
    template: n.template,
    dibuat: new Date().toISOString(),
    binder,
    setting: {},
  }
  await writeJson(root, 'stats.json', { harian: {} })
  // project.json ditulis terakhir: kalau ada yang gagal sebelumnya, folder ini
  // tidak akan dianggap proyek yang sah.
  await writeJson(root, 'project.json', project)
  return { root, project, folder: name }
}
