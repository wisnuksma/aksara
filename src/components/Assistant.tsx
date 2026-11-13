import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  buildContext, chat, checkConsistency, checkSpelling, findScenes, forgetApiKey, friendlyError, loadApiKey, makeClient,
  RefusalError, saveApiKey, sceneDigest, type ChatTurn, type Finding, type SceneCtx, type SceneHit, type SpellSuggestion,
} from '../lib/ai'
import type { Project } from '../lib/project'
import './assistant.css'

export type AItem =
  | { kind: 'user'; text: string }
  | { kind: 'assistant'; text: string; pending?: boolean }
  | { kind: 'spell'; count: number }
  | { kind: 'hits'; query: string; hits: SceneHit[] }
  | { kind: 'findings'; items: Finding[] }
  | { kind: 'error'; text: string }
  | { kind: 'note'; text: string }

interface Props {
  project: Project
  /** Adegan aktif (naskah terbaru diambil dari editor). */
  getScene: () => SceneCtx | null
  items: AItem[]
  setItems: (fn: (prev: AItem[]) => AItem[]) => void
  onSpelling: (list: SpellSuggestion[]) => void
  onOpenScene: (id: string, kutipan: string) => void
  onShowText: (kutipan: string) => boolean
  sceneTitle: (id: string) => string
}

type Busy = null | 'chat' | 'spell' | 'search' | 'consistency'

export default function Assistant(props: Props) {
  const { project: p, getScene, items, setItems } = props
  const [apiKey, setApiKey] = useState<string | null | undefined>(undefined) // undefined = memuat
  const [settings, setSettings] = useState(false)
  const [input, setInput] = useState('')
  const [mode, setMode] = useState<'chat' | 'search'>('chat')
  const [busy, setBusy] = useState<Busy>(null)
  const abort = useRef<AbortController | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { loadApiKey().then((k) => setApiKey(k || null)) }, [])
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }) }, [items])
  useEffect(() => () => abort.current?.abort(), [])

  const scene = getScene()
  const ctxInfo = scene ? buildContext(p, scene) : null

  if (apiKey === undefined) return null
  if (!apiKey || settings) {
    return <KeySetup hasKey={!!apiKey} onSave={async (k) => { await saveApiKey(k); setApiKey(k); setSettings(false) }}
      onForget={async () => { await forgetApiKey(); setApiKey(null); setSettings(false) }}
      onCancel={apiKey ? () => setSettings(false) : undefined} />
  }
  const client = makeClient(apiKey)

  async function run<T>(what: Exclude<Busy, null>, fn: (signal: AbortSignal) => Promise<T>) {
    abort.current?.abort()
    const ac = new AbortController()
    abort.current = ac
    setBusy(what)
    try {
      return await fn(ac.signal)
    } catch (e) {
      if (ac.signal.aborted) return
      console.error(e)
      const text = e instanceof RefusalError ? 'Claude menolak permintaan ini. Coba ubah kata-katanya.' : friendlyError(e)
      setItems((prev) => [...prev.filter((x) => !(x.kind === 'assistant' && x.pending && !x.text)), { kind: 'error', text }])
    } finally {
      if (abort.current === ac) { setBusy(null); abort.current = null }
    }
  }

  const history = (list: AItem[]): ChatTurn[] =>
    list.filter((x): x is Extract<AItem, { kind: 'user' | 'assistant' }> => (x.kind === 'user' || x.kind === 'assistant') && !!x.text)
      .map((x) => ({ role: x.kind, text: x.text }))

  async function sendChat(text: string) {
    const sc = getScene()
    if (!sc) return
    const next: AItem[] = [...items, { kind: 'user', text }]
    setItems(() => [...next, { kind: 'assistant', text: '', pending: true }])
    await run('chat', async (signal) => {
      const { text: ctx } = buildContext(p, sc)
      const done = await chat(client, ctx, history(next), (t) => {
        setItems((prev) => prev.map((x, i) => (i === prev.length - 1 && x.kind === 'assistant' ? { ...x, text: t } : x)))
      }, signal)
      setItems((prev) => prev.map((x, i) => (i === prev.length - 1 && x.kind === 'assistant' ? { kind: 'assistant', text: done } : x)))
    })
  }

  async function send() {
    const text = input.trim()
    if (!text || busy) return
    setInput('')
    if (mode === 'search') { setMode('chat'); return search(text) }
    await sendChat(text)
  }

  async function stuck() {
    await sendChat('Saya buntu. Berikan 3 arah yang bisa terjadi selanjutnya di adegan ini, yang cocok dengan story bible. Untuk tiap arah: judul singkat tebal, lalu 1–2 kalimat.')
  }

  async function spelling() {
    const sc = getScene()
    if (!sc) return
    if (!sc.body.trim()) { setItems((prev) => [...prev, { kind: 'note', text: 'Adegan ini masih kosong — belum ada yang bisa diperiksa.' }]); return }
    setItems((prev) => [...prev, { kind: 'user', text: 'Periksa ejaan adegan ini.' }])
    await run('spell', async (signal) => {
      const list = await checkSpelling(client, buildContext(p, sc).text, signal)
      props.onSpelling(list)
      setItems((prev) => [...prev, { kind: 'spell', count: list.length }])
    })
  }

  async function search(query: string) {
    setItems((prev) => [...prev, { kind: 'user', text: `Cari adegan: ${query}` }])
    await run('search', async (signal) => {
      const sc = getScene()
      const hits = await findScenes(client, sceneDigest(p, sc ? { id: `${sc.chapter.folder}/${sc.scene.file}`, body: sc.body } : undefined), query, signal)
      setItems((prev) => [...prev, { kind: 'hits', query, hits }])
    })
  }

  async function consistency() {
    const sc = getScene()
    if (!sc) return
    setItems((prev) => [...prev, { kind: 'user', text: 'Cek konsistensi adegan ini dengan story bible.' }])
    await run('consistency', async (signal) => {
      const found = await checkConsistency(client, buildContext(p, sc).text, signal)
      setItems((prev) => [...prev, { kind: 'findings', items: found }])
    })
  }

  const disabled = !!busy || !scene

  return (
    <div className="ai">
      <div className="ai-quick">
        <button onClick={stuck} disabled={disabled}>Saya buntu</button>
        <button onClick={spelling} disabled={disabled}>Periksa ejaan</button>
        <button onClick={() => { setMode('search'); inputRef.current?.focus() }} disabled={!!busy} className={mode === 'search' ? 'is-on' : ''}>Cari adegan</button>
        <button onClick={consistency} disabled={disabled}>Cek konsistensi</button>
      </div>

      <div className="ai-list" ref={listRef} aria-live="polite">
        {items.length === 0 && (
          <div className="ai-hello">
            <span className="ai-hello-title">Tanya apa saja tentang ceritamu</span>
            <span>Asisten membaca adegan yang sedang dibuka dan entri story bible yang disebut di dalamnya — bukan seluruh novel. Ia tidak pernah mengubah naskah tanpa persetujuanmu.</span>
          </div>
        )}
        {items.map((it, i) => <Item key={i} it={it} {...props} />)}
        {busy && busy !== 'chat' && <div className="ai-working">{busy === 'spell' ? 'Memeriksa ejaan…' : busy === 'search' ? 'Mencari adegan…' : 'Memeriksa konsistensi…'}</div>}
      </div>

      <div className="ai-foot">
        <div className="ai-context">
          <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 6h16M4 12h10M4 18h7" /></svg>
          {mode === 'search' ? 'Mencari di semua adegan' : `Konteks: adegan ini${ctxInfo?.entries.length ? ` + ${ctxInfo.entries.length} entri story bible` : ''}`}
          <button className="ai-settings" onClick={() => setSettings(true)} title="Pengaturan Asisten">Pengaturan</button>
        </div>
        <div className={'ai-input' + (mode === 'search' ? ' is-search' : '')}>
          {mode === 'search' && <button className="ai-mode" onClick={() => setMode('chat')} title="Batal mencari">Cari ×</button>}
          <textarea ref={inputRef} rows={2} value={input} aria-label="Pesan untuk asisten"
            placeholder={mode === 'search' ? 'Adegan apa yang dicari? mis. saat Aldric pertama curiga pada Navea' : 'Tanya apa saja tentang cerita Anda…'}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } if (e.key === 'Escape' && mode === 'search') { e.stopPropagation(); setMode('chat') } }} />
          {busy ? (
            <button className="ai-send" onClick={() => abort.current?.abort()} aria-label="Hentikan" title="Hentikan">
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
            </button>
          ) : (
            <button className="ai-send" onClick={send} disabled={!input.trim() || !scene} aria-label="Kirim" title="Kirim (Enter)">
              <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function Item({ it, onOpenScene, onShowText, sceneTitle }: { it: AItem } & Props) {
  switch (it.kind) {
    case 'user': return <div className="ai-user">{it.text}</div>
    case 'assistant': return <div className="ai-answer">{it.text ? <Markdown text={it.text} /> : <span className="ai-dots" aria-label="Menulis jawaban"><i /><i /><i /></span>}</div>
    case 'error': return <div className="ai-error" role="alert">{it.text}</div>
    case 'note': return <div className="ai-note">{it.text}</div>
    case 'spell': return (
      <div className="ai-answer">
        <p>{it.count
          ? <>Ada <b>{it.count} saran</b>, ditandai garis merah bergelombang di naskah. Klik tandanya untuk melihat saran, lalu pilih <b>Terima</b> atau <b>Abaikan</b>.</>
          : <>Tidak ada masalah ejaan yang ditemukan di adegan ini.</>}</p>
      </div>
    )
    case 'hits': return (
      <div className="ai-answer">
        <span>{it.hits.length ? `Ketemu ${it.hits.length} adegan:` : `Tidak ada adegan yang cocok dengan “${it.query}”.`}</span>
        {it.hits.map((h, i) => (
          <button key={i} className="ai-card ai-hit" onClick={() => onOpenScene(h.adegan, h.kutipan)}>
            <span className="ai-hit-title">{sceneTitle(h.adegan)}</span>
            <span className="ai-quote">“{h.kutipan}”</span>
            <span className="ai-why">{h.alasan}</span>
          </button>
        ))}
      </div>
    )
    case 'findings': return (
      <div className="ai-answer">
        <span>{it.items.length ? `Ada ${it.items.length} hal yang perlu dicek:` : 'Adegan ini konsisten dengan story bible.'}</span>
        {it.items.map((f, i) => (
          <div key={i} className="ai-card">
            <span className="ai-quote">“{f.kutipan}”</span>
            <span>{f.masalah}</span>
            <span className="ai-why">Acuan: {f.rujukan}</span>
            <button className="ai-link" onClick={(e) => { if (!onShowText(f.kutipan)) (e.target as HTMLButtonElement).textContent = 'Teks sudah berubah' }}>Tunjukkan di naskah</button>
          </div>
        ))}
      </div>
    )
  }
}

/** Markdown sederhana (paragraf, daftar, tebal, miring) tanpa HTML mentah. */
function Markdown({ text }: { text: string }) {
  const inline = (s: string): ReactNode[] => {
    const out: ReactNode[] = []
    const re = /\*\*(.+?)\*\*|\*(.+?)\*|_(.+?)_/g
    let last = 0
    for (let m; (m = re.exec(s)); ) {
      if (m.index > last) out.push(s.slice(last, m.index))
      out.push(m[1] ? <b key={m.index}>{m[1]}</b> : <i key={m.index}>{m[2] ?? m[3]}</i>)
      last = m.index + m[0].length
    }
    if (last < s.length) out.push(s.slice(last))
    return out
  }
  const blocks = text.trim().split(/\n{2,}/)
  return (
    <>
      {blocks.map((b, i) => {
        const lines = b.split('\n')
        if (lines.every((l) => /^\s*(\d+[.)]|[-*•])\s+/.test(l))) {
          const ordered = /^\s*\d/.test(lines[0])
          const Tag = ordered ? 'ol' : 'ul'
          return <Tag key={i}>{lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*(\d+[.)]|[-*•])\s+/, ''))}</li>)}</Tag>
        }
        if (/^#{1,4}\s/.test(b)) return <p key={i}><b>{inline(b.replace(/^#{1,4}\s+/, ''))}</b></p>
        return <p key={i}>{lines.map((l, j) => <Fragment key={j}>{j > 0 && <br />}{inline(l)}</Fragment>)}</p>
      })}
    </>
  )
}

function KeySetup({ hasKey, onSave, onForget, onCancel }: { hasKey: boolean; onSave: (k: string) => void; onForget: () => void; onCancel?: () => void }) {
  const [k, setK] = useState('')
  const valid = /^sk-ant-[\w-]{20,}$/.test(k.trim())
  return (
    <div className="ai-setup">
      <span className="side-empty-icon" aria-hidden="true">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="1.6" strokeLinejoin="round"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /></svg>
      </span>
      <span className="side-empty-title">{hasKey ? 'Pengaturan Asisten' : 'Hubungkan Asisten AI'}</span>
      <p>Asisten memakai <b>Claude</b> dari Anthropic dengan API key milik Anda sendiri. Biaya dihitung per pemakaian di akun Anthropic Anda.</p>
      <ol>
        <li>Buka <b>console.anthropic.com</b> → <b>API Keys</b> → <b>Create Key</b>.</li>
        <li>Sebaiknya atur <b>batas pengeluaran bulanan</b> di bagian Billing / Limits.</li>
        <li>Salin key (diawali <code>sk-ant-</code>) dan tempel di bawah.</li>
      </ol>
      <div className="ai-risk">
        <b>Tentang keamanan:</b> key disimpan <b>hanya di Mac ini</b> (di penyimpanan Chrome untuk Aksara), tidak di folder novel dan tidak dikirim ke mana pun selain Anthropic. Karena Aksara memanggil Claude langsung dari browser, siapa pun yang bisa membuka Aksara di Mac ini secara teknis bisa melihat key tersebut. Jangan pasang Aksara dengan key Anda di komputer bersama.
      </div>
      <input className="input" type="password" value={k} placeholder={hasKey ? 'Tempel key baru untuk mengganti' : 'sk-ant-…'}
        onChange={(e) => setK(e.target.value)} aria-label="API key Anthropic" autoComplete="off" spellCheck={false} />
      {k && !valid && <span className="ai-bad">Key Anthropic biasanya diawali “sk-ant-”.</span>}
      <div className="ai-setup-actions">
        {onCancel && <button className="btn btn-sm" onClick={onCancel}>Batal</button>}
        <button className="btn btn-primary btn-sm" disabled={!valid} onClick={() => onSave(k.trim())}>Simpan key</button>
      </div>
      {hasKey && <button className="ai-forget" onClick={onForget}>Hapus key dari Mac ini</button>}
    </div>
  )
}
