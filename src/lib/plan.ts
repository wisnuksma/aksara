// Data perencanaan (Fase 4), disimpan sebagai file biasa di folder novel:
//   plan/timeline.json, plan/relasi.json, plan/peta.json, gambar peta di peta/
import { exists, slugify, subdir, writeJson } from './fs'

export interface TimelineEvent {
  id: string
  waktu: string        // label waktu cerita, mis. "Tahun 312, musim gugur"
  judul: string
  deskripsi: string
  adegan: string[]     // id adegan ("bab/file.md")
  tokoh: string[]      // nama tokoh
}
export interface Relation { id: string; dari: string; ke: string; jenis: string; catatan: string }
export interface RelationsFile { posisi: Record<string, { x: number; y: number }>; relasi: Relation[] }
export interface Pin { id: string; x: number; y: number; judul: string; entri: string }   // x,y: 0..1
export interface MapFile { gambar: string; pin: Pin[] }

const planDir = (root: FileSystemDirectoryHandle) => subdir(root, 'plan')

async function readJson<T>(root: FileSystemDirectoryHandle, name: string, fallback: T): Promise<T> {
  try {
    const dir = await planDir(root)
    if (!(await exists(dir, name))) return fallback
    return { ...fallback, ...JSON.parse(await (await (await dir.getFileHandle(name)).getFile()).text()) }
  } catch {
    return fallback
  }
}
const writePlan = async (root: FileSystemDirectoryHandle, name: string, data: unknown) => writeJson(await planDir(root), name, data)

export const loadTimeline = async (root: FileSystemDirectoryHandle) =>
  (await readJson<{ peristiwa: TimelineEvent[] }>(root, 'timeline.json', { peristiwa: [] })).peristiwa
export const saveTimeline = (root: FileSystemDirectoryHandle, peristiwa: TimelineEvent[]) => writePlan(root, 'timeline.json', { peristiwa })

export const loadRelations = (root: FileSystemDirectoryHandle) =>
  readJson<RelationsFile>(root, 'relasi.json', { posisi: {}, relasi: [] })
export const saveRelations = (root: FileSystemDirectoryHandle, r: RelationsFile) => writePlan(root, 'relasi.json', r)

export const loadMap = (root: FileSystemDirectoryHandle) => readJson<MapFile>(root, 'peta.json', { gambar: '', pin: [] })
export const saveMap = (root: FileSystemDirectoryHandle, m: MapFile) => writePlan(root, 'peta.json', m)

/** Salin gambar peta ke folder peta/ di dalam novel. Mengembalikan nama filenya. */
export async function storeMapImage(root: FileSystemDirectoryHandle, file: File): Promise<string> {
  const dir = await subdir(root, 'peta')
  const ext = (/\.(png|jpe?g|webp|gif)$/i.exec(file.name)?.[1] ?? 'png').toLowerCase()
  const base = slugify(file.name.replace(/\.[^.]+$/, '')) || 'peta'
  let name = `${base}.${ext}`
  for (let i = 2; await exists(dir, name); i++) name = `${base}-${i}.${ext}`
  const h = await dir.getFileHandle(name, { create: true })
  const w = await h.createWritable()
  await w.write(file)
  await w.close()
  return name
}

export async function mapImageUrl(root: FileSystemDirectoryHandle, name: string): Promise<string | null> {
  try {
    const dir = await root.getDirectoryHandle('peta')
    return URL.createObjectURL(await (await dir.getFileHandle(name)).getFile())
  } catch {
    return null
  }
}

export const newId = () => crypto.randomUUID().slice(0, 8)

/** Streak: jumlah hari berturut-turut (sampai hari ini, atau kemarin bila hari ini belum menulis). */
export function streaks(harian: Record<string, number>, today: Date = new Date()) {
  const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const wrote = (d: Date) => (harian[key(d)] ?? 0) > 0
  const d = new Date(today)
  if (!wrote(d)) d.setDate(d.getDate() - 1)
  let current = 0
  while (wrote(d)) { current++; d.setDate(d.getDate() - 1) }
  const days = Object.keys(harian).filter((k) => harian[k] > 0).sort()
  let best = 0, run = 0, prev: Date | null = null
  for (const k of days) {
    const cur = new Date(k + 'T00:00:00')
    run = prev && Math.round((cur.getTime() - prev.getTime()) / 86400000) === 1 ? run + 1 : 1
    best = Math.max(best, run)
    prev = cur
  }
  return { current, best: Math.max(best, current) }
}
