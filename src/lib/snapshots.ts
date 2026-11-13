// Snapshot (versi) adegan: snapshots/<id-adegan>/<waktu>.md (CLAUDE.md bagian 3).
// Isi snapshot = salinan lengkap file adegan + keterangan jenis/label.
import { subdir, writeText } from './fs'
import { parseFrontMatter, toFrontMatter } from './frontmatter'
import type { Project, Scene } from './project'

export type SnapshotKind = 'otomatis' | 'manual' | 'sebelum-pulih' | 'awal'
export interface SnapshotInfo {
  file: string
  date: Date
  kind: SnapshotKind
  label: string
  words?: number
}

export const sceneKey = (s: Scene) => String(s.meta.id || s.file.replace(/\.md$/, ''))

const dirFor = async (p: Project, s: Scene) => subdir(await subdir(p.root, 'snapshots'), sceneKey(s))

/** 2026-11-13T07-20-05-123.md — aman untuk nama file, urut sesuai waktu. */
const stamp = (d = new Date()) => d.toISOString().replace(/:/g, '-').replace('.', '-').replace('Z', '') + '.md'
const parseStamp = (f: string) => {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})(?:-(\d{3}))?/.exec(f)
  return m ? new Date(`${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5] ?? '000'}Z`) : new Date(0)
}

export async function writeSnapshot(p: Project, s: Scene, kind: SnapshotKind, label = '', body = s.body) {
  const dir = await dirFor(p, s)
  const meta = { ...s.meta, snapshot_jenis: kind, snapshot_label: label }
  await writeText(dir, stamp(), toFrontMatter(meta, body.endsWith('\n') || !body ? body : body + '\n'))
}

export async function listSnapshots(p: Project, s: Scene): Promise<SnapshotInfo[]> {
  const dir = await dirFor(p, s)
  const out: SnapshotInfo[] = []
  for await (const [name, h] of (dir as unknown as AsyncIterable<[string, FileSystemHandle]>)) {
    if (h.kind !== 'file' || !name.endsWith('.md')) continue
    const text = await (await (h as FileSystemFileHandle).getFile()).text()
    const { data } = parseFrontMatter(text)
    out.push({ file: name, date: parseStamp(name), kind: (String(data.snapshot_jenis || 'otomatis') as SnapshotKind), label: String(data.snapshot_label || '') })
  }
  return out.sort((a, b) => b.date.getTime() - a.date.getTime())
}

export async function readSnapshot(p: Project, s: Scene, file: string): Promise<string> {
  const dir = await dirFor(p, s)
  const text = await (await (await dir.getFileHandle(file)).getFile()).text()
  return parseFrontMatter(text).body
}

export async function latestSnapshotBody(p: Project, s: Scene): Promise<string | null> {
  const list = await listSnapshots(p, s)
  return list.length ? readSnapshot(p, s, list[0].file) : null
}
