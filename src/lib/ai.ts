// Asisten AI (Fase 3): memanggil Claude langsung dari browser dengan API key
// milik pengguna yang disimpan HANYA di perangkat ini (IndexedDB).
import Anthropic from '@anthropic-ai/sdk'
import { del, get, set } from 'idb-keyval'
import { entryAliases, entryFaction, entryName, KIND_LABEL, KINDS, type Entry } from './bible'
import { chapterLabel, sceneId, type Chapter, type Project, type Scene } from './project'

export const MODEL = 'claude-opus-5-5'
const KEY = 'anthropic-api-key'
const BETAS = ['server-side-fallback-2026-07-01']

export const loadApiKey = () => get<string>(KEY).catch(() => undefined)
export const saveApiKey = (k: string) => set(KEY, k.trim())
export const forgetApiKey = () => del(KEY)

/** Klien Claude untuk browser. dangerouslyAllowBrowser = SDK mengirim header
 *  anthropic-dangerous-direct-browser-access: true (CLAUDE.md, Fase 3). */
export const makeClient = (apiKey: string) => new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 })

// ---------------------------------------------------------------- Konteks

const mentions = (text: string, name: string) =>
  name.length >= 2 && new RegExp(`(?<![\\p{L}\\p{N}])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'u').test(text)

/** Entri story bible yang relevan untuk adegan: disebut di naskah / detail adegan, plus faksinya. */
export function relevantEntries(p: Project, scene: Scene, body: string): Entry[] {
  const meta = [scene.meta.pov, scene.meta.lokasi, ...(Array.isArray(scene.meta.tokoh) ? scene.meta.tokoh : [])].map(String).join('\n')
  const hay = body + '\n' + meta
  const picked = new Set<Entry>()
  for (const k of KINDS) for (const e of p.bible[k]) if ([entryName(e), ...entryAliases(e)].some((n) => mentions(hay, n))) picked.add(e)
  for (const e of [...picked]) { const f = entryFaction(p.bible, e); if (f) picked.add(f) }
  return [...picked]
}

function describeEntry(e: Entry): string {
  const lines = [`### ${KIND_LABEL[e.kind]}: ${entryName(e)}`]
  const al = entryAliases(e)
  if (al.length) lines.push(`Alias: ${al.join(', ')}`)
  for (const [k, v] of Object.entries(e.meta)) {
    if (['id', 'nama', 'alias', 'warna'].includes(k)) continue
    const val = Array.isArray(v) ? v.join(', ') : String(v ?? '')
    if (val.trim()) lines.push(`${k}: ${val}`)
  }
  if (e.body.trim()) lines.push(e.body.trim())
  return lines.join('\n')
}

export interface SceneCtx { chapter: Chapter; scene: Scene; body: string }

/** Konteks untuk asisten: adegan aktif + entri story bible yang relevan (bukan seluruh novel). */
export function buildContext(p: Project, a: SceneCtx): { text: string; entries: Entry[] } {
  const entries = relevantEntries(p, a.scene, a.body)
  const m = a.scene.meta
  const detail = [
    ['Status', m.status], ['POV', m.pov], ['Lokasi', m.lokasi], ['Waktu cerita', m.waktu_cerita],
    ['Alur', m.alur], ['Sinopsis', m.sinopsis], ['Tokoh', Array.isArray(m.tokoh) ? m.tokoh.join(', ') : ''],
  ].filter(([, v]) => String(v ?? '').trim()).map(([k, v]) => `${k}: ${v}`).join('\n')
  const text = [
    `# Novel: ${p.data.judul}${p.data.genre ? ` (${p.data.genre})` : ''}`,
    `# Adegan aktif: ${chapterLabel(p, a.chapter)} — ${a.chapter.judul} · ${String(m.judul || '')}`,
    detail ? `## Detail adegan\n${detail}` : '',
    `## Naskah adegan\n<naskah>\n${a.body.trim() || '(masih kosong)'}\n</naskah>`,
    entries.length ? `## Story bible yang relevan\n${entries.map(describeEntry).join('\n\n')}` : '## Story bible yang relevan\n(belum ada entri yang disebut di adegan ini)',
  ].filter(Boolean).join('\n\n')
  return { text, entries }
}

const SYSTEM = `Kamu adalah asisten menulis di Aksara, aplikasi menulis novel. Penggunanya seorang novelis Indonesia.
- Jawab dalam Bahasa Indonesia yang baik dan alami.
- Hormati gaya dan suara penulis. Beri saran, bukan menulis ulang seluruh adegan, kecuali diminta.
- Jangan pernah menganggap saranmu sudah diterapkan: penulis yang memutuskan.
- Pakai story bible sebagai sumber kebenaran tentang tokoh, tempat, faksi, dan lore. Jika naskah bertentangan dengannya, sebutkan.
- Ringkas dan konkret. Pakai daftar bernomor bila memberi beberapa pilihan.
- Kaidah bahasa mengacu pada EYD edisi V / PUEBI.`

// ---------------------------------------------------------------- Kesalahan

export function friendlyError(e: unknown): string {
  if (!navigator.onLine) return 'Asisten butuh internet. Periksa koneksi lalu coba lagi.'
  if (e instanceof Anthropic.AuthenticationError) return 'API key ditolak. Periksa kembali key Anda di pengaturan Asisten.'
  if (e instanceof Anthropic.PermissionDeniedError) return 'API key ini tidak punya izin untuk model Claude yang dipakai.'
  if (e instanceof Anthropic.RateLimitError) return 'Terlalu banyak permintaan atau batas pengeluaran tercapai. Tunggu sebentar lalu coba lagi.'
  if (e instanceof Anthropic.BadRequestError) return `Permintaan ditolak: ${e.message}`
  if (e instanceof Anthropic.APIConnectionError) return 'Tidak bisa menghubungi Claude. Periksa koneksi internet.'
  if (e instanceof Anthropic.APIError) return `Claude sedang bermasalah (kode ${e.status}). Coba lagi sebentar lagi.`
  return 'Terjadi kesalahan. Coba lagi.'
}

export class RefusalError extends Error {}

// ---------------------------------------------------------------- Obrolan

export interface ChatTurn { role: 'user' | 'assistant'; text: string }

/** Obrolan bebas dengan streaming. onText dipanggil dengan teks yang terus bertambah. */
export async function chat(client: Anthropic, context: string, history: ChatTurn[], onText: (t: string) => void, signal?: AbortSignal) {
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 32000,
    betas: BETAS,
    fallbacks: 'default',
    output_config: { effort: 'medium' },
    system: [{ type: 'text', text: SYSTEM }, { type: 'text', text: context, cache_control: { type: 'ephemeral' } }],
    messages: history.slice(-12).map((t) => ({ role: t.role, content: t.text })),
  }, { signal })
  let text = ''
  stream.on('text', (delta) => { text += delta; onText(text) })
  const msg = await stream.finalMessage()
  if (msg.stop_reason === 'refusal') throw new RefusalError()
  return text
}

/** Permintaan dengan jawaban JSON terstruktur (ejaan, cari adegan, konsistensi). */
async function structured<T>(client: Anthropic, system: string, context: string, task: string, schema: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 32000,
    betas: BETAS,
    fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema } },
    system: [{ type: 'text', text: system }, { type: 'text', text: context, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: task }],
  }, { signal })
  const msg = await stream.finalMessage()
  if (msg.stop_reason === 'refusal') throw new RefusalError()
  const text = msg.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('')
  return JSON.parse(text) as T
}

// ---------------------------------------------------------------- Periksa ejaan

export interface SpellSuggestion { kutipan: string; ganti: string; alasan: string; jenis: 'ejaan' | 'kalimat' }

export async function checkSpelling(client: Anthropic, context: string, signal?: AbortSignal): Promise<SpellSuggestion[]> {
  const r = await structured<{ saran: SpellSuggestion[] }>(client, SYSTEM, context,
    `Periksa ejaan dan kalimat pada <naskah> adegan aktif menurut EYD edisi V / PUEBI.
Untuk setiap masalah, beri:
- kutipan: potongan teks PERSIS seperti tertulis di naskah (salin huruf demi huruf, termasuk tanda baca), sesingkat mungkin tapi unik — biasanya 1–6 kata;
- ganti: teks pengganti untuk kutipan itu;
- alasan: alasan singkat (satu kalimat) yang menyebut kaidahnya;
- jenis: "ejaan" untuk salah tulis/tanda baca/huruf kapital/kata baku, "kalimat" untuk struktur kalimat.
Jangan menyarankan perubahan gaya yang disengaja (dialog tidak baku, nama tokoh, istilah dunia cerita dari story bible). Maksimal 25 saran, urut sesuai kemunculan. Jika tidak ada masalah, kembalikan daftar kosong.`,
    {
      type: 'object',
      properties: {
        saran: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              kutipan: { type: 'string' }, ganti: { type: 'string' }, alasan: { type: 'string' },
              jenis: { type: 'string', enum: ['ejaan', 'kalimat'] },
            },
            required: ['kutipan', 'ganti', 'alasan', 'jenis'],
            additionalProperties: false,
          },
        },
      },
      required: ['saran'],
      additionalProperties: false,
    }, signal)
  return r.saran.filter((s) => s.kutipan && s.kutipan !== s.ganti)
}

// ---------------------------------------------------------------- Cari adegan

export interface SceneHit { adegan: string; kutipan: string; alasan: string }

/** Ringkasan semua adegan (judul, detail, dan cuplikan naskah) untuk pencarian. */
export function sceneDigest(p: Project, current?: { id: string; body: string }): string {
  const out: string[] = []
  for (const c of p.chapters) for (const s of c.scenes) {
    const id = sceneId(c, s)
    const body = (current && current.id === id ? current.body : s.body).replace(/<[^>]+>/g, '').trim()
    const m = s.meta
    out.push([
      `<adegan id="${id}">`,
      `${chapterLabel(p, c)} — ${c.judul} · ${String(m.judul || '')}`,
      m.sinopsis ? `Sinopsis: ${m.sinopsis}` : '',
      Array.isArray(m.tokoh) && m.tokoh.length ? `Tokoh: ${m.tokoh.join(', ')}` : '',
      m.lokasi ? `Lokasi: ${m.lokasi}` : '',
      body.length > 4000 ? body.slice(0, 4000) + ' […]' : body || '(kosong)',
      '</adegan>',
    ].filter(Boolean).join('\n'))
  }
  return `# Novel: ${p.data.judul}\n\n${out.join('\n\n')}`
}

export async function findScenes(client: Anthropic, digest: string, query: string, signal?: AbortSignal): Promise<SceneHit[]> {
  const r = await structured<{ hasil: SceneHit[] }>(client, SYSTEM, digest,
    `Cari adegan yang paling cocok dengan permintaan ini: "${query}".
Kembalikan maksimal 5 adegan, paling cocok dulu. Untuk masing-masing:
- adegan: nilai atribut id dari tag <adegan> (salin persis);
- kutipan: kalimat PERSIS dari naskah adegan itu yang paling menunjukkan kecocokan (atau sinopsisnya bila naskah kosong);
- alasan: satu kalimat mengapa cocok.
Jika tidak ada yang cocok, kembalikan daftar kosong.`,
    {
      type: 'object',
      properties: {
        hasil: {
          type: 'array',
          items: {
            type: 'object',
            properties: { adegan: { type: 'string' }, kutipan: { type: 'string' }, alasan: { type: 'string' } },
            required: ['adegan', 'kutipan', 'alasan'],
            additionalProperties: false,
          },
        },
      },
      required: ['hasil'],
      additionalProperties: false,
    }, signal)
  return r.hasil
}

// ---------------------------------------------------------------- Cek konsistensi

export interface Finding { kutipan: string; masalah: string; rujukan: string }

export async function checkConsistency(client: Anthropic, context: string, signal?: AbortSignal): Promise<Finding[]> {
  const r = await structured<{ temuan: Finding[] }>(client, SYSTEM, context,
    `Periksa konsistensi <naskah> adegan aktif terhadap story bible dan detail adegan:
nama/alias yang salah, faksi atau peran yang keliru, sifat fisik yang bertentangan, POV yang berganti tanpa sengaja, lokasi atau waktu yang tidak cocok.
Untuk setiap temuan:
- kutipan: potongan teks PERSIS dari naskah yang bermasalah (salin huruf demi huruf);
- masalah: penjelasan singkat;
- rujukan: entri story bible atau detail adegan yang menjadi acuan (mis. "Tokoh: Elara — Usia: 19").
Jangan menebak di luar data yang ada. Maksimal 15 temuan. Jika semuanya konsisten, kembalikan daftar kosong.`,
    {
      type: 'object',
      properties: {
        temuan: {
          type: 'array',
          items: {
            type: 'object',
            properties: { kutipan: { type: 'string' }, masalah: { type: 'string' }, rujukan: { type: 'string' } },
            required: ['kutipan', 'masalah', 'rujukan'],
            additionalProperties: false,
          },
        },
      },
      required: ['temuan'],
      additionalProperties: false,
    }, signal)
  return r.temuan
}
