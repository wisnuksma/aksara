// Daftar "Proyek terbaru" disimpan di IndexedDB browser (bukan di folder novel),
// termasuk "handle" folder supaya proyek bisa dibuka lagi tanpa memilih ulang.
import { get, set } from 'idb-keyval'

export interface RecentProject {
  id: string
  title: string
  genre?: string
  words: number
  lastOpened: string // waktu ISO
  handle?: FileSystemDirectoryHandle
}

const KEY = 'recent-projects'
const MAX = 12

export async function listRecent(): Promise<RecentProject[]> {
  const items = (await get<RecentProject[]>(KEY)) ?? []
  return [...items].sort((a, b) => b.lastOpened.localeCompare(a.lastOpened))
}

export async function rememberProject(p: RecentProject): Promise<void> {
  const items = (await get<RecentProject[]>(KEY)) ?? []
  const rest = items.filter((x) => x.id !== p.id)
  await set(KEY, [p, ...rest].slice(0, MAX))
}

const rtf = new Intl.RelativeTimeFormat('id', { numeric: 'auto' })

/** "5 menit yang lalu", "kemarin", dst. */
export function timeAgo(iso: string, now = Date.now()): string {
  const diff = (new Date(iso).getTime() - now) / 1000
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ['second', 60], ['minute', 60], ['hour', 24], ['day', 7], ['week', 4.35], ['month', 12], ['year', Infinity],
  ]
  let value = diff
  for (const [unit, size] of steps) {
    if (Math.abs(value) < size) {
      if (unit === 'second') return 'baru saja'
      return rtf.format(Math.round(value), unit)
    }
    value /= size
  }
  return ''
}

export const formatNumber = (n: number) => new Intl.NumberFormat('id-ID').format(n)
