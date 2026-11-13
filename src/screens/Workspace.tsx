import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { get, set } from 'idb-keyval'
import Editor from '../components/Editor'
import Binder from '../components/Binder'
import BibleSummary from '../components/BibleSummary'
import World, { type WorldTarget } from './World'
import Plan from '../plan/Plan'
import { bibleTerms, entryAliases, entryFaction, entryName, factionColor, findEntry, KIND_LABEL } from '../lib/bible'
import type { EditorApi, EntryCard, Suggestion } from '../components/Editor'
import Assistant, { type AItem } from '../components/Assistant'
import SceneInspector from '../components/SceneInspector'
import ExportDialog from '../components/ExportDialog'
import Snapshots from '../components/Snapshots'
import { latestSnapshotBody, listSnapshots, writeSnapshot } from '../lib/snapshots'
import { countMarkdownWords } from '../lib/words'
import type { FrontMatter } from '../lib/frontmatter'
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
  const [mode, setMode] = useState<'menulis' | 'dunia' | 'rencana'>('menulis')
  const [worldTarget, setWorldTarget] = useState<WorldTarget>({ kind: 'tokoh' })
  const worldNew = useRef<(() => void) | null>(null)
  const modeRef = useRef(mode)
  modeRef.current = mode
  const [targetOpen, setTargetOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [aiItems, setAiItems] = useState<AItem[]>([])
  const [suggestions, setSuggestions] = useState<Map<string, Suggestion[]>>(new Map())
  const editorApi = useRef<EditorApi | null>(null)
  const [snapRefresh, setSnapRefresh] = useState(0)
  const [restoreN, setRestoreN] = useState(0)
  // Isi adegan saat dibuka (untuk tahu apakah ada perubahan → snapshot otomatis)
  const openedBody = useRef(new Map<string, string>())
  const baselineChecked = useRef(new Set<string>())
  const [editing, setEditing] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
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

  useEffect(() => {
    const hit = find(activeId)
    if (hit && !openedBody.current.has(activeId!)) openedBody.current.set(activeId!, hit.scene.body)
  }, [activeId, find])

  /** Snapshot otomatis bila adegan berubah sejak dibuka (dipanggil saat meninggalkannya). */
  const autoSnapshot = useCallback(async (hit: { chapter: Chapter; scene: Scene } | null) => {
    if (!hit) return
    const id = sceneId(hit.chapter, hit.scene)
    const opened = openedBody.current.get(id)
    openedBody.current.delete(id)
    if (opened === undefined || opened === hit.scene.body) return
    try {
      if ((await latestSnapshotBody(p, hit.scene)) !== hit.scene.body) await writeSnapshot(p, hit.scene, 'otomatis')
      setSnapRefresh((n) => n + 1)
    } catch (e) { console.error('snapshot gagal', e) }
  }, [p])

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
    // Perubahan pertama pada adegan yang belum punya versi: simpan versi aslinya dulu
    const key = activeId!
    if (!baselineChecked.current.has(key)) {
      baselineChecked.current.add(key)
      const opened = openedBody.current.get(key)
      if (opened && opened.trim()) {
        listSnapshots(p, hit.scene).then((l) => l.length ? null : writeSnapshot(p, hit.scene, 'awal', '', opened))
          .then(() => setSnapRefresh((n) => n + 1)).catch(() => {})
      }
    }
  }, [activeId, find, flush, p])

  const onReady = useCallback((api: EditorApi) => { editorApi.current = api; getBody.current = api.getMarkdown }, [])

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
      else if (mod && e.key === '.') { e.preventDefault(); if (modeRef.current === 'menulis') setFocusMode((f) => !f) }
      else if (mod && k === 'n') {
        e.preventDefault()
        if (modeRef.current === 'dunia') { worldNew.current?.(); return }
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
    // Adegan yang ditinggalkan: simpan, lalu snapshot otomatis bila berubah
    const prev = find(activeIdRef.current)
    if (prev && prev.scene !== s) flush().then(() => autoSnapshot(prev))
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

  // Nama & alias untuk disorot di naskah (dihitung ulang saat story bible berubah)
  const terms = useMemo(() => bibleTerms(p.bible), [p, version]) // eslint-disable-line react-hooks/exhaustive-deps
  const describe = useCallback((id: string): EntryCard | null => {
    const e = findEntry(p.bible, id)
    if (!e) return null
    const f = entryFaction(p.bible, e)
    const c = f ? factionColor(f.meta.warna) : null
    const m = e.meta
    const sub = [e.kind === 'tokoh' ? m.peran : m.jenis, e.kind !== 'faksi' ? m.faksi : m.pemimpin]
      .map((x) => String(x ?? '').trim()).filter(Boolean).join(' · ')
    return {
      name: entryName(e), kind: KIND_LABEL[e.kind], sub, aliases: entryAliases(e),
      notes: e.body.trim().slice(0, 240), color: c?.ink ?? '#8A6A2B', colorDark: c?.text ?? '#D4B26C',
    }
  }, [p])
  const openEntry = useCallback((id: string) => {
    const e = findEntry(p.bible, id)
    if (e) openWorld({ kind: e.kind, file: e.file })
  }, [p]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Ubah detail adegan mana pun (dipakai papan plot). */
  async function updateSceneMeta(c: Chapter, s: Scene, patch: FrontMatter) {
    if (sceneId(c, s) === activeIdRef.current) { changeMeta(patch); return }
    Object.assign(s.meta, patch)
    bump()
    try { await saveScene(p, c, s) } catch { setToast('Gagal menyimpan detail adegan.') }
  }

  /** Ubah detail adegan (front matter) lalu simpan otomatis. */
  function changeMeta(patch: FrontMatter) {
    const hit = find(activeIdRef.current)
    if (!hit) return
    Object.assign(hit.scene.meta, patch)
    dirty.current = hit
    setSave('dirty')
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(flush, 800)
    bump()
  }
  const metaSuggestions = useMemo(() => {
    const alur = new Set<string>(), waktu = new Set<string>()
    for (const c of p.chapters) for (const s of c.scenes) {
      if (s.meta.alur) alur.add(String(s.meta.alur))
      if (s.meta.waktu_cerita) waktu.add(String(s.meta.waktu_cerita))
    }
    return { alur: [...alur], waktu: [...waktu] }
  }, [p, version]) // eslint-disable-line react-hooks/exhaustive-deps

  async function saveManualSnapshot(label: string) {
    const hit = find(activeIdRef.current)
    if (!hit) return
    await flush()
    await writeSnapshot(p, hit.scene, 'manual', label)
    openedBody.current.set(sceneId(hit.chapter, hit.scene), hit.scene.body)
    setToast('Versi adegan disimpan.')
  }
  async function restoreSnapshot(body: string) {
    const hit = find(activeIdRef.current)
    if (!hit) return
    await flush()
    await writeSnapshot(p, hit.scene, 'sebelum-pulih')
    hit.scene.body = body
    hit.scene.words = countMarkdownWords(body)
    await saveScene(p, hit.chapter, hit.scene)
    openedBody.current.set(sceneId(hit.chapter, hit.scene), body)
    getBody.current = null
    setRestoreN((n) => n + 1)
    setSnapRefresh((n) => n + 1)
    setToast('Versi dipulihkan. Isi sebelumnya disimpan sebagai versi “Sebelum dipulihkan”.')
  }

  const registerWorldNew = useCallback((fn: () => void) => { worldNew.current = fn }, [])
  function openWorld(t: WorldTarget) {
    flush()
    setFocusMode(false)
    setWorldTarget({ ...t })
    setMode('dunia')
  }
  // Klik adegan di binder saat mode Dunia -> kembali menulis
  const openSceneFromBinder = (c: Chapter, s: Scene) => { setMode('menulis'); openScene(c, s) }

  const actionsRef = useRef(actions)
  actionsRef.current = actions

  async function setDailyTarget(n: number) {
    p.data.target_harian = n
    setTargetOpen(false)
    await change('menyimpan target harian', () => saveProjectFile(p))
  }

  async function close() {
    await flush()
    await autoSnapshot(find(activeId))
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
          <button className={mode === 'menulis' ? 'is-active' : ''} aria-pressed={mode === 'menulis'} onClick={() => setMode('menulis')}>Menulis</button>
          <button className={mode === 'rencana' ? 'is-active' : ''} aria-pressed={mode === 'rencana'} onClick={() => { flush(); setFocusMode(false); setMode('rencana') }}>Merencanakan</button>
          <button className={mode === 'dunia' ? 'is-active' : ''} aria-pressed={mode === 'dunia'} onClick={() => openWorld({ kind: worldTarget.kind, file: undefined })}>Dunia</button>
        </div>
        <button className="ws-search" disabled title="Pencarian hadir di fase berikutnya">
          <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
          Cari…
          <kbd>⌘K</kbd>
        </button>
        <button className="ws-export" onClick={() => setExportOpen(true)} title="Ekspor ke Word, PDF, atau Markdown">
          <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 15V3M7 8l5-5 5 5M5 21h14" /></svg>
          Ekspor
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
              editing={editing} setEditing={setEditing} busy={busy} {...actions} openScene={openSceneFromBinder} />

            <BibleSummary project={p} onOpen={(kind, file) => openWorld({ kind, file })} onCreate={(kind) => openWorld({ kind, create: true })} />

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
          {mode === 'dunia' ? (
            <World project={p} target={worldTarget} onChanged={bump} registerNew={registerWorldNew} />
          ) : mode === 'rencana' ? (
            <Plan project={p} version={version} activeId={activeId}
              openScene={(c, s) => { setMode('menulis'); openScene(c, s) }}
              openSceneById={(id) => { const hit = find(id); if (hit) { setMode('menulis'); openScene(hit.chapter, hit.scene) } }}
              openEntry={(id) => openEntry(id)}
              addScene={(c) => change('menambah adegan', async () => { const s = await ops.addScene(p, c, `Adegan ${c.scenes.length + 1}`); expand(c); void s })}
              moveScene={actions.moveScene}
              updateMeta={updateSceneMeta}
              onError={setToast} />
          ) : (<>
          <div className="ws-center">
            {active ? (
              <Editor
                key={activeId! + '#' + restoreN}
                markdown={active.scene.body}
                heading={`${chapterLabel(p, active.chapter)} · Adegan ${sceneIndex + 1}`}
                title={String(active.scene.meta.judul || '')}
                zoom={zoom}
                focusMode={focusMode}
                terms={terms}
                describe={describe}
                onOpenEntry={openEntry}
                onRename={(t) => actions.renameScene(active.chapter, active.scene, t)}
                suggestions={suggestions.get(activeId!)}
                onSuggestionDone={(id) => setSuggestions((m) => {
                  const list = (m.get(activeId!) ?? []).filter((x) => x.id !== id)
                  return new Map(m).set(activeId!, list)
                })}
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
              {(suggestions.get(activeId!)?.length ?? 0) > 0 && (
                <span className="ws-sugs"><span aria-hidden="true" className="ws-sug-dot" />{suggestions.get(activeId!)!.length} saran ejaan di adegan ini</span>
              )}
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
                  <Assistant project={p} items={aiItems} setItems={setAiItems}
                    getScene={() => active ? { chapter: active.chapter, scene: active.scene, body: getBody.current?.() ?? active.scene.body } : null}
                    onSpelling={(list) => {
                      if (!activeId) return
                      setSuggestions((m) => new Map(m).set(activeId, list.map((x, n) => ({ ...x, id: `${Date.now()}-${n}` }))))
                    }}
                    onOpenScene={(id, kutipan) => {
                      const hit = find(id)
                      if (!hit) return
                      if (id !== activeId) { setMode('menulis'); openScene(hit.chapter, hit.scene) }
                      setTimeout(() => editorApi.current?.select(kutipan), 350)
                    }}
                    onShowText={(k) => editorApi.current?.select(k) ?? false}
                    sceneTitle={(id) => {
                      const hit = find(id)
                      return hit ? `${chapterLabel(p, hit.chapter)} · ${String(hit.scene.meta.judul || '')}` : 'Adegan'
                    }} />
                )}
                {tab === 'adegan' && (active ? (
                  <div className="side-stack">
                    <SceneInspector key={activeId!} meta={active.scene.meta} bible={p.bible} suggestions={metaSuggestions}
                      getText={() => getBody.current?.() ?? active.scene.body} onChange={changeMeta} />
                    <Snapshots key={'s' + activeId} project={p} scene={active.scene} refresh={snapRefresh}
                      getCurrent={() => getBody.current?.() ?? active.scene.body}
                      onSaveManual={saveManualSnapshot} onRestore={restoreSnapshot} />
                  </div>
                ) : (
                  <div className="side-note"><p>Pilih adegan di binder untuk melihat detailnya.</p></div>
                ))}
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
          </>)}
        </main>
      </div>
      {focusMode && (
        <div className="focus-pill">
          <SaveBadge state={save} onRetry={flush} />
          <span aria-hidden="true">·</span>
          <button onClick={() => setFocusMode(false)}>Keluar mode fokus <kbd>Esc</kbd></button>
        </div>
      )}
      {exportOpen && (
        <ExportDialog project={p} beforeExport={async () => { await flush() }} onClose={() => setExportOpen(false)} onDone={setToast} />
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
