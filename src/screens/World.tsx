import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import Select from '../components/Select'
import Confirm from '../components/Confirm'
import {
  createEntry, deleteEntry, entryAliases, entryName, FACTION_COLORS, factionColor, freeFields,
  KIND_FIELDS, KIND_LABEL, KINDS, saveEntry, sortEntries, syncEntryFile, type BibleKind, type Entry,
} from '../lib/bible'
import type { Project } from '../lib/project'
import type { FrontMatter } from '../lib/frontmatter'
import './world.css'

type SaveState = 'saved' | 'saving' | 'error'

export interface WorldTarget { kind: BibleKind; file?: string; create?: boolean }

interface Props {
  project: Project
  target: WorldTarget
  onChanged: () => void
  /** Memberi fungsi "buat entri baru" ke induk (untuk ⌘N). */
  registerNew: (fn: () => void) => void
}

export default function World({ project: p, target, onChanged, registerNew }: Props) {
  const [kind, setKind] = useState<BibleKind>(target.kind)
  const [selected, setSelected] = useState<Entry | null>(null)
  const [query, setQuery] = useState('')
  const [save, setSave] = useState<SaveState>('saved')
  const [confirmDel, setConfirmDel] = useState<Entry | null>(null)
  const [focusName, setFocusName] = useState(0)
  const [, setV] = useState(0)
  const bump = () => { setV((v) => v + 1); onChanged() }

  const dirty = useRef<Entry | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const chain = useRef<Promise<void>>(Promise.resolve())

  const flush = useCallback(() => {
    window.clearTimeout(timer.current)
    const e = dirty.current
    if (!e) return chain.current
    dirty.current = null
    setSave('saving')
    chain.current = chain.current.then(async () => {
      try {
        await saveEntry(p.root, e)
        if (!dirty.current) setSave('saved')
      } catch (err) {
        console.error(err)
        dirty.current ??= e
        setSave('error')
      }
    })
    return chain.current
  }, [p])

  const changed = (e: Entry) => {
    dirty.current = e
    setSave('saving')
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(flush, 800)
    bump()
  }

  // Simpan saat keluar dari mode Dunia / jendela kehilangan fokus
  useEffect(() => {
    const onBlur = () => flush()
    window.addEventListener('blur', onBlur)
    return () => { window.removeEventListener('blur', onBlur); flush() }
  }, [flush])

  const add = useCallback(async (k: BibleKind = kind) => {
    await flush()
    try {
      const e = await createEntry(p.root, p.bible, k, `${KIND_LABEL[k]} baru`)
      setKind(k)
      setQuery('')
      setSelected(e)
      setFocusName((n) => n + 1)
      bump()
    } catch (err) {
      console.error(err)
      setSave('error')
    }
  }, [flush, kind, p]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => registerNew(() => add()), [registerNew, add])

  // Pilihan awal dari binder (mis. klik kartu faksi, atau "+ Tokoh")
  useEffect(() => {
    setKind(target.kind)
    if (target.create) { add(target.kind); return }
    const list = p.bible[target.kind]
    setSelected(list.find((e) => e.file === target.file) ?? list[0] ?? null)
  }, [target]) // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (e: Entry | null) => {
    flush()
    sortEntries(p.bible[e?.kind ?? kind])
    setSelected(e)
  }
  const switchKind = (k: BibleKind) => {
    setKind(k)
    setQuery('')
    choose(p.bible[k][0] ?? null)
  }

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    const all = p.bible[kind]
    if (!q) return all
    return all.filter((e) => [entryName(e), ...entryAliases(e)].some((s) => s.toLowerCase().includes(q)))
  }, [p, kind, query, selected, save]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Setelah nama diubah: urutkan daftar dan sesuaikan nama file. */
  async function renameFile(e: Entry) {
    await flush()
    try {
      await syncEntryFile(p.root, e)
    } catch (err) {
      console.error(err)
      setSave('error')
    }
    sortEntries(p.bible[e.kind])
    bump()
  }

  async function remove(e: Entry) {
    setConfirmDel(null)
    await flush()
    try {
      await deleteEntry(p.root, p.bible, e)
      setSelected(p.bible[kind][0] ?? null)
      bump()
    } catch (err) {
      console.error(err)
      setSave('error')
    }
  }

  return (
    <div className="world">
      <aside className="world-list" aria-label="Daftar story bible">
        <div className="world-kinds" role="tablist">
          {KINDS.map((k) => (
            <button key={k} role="tab" aria-selected={kind === k} className={kind === k ? 'is-active' : ''} onClick={() => switchKind(k)}>
              {KIND_LABEL[k]} <span className="world-count">{p.bible[k].length}</span>
            </button>
          ))}
        </div>
        <input className="world-search" type="search" placeholder={`Cari ${KIND_LABEL[kind].toLowerCase()}…`}
          value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Cari" />
        <ul className="world-items">
          {list.map((e) => (
            <li key={e.file}>
              <button className={'world-item' + (selected === e ? ' is-active' : '')} onClick={() => choose(e)}>
                {kind === 'faksi' && <span className="world-dot" style={{ background: factionColor(e.meta.warna).text }} aria-hidden="true" />}
                <span className="world-item-text">
                  <span className="world-item-name">{entryName(e)}</span>
                  <span className="world-item-sub">{subtitle(e) || ' '}</span>
                </span>
              </button>
            </li>
          ))}
          {list.length === 0 && query && <li className="world-none">Tidak ada yang cocok.</li>}
        </ul>
        <button className="world-add" onClick={() => add()}>+ {KIND_LABEL[kind]} baru</button>
      </aside>

      <div className="world-main">
        {selected ? (
          <EntryEditor key={String(selected.meta.id ?? selected.file) + selected.kind} entry={selected} project={p} focusName={focusName}
            onChange={changed} onNameBlur={() => renameFile(selected)} />
        ) : (
          <div className="world-empty">
            <span className="world-empty-title">Belum ada {KIND_LABEL[kind].toLowerCase()}</span>
            <span>{EMPTY_TEXT[kind]}</span>
            <button className="btn btn-primary" onClick={() => add()}>Tambah {KIND_LABEL[kind].toLowerCase()}</button>
          </div>
        )}
        <footer className="ws-footer">
          <span className="ws-status">
            {selected && <>{KIND_LABEL[selected.kind]} · </>}
            <span className={'save save-' + (save === 'saving' ? 'saving' : save)}>
              {save === 'error' ? <>Gagal menyimpan · <button onClick={() => { flush() }}>Coba lagi</button></>
                : <><span className="save-dot" aria-hidden="true" />{save === 'saved' ? 'Tersimpan' : 'Menyimpan…'}</>}
            </span>
          </span>
          {selected && <button className="world-delete" onClick={() => setConfirmDel(selected)}>Hapus {KIND_LABEL[selected.kind].toLowerCase()} ini…</button>}
        </footer>
      </div>

      {confirmDel && (
        <Confirm danger title={`Hapus "${entryName(confirmDel)}"?`}
          message={`File ${confirmDel.file} di folder bible/${confirmDel.kind} akan dihapus dari Mac Anda. Tindakan ini tidak bisa dibatalkan dari Aksara.`}
          confirmLabel="Hapus" onConfirm={() => remove(confirmDel)} onCancel={() => setConfirmDel(null)} />
      )}
    </div>
  )
}

const EMPTY_TEXT: Record<BibleKind, string> = {
  tokoh: 'Catat siapa saja yang hidup di ceritamu: nama, julukan, peran, dan faksinya.',
  tempat: 'Kota, benteng, sungai, dan negeri tempat cerita berlangsung.',
  faksi: 'Kerajaan, serikat, atau kelompok yang saling berhadapan, misalnya Estelle dan Navea.',
  lore: 'Sejarah, sihir, adat, dan aturan dunia yang perlu diingat.',
}

function subtitle(e: Entry): string {
  const m = e.meta
  const parts = e.kind === 'tokoh' ? [m.peran, m.faksi] : e.kind === 'tempat' ? [m.jenis, m.faksi] : e.kind === 'faksi' ? [m.jenis, m.pemimpin] : [m.jenis]
  return parts.map((x) => String(x ?? '').trim()).filter(Boolean).join(' · ')
}

// ---------------------------------------------------------------------------

interface EditorProps {
  entry: Entry
  project: Project
  focusName: number
  onChange: (e: Entry) => void
  onNameBlur: () => void
}

function EntryEditor({ entry: e, project: p, focusName, onChange, onNameBlur }: EditorProps) {
  const nameRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<[string, string][]>(() => freeFields(e))
  const set = (key: string, value: FrontMatter[string]) => { e.meta[key] = value; onChange(e) }

  useEffect(() => {
    if (focusName && nameRef.current) { nameRef.current.focus(); nameRef.current.select() }
  }, [focusName])

  /** Tulis ulang field bebas ke meta, menjaga urutan baris. */
  const writeRows = (next: [string, string][]) => {
    setRows(next)
    const fixed = Object.fromEntries(Object.entries(e.meta).filter(([k]) => !freeFields(e).some(([fk]) => fk === k)))
    for (const [k, v] of next) if (k.trim()) fixed[k.trim()] = v
    e.meta = fixed
    onChange(e)
  }

  const factions = p.bible.faksi.filter((f) => f !== e).map(entryName)

  return (
    <div className="entry-scroller">
      <article className="entry">
        <span className="label">{KIND_LABEL[e.kind]}</span>
        <input ref={nameRef} className="entry-name" value={String(e.meta.nama ?? '')} placeholder="Nama"
          aria-label="Nama" onChange={(ev) => set('nama', ev.target.value)} onBlur={onNameBlur} maxLength={120} />

        <div className="entry-grid">
          <div className="entry-field entry-wide">
            <span className="entry-label">Alias / julukan</span>
            <Chips values={entryAliases(e)} onChange={(v) => set('alias', v)} placeholder="Ketik lalu Enter, mis. Sang Putri" />
          </div>

          {KIND_FIELDS[e.kind].map((f) => (
            <div key={f.key} className="entry-field">
              <span className="entry-label">{f.label}</span>
              {f.key === 'faksi' ? (
                <Select className="entry-select" value={String(e.meta.faksi ?? '')}
                  options={['', ...factions.filter((n) => n !== String(e.meta.faksi ?? '')), ...(e.meta.faksi ? [String(e.meta.faksi)] : [])].filter((v, i, a) => a.indexOf(v) === i)}
                  label={(v) => v || '— Tidak ada —'} onChange={(v) => set('faksi', v)} aria-label={f.label} />
              ) : (
                <input className="input" value={String(e.meta[f.key] ?? '')} placeholder={f.hint}
                  onChange={(ev) => set(f.key, ev.target.value)} aria-label={f.label} />
              )}
            </div>
          ))}

          {e.kind === 'faksi' && (
            <div className="entry-field entry-wide">
              <span className="entry-label">Warna</span>
              <div className="swatches" role="radiogroup" aria-label="Warna faksi">
                {FACTION_COLORS.map((c) => (
                  <button key={c.key} role="radio" aria-checked={e.meta.warna === c.key} title={c.label}
                    className={'swatch' + (e.meta.warna === c.key ? ' is-on' : '')}
                    style={{ background: c.card, color: c.text }} onClick={() => set('warna', c.key)}>
                    {entryName(e).charAt(0).toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="entry-section">
          <span className="entry-label">Field bebas</span>
          <div className="free-rows">
            {rows.map(([k, v], i) => (
              <div className="free-row" key={i}>
                <input className="input free-key" value={k} placeholder="Nama field, mis. Usia"
                  onChange={(ev) => writeRows(rows.map((r, j) => (j === i ? [ev.target.value, r[1]] : r)))} />
                <input className="input" value={v} placeholder="Isi"
                  onChange={(ev) => writeRows(rows.map((r, j) => (j === i ? [r[0], ev.target.value] : r)))} />
                <button className="free-del" aria-label={`Hapus field ${k}`} title="Hapus field"
                  onClick={() => writeRows(rows.filter((_, j) => j !== i))}>×</button>
              </div>
            ))}
          </div>
          <button className="free-add" onClick={() => setRows([...rows, ['', '']])}>+ Tambah field</button>
        </div>

        <div className="entry-section">
          <span className="entry-label">Catatan</span>
          <AutoText value={e.body} onChange={(v) => { e.body = v; onChange(e) }}
            placeholder={e.kind === 'tokoh' ? 'Watak, latar belakang, keinginan, rahasia…' : 'Tulis apa saja yang perlu diingat…'} />
        </div>
      </article>
    </div>
  )
}

function Chips({ values, onChange, placeholder }: { values: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [text, setText] = useState('')
  const commit = () => {
    const parts = text.split(',').map((s) => s.trim()).filter(Boolean)
    if (parts.length) onChange([...values, ...parts.filter((x) => !values.includes(x))])
    setText('')
  }
  const onKey = (ev: KeyboardEvent) => {
    if (ev.key === 'Enter' || ev.key === ',') { ev.preventDefault(); commit() }
    else if (ev.key === 'Backspace' && !text && values.length) onChange(values.slice(0, -1))
  }
  return (
    <div className="chips">
      {values.map((v) => (
        <span key={v} className="chip">{v}<button aria-label={`Hapus ${v}`} onClick={() => onChange(values.filter((x) => x !== v))}>×</button></span>
      ))}
      <input value={text} onChange={(ev) => setText(ev.target.value)} onKeyDown={onKey} onBlur={commit}
        placeholder={values.length ? '' : placeholder} aria-label="Tambah alias" />
    </div>
  )
}

function AutoText({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [v, setV] = useState(value)
  useEffect(() => {
    const el = ref.current
    if (el) { el.style.height = '0'; el.style.height = Math.max(160, el.scrollHeight) + 'px' }
  }, [v])
  return (
    <textarea ref={ref} className="entry-notes" value={v} placeholder={placeholder}
      onChange={(ev) => { setV(ev.target.value); onChange(ev.target.value) }} />
  )
}
