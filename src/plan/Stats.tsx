import { useEffect, useMemo, useRef, useState } from 'react'
import { loadStats, todayKey, type Stats as StatsData } from '../lib/stats'
import { streaks } from '../lib/plan'
import { chapterLabel, totalWords, type Project } from '../lib/project'
import { formatNumber } from '../lib/recent'

const STATUS = [['ide', 'Ide'], ['draf', 'Draf'], ['revisi', 'Revisi'], ['selesai', 'Selesai']] as const
const fmtDay = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' })
const fmtDayLong = new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long' })

/** Angka sumbu yang bulat: 0, 250, 500, … */
function niceMax(v: number) {
  if (v <= 0) return 100
  const p = Math.pow(10, Math.floor(Math.log10(v)))
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p
  return 10 * p
}

export default function Stats({ project: p, version }: { project: Project; version: number }) {
  const [stats, setStats] = useState<StatsData | null>(null)
  useEffect(() => { loadStats(p.root).then(setStats) }, [p, version])

  const days = useMemo(() => {
    const out: { key: string; date: Date; words: number }[] = []
    for (let i = 29; i >= 0; i--) {
      const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i)
      out.push({ key: todayKey(d), date: d, words: Math.max(0, stats?.harian[todayKey(d)] ?? 0) })
    }
    return out
  }, [stats])

  if (!stats) return null
  const st = streaks(stats.harian)
  const total = totalWords(p)
  const today = Math.max(0, stats.harian[todayKey()] ?? 0)
  const target = p.data.target_harian || 0
  const week = days.slice(-7).reduce((n, d) => n + d.words, 0)
  const statusCounts = STATUS.map(([k, label]) => ({ k, label, n: p.chapters.reduce((m, c) => m + c.scenes.filter((s) => String(s.meta.status || 'ide') === k).length, 0) }))
  const scenesTotal = statusCounts.reduce((n, x) => n + x.n, 0)
  const chapters = p.chapters.map((c) => ({ label: `${chapterLabel(p, c)}${c.judul.toLowerCase() !== chapterLabel(p, c).toLowerCase() ? ` · ${c.judul}` : ''}`, words: c.scenes.reduce((n, s) => n + s.words, 0) }))

  return (
    <div className="stats">
      <div className="tiles">
        <Tile label="Streak menulis" value={`${st.current} hari`} sub={st.current ? (today ? 'Termasuk hari ini' : 'Tulis hari ini agar tidak putus') : 'Mulai hari ini'} hero />
        <Tile label="Streak terpanjang" value={`${st.best} hari`} />
        <Tile label="Hari ini" value={`${formatNumber(today)} kata`} sub={target ? `${Math.round((today / target) * 100)}% dari target ${formatNumber(target)}` : 'Belum ada target harian'} />
        <Tile label="7 hari terakhir" value={`${formatNumber(week)} kata`} sub={`rata-rata ${formatNumber(Math.round(week / 7))} per hari`} />
        <Tile label="Total naskah" value={`${formatNumber(total)} kata`} sub={p.data.target_kata ? `${Math.min(100, Math.round((total / p.data.target_kata) * 100))}% dari ${formatNumber(p.data.target_kata)}` : `${scenesTotal} adegan`} />
      </div>

      <section className="chart-card">
        <h3>Kata per hari</h3>
        <p className="chart-sub">30 hari terakhir{target ? ` · garis = target ${formatNumber(target)} kata` : ''}</p>
        <DailyChart days={days} target={target} />
        <details className="chart-table">
          <summary>Lihat sebagai tabel</summary>
          <table><thead><tr><th>Tanggal</th><th>Kata</th></tr></thead>
            <tbody>{[...days].reverse().map((d) => <tr key={d.key}><td>{fmtDayLong.format(d.date)}</td><td>{formatNumber(d.words)}</td></tr>)}</tbody></table>
        </details>
      </section>

      <div className="chart-row">
        <section className="chart-card">
          <h3>Kata per bab</h3>
          <p className="chart-sub">Panjang tiap bab saat ini</p>
          <ul className="hbars">
            {chapters.map((c, i) => {
              const max = Math.max(1, ...chapters.map((x) => x.words))
              return (
                <li key={i} title={`${c.label}: ${formatNumber(c.words)} kata`}>
                  <span className="hbar-label">{c.label}</span>
                  <span className="hbar-track"><span className="hbar" style={{ width: `${(c.words / max) * 100}%` }} /></span>
                  <span className="hbar-val">{formatNumber(c.words)}</span>
                </li>
              )
            })}
          </ul>
        </section>
        <section className="chart-card">
          <h3>Status adegan</h3>
          <p className="chart-sub">{scenesTotal} adegan</p>
          <div className="stack" role="img" aria-label={statusCounts.map((s) => `${s.label} ${s.n}`).join(', ')}>
            {statusCounts.filter((s) => s.n).map((s) => (
              <span key={s.k} className={'stack-seg st-bg-' + s.k} style={{ flexGrow: s.n }} title={`${s.label}: ${s.n} adegan`} />
            ))}
          </div>
          <ul className="stack-legend">
            {statusCounts.map((s) => (
              <li key={s.k}><i className={'st-dot st-' + s.k} /><span>{s.label}</span><b>{s.n}</b></li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}

function Tile({ label, value, sub, hero }: { label: string; value: string; sub?: string; hero?: boolean }) {
  return (
    <div className={'tile' + (hero ? ' is-hero' : '')}>
      <span className="tile-label">{label}</span>
      <span className="tile-value">{value}</span>
      {sub && <span className="tile-sub">{sub}</span>}
    </div>
  )
}

function DailyChart({ days, target }: { days: { key: string; date: Date; words: number }[]; target: number }) {
  const [hover, setHover] = useState<number | null>(null)
  // Ukuran SVG = ukuran sebenarnya, supaya tulisan sumbu tetap 11px
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(720)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(320, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const RIGHT = target > 0 ? 52 : 8
  const W = width - RIGHT, H = 220, L = 44, B = 26, T = 10
  const max = niceMax(Math.max(target, ...days.map((d) => d.words)))
  const step = (W - L) / days.length
  const bw = Math.min(16, step - 2)
  const y = (v: number) => T + (H - T - B) * (1 - v / max)
  const ticks = [0, max / 2, max]
  const h = hover !== null ? days[hover] : null
  return (
    <div className="daily-chart" ref={box} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${width} ${H}`} width={width} height={H} role="img" aria-label="Grafik kata per hari, 30 hari terakhir">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W} y1={y(t)} y2={y(t)} className="grid" />
            <text x={L - 8} y={y(t) + 4} textAnchor="end" className="axis">{formatNumber(t)}</text>
          </g>
        ))}
        {days.map((d, i) => {
          const x = L + i * step + (step - bw) / 2
          const top = y(d.words)
          const bh = H - B - top
          return (
            <g key={d.key}>
              {d.words > 0 && (
                <path className={'bar' + (hover === i ? ' is-hover' : '')}
                  d={`M${x},${H - B} V${top + Math.min(4, bh)} Q${x},${top} ${x + Math.min(4, bw / 2)},${top} H${x + bw - Math.min(4, bw / 2)} Q${x + bw},${top} ${x + bw},${top + Math.min(4, bh)} V${H - B} Z`} />
              )}
              {(i % 7 === 2 || i === days.length - 1) && <text x={x + bw / 2} y={H - 8} textAnchor="middle" className="axis">{i === days.length - 1 ? 'Hari ini' : fmtDay.format(d.date)}</text>}
              <rect x={L + i * step} y={T} width={step} height={H - B - T} fill="transparent" onMouseEnter={() => setHover(i)} />
            </g>
          )
        })}
        {target > 0 && (
          <g className="target">
            <line x1={L} x2={W} y1={y(target)} y2={y(target)} />
            <text x={W + 8} y={y(target) + 4}>Target</text>
          </g>
        )}
        <line x1={L} x2={W} y1={H - B} y2={H - B} className="baseline" />
      </svg>
      {h && hover !== null && (
        <div className="chart-tip" style={{ left: Math.min(width - 90, Math.max(90, L + hover * step + step / 2)) }}>
          <b>{formatNumber(h.words)} kata</b><span>{fmtDayLong.format(h.date)}</span>
        </div>
      )}
    </div>
  )
}
