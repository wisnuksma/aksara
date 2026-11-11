import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { get, set } from 'idb-keyval'
import Editor from '../components/Editor'
import Binder from '../components/Binder'
import * as ops from '../lib/binderOps'
import { chapterLabel, nextChapterTitle, saveScene, sceneId, totalWords, type Chapter, type Project, type Scene } from '../lib/project'
import { loadStats, saveStats, todayKey, type Stats } from '../lib/stats'
import { saveProjectFile } from '../lib/project'
import { formatNumber, rememberProject } from '../lib/recent'
import './workspace.css'

type SaveState = 'saved' | 'dirty' | 'saving' | 'error'
type Tab = 'asisten' | 'adegan' | 'catatan'

interface Props {
  project: Project
  onClose: () => void
}

const ZOOM_KEY = 'aksara-zoom'
const readZoom = () => { try { return Number(localStorage.getItem(ZOOM_KEY)) || 100 } catch { return 100 } }

export default function Workspace({ project, onClose }: Props) {
  const p = project

  const firstId = useMemo(() => {
    for (const c of p.chapters) for (const s of c.scenes) return sceneId(c, s)
    return null
  }, [p])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [save, setSave] = useState<SaveState>('saved')
  const [stats, setStats] = useState<Stats>({ harian: {} })
  const [zoom, setZoom] = useState(readZoom)
  const [showLeft, setShowLeft] = useState(true)
  const [showRight, setShowRight] = useState(true)
  const [tab, setTab] = useState<Tab>(() => (totalWords(project) === 0 ? 'asisten' : 'catatan'))
  const [focusMode, setFocusMode] = useState(false)
  const [targetOpen, setTargetOpen] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [, setVersion] = useState(0)
  const bump = () => setVersion((v) => v + 1)

  // Isi editor aktif diambil lewat fungsi ini saat menyimpan.
  const getBody = useRef<(() => string) | null>(null)
  const dirty = useRef<{ chapter: Chapter; scene: Scene } | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const chain = useRef<Promise<void>>(Promise.resolve())
  const statsRef = useRef(stats)
  statsRef.current = stats
  const activeIdRef = useRef(activeId)
  activeIdRef.current = activeId
  const focusRef = useRef(focusMode)
  focusRef.current = focusMode

  const find = useCallback((id: string | null) => {
    for (const c of p.chapters) for (const s of c.scenes) if (sceneId(c, s) === id) return { chapter: c, scene: s }
    return null
  }, [p])

  // Muat statistik & adegan terakhir yang dibuka
  useEffect(() => {
    loadStats(p.root).then(setStats)
    get<string>(`last-scene:${p.data.id}`).catch(() => null).then((id) => {
      const target = id && find(id) ? id : firstId
      setActiveId(target)
      const hit = find(target)
      if (hit) setExpanded(new Set([hit.chapter.folder]))
    })
  }, [p, find, firstId])

  /** Simpan perubahan yang tertunda sekarang juga. Aman dipanggil berkali-kali. */
  const flush = useCallback(() => {
    window.clearTimeout(timer.current)
    const d = dirty.current
    if (!d) return chain.current
    if (getBody.current) d.scene.body = getBody.current()
    dirty.current = null
    setSave('saving')
    chain.current = chain.current.then(async () => {
      try {
        await saveScene(p, d.chapter, d.scene)
        await saveStats(p.root, statsRef.current)
        if (!dirty.current) setSave('saved')
        rememberProject({
          id: p.data.id, title: p.data.judul, genre: p.data.genre, words: totalWords(p),
          lastOpened: new Date().toISOString(), handle: p.root,
        }).catch(() => {})
      } catch (e) {
        console.error(e)
        // Kembalikan ke antrean supaya dicoba lagi pada penyimpanan berikutnya.
        dirty.current ??= d
        setSave('error')
      }
    })
    return chain.current
  }, [p])

  const onChange = useCallback((words: number) => {
    const hit = find(activeId)
    if (!hit) return
    const delta = words - hit.scene.words
    hit.scene.words = words
    if (delta) {
      const k = todayKey()
      setStats((s) => ({ harian: { ...s.harian, [k]: (s.harian[k] ?? 0) + delta } }))
    }
    dirty.current = hit
    setSave('dirty')
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(flush, 1000)
  }, [activeId, find, flush])

  const onReady = useCallback((fn: () => string) => { getBody.current = fn }, [])

  // Simpan saat jendela kehilangan fokus / disembunyikan / ditutup
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') flush() }
    const onBlur = () => flush()
    const onUnload = (e: BeforeUnloadEvent) => {
      if (dirty.current) { flush(); e.preventDefault() }
    }
    window.addEventListener('blur', onBlur)
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('beforeunload', onUnload)
    return () => {
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('beforeunload', onUnload)
    }
  }, [flush])

  // ⌘S = simpan sekarang (kebiasaan), walau sudah otomatis
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey
      const k = e.key.toLowerCase()
      if (mod && k === 's') { e.preventDefault(); flush() }
      else if (mod && e.key === '.') { e.preventDefault(); setFocusMode((f) => !f) }
      else if (mod && k === 'n') {
        e.preventDefault()
        const c = find(activeIdRef.current)?.chapter ?? p.chapters[p.chapters.length - 1]
        if (c) actionsRef.current.addScene(c); else actionsRef.current.addChapter()
      }
      else if (e.key === 'Escape' && focusRef.current) { setFocusMode(false) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [flush, find, p])

  function openScene(c: Chapter, s: Scene) {
    const id = sceneId(c, s)
    if (id === activeId) return
    flush()
    selectScene(c, s)
  }

  function toggleChapter(c: Chapter) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(c.folder)) next.delete(c.folder); else next.add(c.folder)
      return next
    })
  }

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  /** Jalankan perubahan binder: simpan dulu yang tertunda, lalu ubah file. */
  async function change(what: string, fn: () => Promise<void>) {
    if (busy) return
    setBusy(true)
    try {
      await flush()
      await fn()
    } catch (e) {
      console.error(e)
      setToast(`Gagal ${what}. Tidak ada file yang hilang — coba lagi.`)
    } finally {
      setBusy(false)
      bump()
    }
  }

  const expand = (c: Chapter) => setExpanded((prev) => new Set(prev).add(c.folder))

  function selectScene(c: Chapter, s: Scene) {
    getBody.current = null
    const id = sceneId(c, s)
    setActiveId(id)
    set(`last-scene:${p.data.id}`, id).catch(() => {})
  }

  const actions = {
    openScene,
    toggleChapter,
    addChapter: () => change('menambah bab', async () => {
      const c = await ops.addChapter(p, nextChapterTitle(p))
      expand(c)
      selectScene(c, c.scenes[0])
      setEditing(`ch:${c.folder}`)
    }),
    addScene: (c: Chapter) => change('menambah adegan', async () => {
      const s = await ops.addScene(p, c, `Adegan ${c.scenes.length + 1}`)
      expand(c)
      selectScene(c, s)
      setEditing(`sc:${sceneId(c, s)}`)
    }),
    renameChapter: (c: Chapter, judul: string) => change('mengubah nama bab', () => ops.renameChapter(p, c, judul)),
    renameScene: (c: Chapter, s: Scene, judul: string) => change('mengubah nama adegan', () => ops.renameScene(p, c, s, judul)),
    moveChapter: (from: number, to: number) => {
      if (to < 0 || to >= p.chapters.length) return
      change('memindahkan bab', () => ops.moveChapter(p, from, to))
    },
    moveScene: (src: Chapter, s: Scene, dst: Chapter, index: number) => change('memindahkan adegan', async () => {
      const wasActive = sceneId(src, s) === activeId
      await ops.moveScene(p, src, s, dst, index)
      if (wasActive) { selectScene(dst, s); expand(dst) }
    }),
  }

  const actionsRef = useRef(actions)
  actionsRef.current = actions

  async function setDailyTarget(n: number) {
    p.data.target_harian = n
    setTargetOpen(false)
    await change('menyimpan target harian', () => saveProjectFile(p))
  }

  async function close() {
    await flush()
    onClose()
  }

  const changeZoom = (z: number) => {
    setZoom(z)
    try { localStorage.setItem(ZOOM_KEY, String(z)) } catch { /* abaikan */ }
  }

  const active = find(activeId)
  const sceneIndex = active ? active.chapter.scenes.indexOf(active.scene) : -1
  const chapterWords = (c: Chapter) => c.scenes.reduce((n, s) => n + s.words, 0)
  const total = totalWords(p)
  const today = Math.max(0, stats.harian[todayKey()] ?? 0)
  const dailyTarget = p.data.target_harian || 0


  return (
    <div className={'ws' + (focusMode ? ' is-focus' : '')}>
      {!focusMode && (
      <header className="ws-header">
        <button className="ws-icon-btn ws-back" onClick={close} aria-label="Kembali ke layar sambutan" title="Kembali ke layar sambutan">
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
        </button>
        <div className="ws-title">
          <span className="ws-monogram" aria-hidden="true">A</span>
          <span className={'ws-novel' + (p.data.judul === 'Novel tanpa judul' ? ' is-untitled' : '')}>{p.data.judul}</span>
        </div>
        <div className="ws-spacer" />
        <div className="ws-modes" role="group" aria-label="Mode kerja">
          <button className="is-active" aria-pressed="true">Menulis</button>
          <button disabled title="Hadir di fase berikutnya">Merencanakan</button>
          <button disabled title="Hadir di fase berikutnya">Dunia</button>
        </div>
        <button className="ws-search" disabled title="Pencarian hadir di fase berikutnya">
          <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          Cari…
          <kbd>⌘K</kbd>
        </button>
        <div className="ws-toggles">
          <button className={'ws-icon-btn' + (showLeft ? ' is-on' : '')} onClick={() => setShowLeft((v) => !v)}
            aria-pressed={showLeft} aria-label="Tampilkan binder" title="Tampilkan / sembunyikan binder">
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></svg>
          </button>
          <button className={'ws-icon-btn' + (showRight ? ' is-on' : '')} onClick={() => setShowRight((v) => !v)}
            aria-pressed={showRight} aria-label="Tampilkan panel kanan" title="Tampilkan / sembunyikan panel kanan">
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M15 4v16" /></svg>
          </button>
        </div>
      </header>
      )}

      <div className="ws-body">
        {showLeft && !focusMode && (
          <nav className="binder" aria-label="Binder">
            <Binder project={p} activeId={activeId} expanded={expanded}
              editing={editing} setEditing={setEditing} busy={busy} {...actions} />

            <div className="daily">
              <Ring value={dailyTarget ? today / dailyTarget : 0} />
              <div className="daily-text">
                <span className="daily-count">{formatNumber(today)}{dailyTarget ? ` / ${formatNumber(dailyTarget)}` : ''} kata</span>
                <button className={'daily-label' + (today === 0 ? ' is-link' : '')} onClick={() => setTargetOpen((o) => !o)}
                  aria-expanded={targetOpen} title="Ubah target harian">
                  {today === 0 ? 'Atur target harian' : 'Target hari ini'}
                </button>
              </div>
              {targetOpen && <TargetPopover value={dailyTarget} onSave={setDailyTarget} onClose={() => setTargetOpen(false)} />}
            </div>
          </nav>
        )}

        <main className="ws-main">
          <div className="ws-center">
            {active ? (
              <Editor
                key={activeId!}
                markdown={active.scene.body}
                heading={`${chapterLabel(p, active.chapter)} · Adegan ${sceneIndex + 1}`}
                title={String(active.scene.meta.judul || '')}
                zoom={zoom}
                focusMode={focusMode}
                onRename={(t) => actions.renameScene(active.chapter, active.scene, t)}
                autoFocus={!editing}
                onZoom={changeZoom}
                onChange={onChange}
                onReady={onReady}
              />
            ) : (
              <div className="ws-noscene">
                <span className="ws-noscene-title">{p.chapters.length ? 'Belum ada adegan' : 'Naskah masih kosong'}</span>
                <span>Mulai dengan menambah {p.chapters.length ? 'adegan' : 'bab'} pertama.</span>
                <button className="btn btn-primary" onClick={() => {
                  const c = p.chapters[p.chapters.length - 1]
                  if (c) actions.addScene(c); else actions.addChapter()
                }}>{p.chapters.length ? 'Tambah adegan' : 'Tambah bab'}</button>
              </div>
            )}
            {!focusMode && (
            <footer className="ws-footer">
              <span className="ws-status">
                {active && <>Adegan ini {formatNumber(active.scene.words)} kata · </>}
                <SaveBadge state={save} onRetry={flush} />
              </span>
              <span>
                {active && <>Bab ini {formatNumber(chapterWords(active.chapter))} kata · </>}
                Total {formatNumber(total)}{p.data.target_kata ? ` / ${formatNumber(p.data.target_kata)}` : ''} kata
              </span>
            </footer>
            )}
          </div>

          {showRight && !focusMode && (
            <aside className="side" aria-label="Panel samping">
              <div className="side-tabs" role="tablist">
                {(['asisten', 'adegan', 'catatan'] as Tab[]).map((t) => (
                  <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'is-active' : ''} onClick={() => setTab(t)}>
                    {t === 'asisten' ? 'Asisten' : t === 'adegan' ? 'Adegan' : 'Catatan'}
                  </button>
                ))}
              </div>
              <div className="side-body" role="tabpanel">
                {tab === 'asisten' && (
                  <div className="side-empty">
                    <span className="side-empty-icon" aria-hidden="true">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="1.6" strokeLinejoin="round"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /></svg>
                    </span>
                    <span className="side-empty-title">Halaman kosong itu wajar</span>
                    <span className="side-empty-text">Tulis apa saja dulu, sesingkat apa pun. Merapikan bisa nanti.</span>
                    <ul className="side-tips">
                      <li><b>Ganti judul adegan</b> langsung di atas halaman, atau klik dua kali namanya di binder.</li>
                      <li><b>Pemisah adegan:</b> ketik <kbd>---</kbd> lalu Enter.</li>
                      <li><b>Mode fokus:</b> tekan <kbd>⌘.</kbd> untuk menyembunyikan semua panel.</li>
                    </ul>
                    <p className="side-soon">Asisten AI (ide saat buntu, periksa ejaan, cari adegan) hadir di Fase 3.</p>
                  </div>
                )}
                {tab === 'adegan' && (
                  <div className="side-note">
                    <span className="label">Detail adegan</span>
                    <p>Sinopsis, status, POV, lokasi, waktu, dan tokoh akan bisa diisi di sini pada Fase 2.</p>
                  </div>
                )}
                {tab === 'catatan' && (
                  <div className="side-note">
                    <span className="label">Catatan bab</span>
                    {active?.chapter.catatan
                      ? <p className="side-chapter-note">{active.chapter.catatan}</p>
                      : <p>Bab ini belum punya catatan.</p>}
                  </div>
                )}
              </div>
            </aside>
          )}
        </main>
      </div>
      {focusMode && (
        <div className="focus-pill">
          <SaveBadge state={save} onRetry={flush} />
          <span aria-hidden="true">·</span>
          <button onClick={() => setFocusMode(false)}>Keluar mode fokus <kbd>Esc</kbd></button>
        </div>
      )}
      {toast && <div className="toast" role="alert">{toast}</div>}
    </div>
  )
}

function TargetPopover({ value, onSave, onClose }: { value: number; onSave: (n: number) => void; onClose: () => void }) {
  const [v, setV] = useState(value ? String(value) : '')
  const ref = useRef<HTMLFormElement>(null)
  useEffect(() => {
    ref.current?.querySelector('input')?.select()
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node) && !(e.target as HTMLElement).closest('.daily')) onClose() }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [onClose])
  return (
    <form ref={ref} className="target-pop" onSubmit={(e) => { e.preventDefault(); onSave(Number(v.replace(/\D/g, '')) || 0) }}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }}>
      <label htmlFor="target-harian">Target kata per hari</label>
      <div className="target-row">
        <input id="target-harian" inputMode="numeric" value={v} placeholder="mis. 500" autoFocus
          onChange={(e) => setV(e.target.value.replace(/\D/g, '').slice(0, 6))} />
        <button type="submit">Simpan</button>
      </div>
      <span className="target-hint">Kosongkan untuk tanpa target.</span>
    </form>
  )
}

function SaveBadge({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  if (state === 'error') {
    return <span className="save save-error" role="alert">Gagal menyimpan · <button onClick={onRetry}>Coba lagi</button></span>
  }
  const text = state === 'saved' ? 'Tersimpan' : 'Menyimpan…'
  return <span className={'save save-' + state} aria-live="polite"><span className="save-dot" aria-hidden="true" />{text}</span>
}

function Ring({ value }: { value: number }) {
  const r = 15, c = 2 * Math.PI * r
  const v = Math.max(0, Math.min(1, value))
  return (
    <svg className="ring" width="38" height="38" viewBox="0 0 38 38" aria-hidden="true">
      <circle cx="19" cy="19" r={r} fill="none" stroke="var(--ink-line-2)" strokeWidth="4" />
      <circle cx="19" cy="19" r={r} fill="none" stroke="var(--gold)" strokeWidth="4" strokeLinecap="round"
        strokeDasharray={`${v * c} ${c}`} transform="rotate(-90 19 19)" />
    </svg>
  )
}
