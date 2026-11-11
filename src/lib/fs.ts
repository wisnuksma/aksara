// Pembantu untuk File System Access API (Chrome).

export const fsSupported = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window

/** Apakah sudah ada file/folder bernama `name` di dalam `dir`. */
export async function exists(dir: FileSystemDirectoryHandle, name: string): Promise<boolean> {
  for await (const key of dir.keys()) if (key === name) return true
  return false
}

export function subdir(dir: FileSystemDirectoryHandle, name: string) {
  return dir.getDirectoryHandle(name, { create: true })
}

/**
 * Tulis aman: Chrome menulis dulu ke file sementara (".crswap") dan baru
 * menggantikan file asli ketika `close()` berhasil. Jadi kalau penulisan
 * gagal di tengah jalan, file lama tetap utuh.
 */
export async function writeText(dir: FileSystemDirectoryHandle, name: string, text: string) {
  const file = await dir.getFileHandle(name, { create: true })
  const w = await file.createWritable()
  try {
    await w.write(text)
    await w.close()
  } catch (e) {
    await w.abort().catch(() => {})
    throw e
  }
}

export const writeJson = (dir: FileSystemDirectoryHandle, name: string, data: unknown) =>
  writeText(dir, name, JSON.stringify(data, null, 2) + '\n')

/** Minta izin baca-tulis ke folder (bila belum diberikan). */
export async function ensurePermission(dir: FileSystemDirectoryHandle): Promise<boolean> {
  const opts = { mode: 'readwrite' } as const
  if ((await dir.queryPermission?.(opts)) === 'granted') return true
  return (await dir.requestPermission?.(opts)) === 'granted'
}

/** Ubah teks jadi nama file aman: "Bab Satu!" -> "bab-satu". */
export function slugify(s: string): string {
  return s
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'tanpa-judul'
}

/** Nama folder novel: judul apa adanya, tanpa karakter yang dilarang di Mac/Windows. */
export function folderName(title: string): string {
  return title.replace(/[/\\:*?"<>|]/g, '-').replace(/^\.+/, '').trim().slice(0, 80) || 'Novel tanpa judul'
}

export const pad2 = (n: number) => String(n).padStart(2, '0')
