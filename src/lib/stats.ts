// stats.json: jumlah kata yang ditulis per hari, untuk target harian.
import { writeJson } from './fs'

export interface Stats { harian: Record<string, number> }

export const todayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export async function loadStats(root: FileSystemDirectoryHandle): Promise<Stats> {
  try {
    const t = await (await (await root.getFileHandle('stats.json')).getFile()).text()
    const s = JSON.parse(t)
    return { harian: s.harian ?? {} }
  } catch {
    return { harian: {} }
  }
}

export const saveStats = (root: FileSystemDirectoryHandle, s: Stats) => writeJson(root, 'stats.json', s)
