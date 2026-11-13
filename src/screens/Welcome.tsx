import type { ReactNode } from 'react'
import type { RecentProject } from '../lib/recent'
import { formatNumber, timeAgo } from '../lib/recent'
import pena from '../assets/pena-aksara.png'
import InstallCard from '../components/InstallCard'
import './welcome.css'

export type { Template } from '../lib/types'
import type { Template } from '../lib/types'

interface Props {
  recent: RecentProject[]
  onNew: (template?: Template) => void
  onOpen: () => void
  onImport: () => void
  onOpenRecent: (p: RecentProject) => void
}

const TEMPLATES: { id: Template; name: string; desc: string; icon: ReactNode }[] = [
  {
    id: 'kosong', name: 'Kosong', desc: 'Satu bab, satu adegan. Bebas dari awal.',
    icon: <path d="M6 3h9l4 4v14H6z" />,
  },
  {
    id: 'tiga-babak', name: 'Tiga babak', desc: 'Awal, konflik, resolusi, dengan catatan tiap babak.',
    icon: <path d="M4 18h4V12h4V8h4V4h4" strokeLinecap="round" />,
  },
  {
    id: 'fantasi-epik', name: 'Fantasi epik', desc: 'Ditambah folder faksi, peta, dan lore.',
    icon: <><circle cx="12" cy="12" r="8" /><path d="M12 4v4M20 12h-4M12 20v-4M4 12h4" strokeLinecap="round" /></>,
  },
]

export default function Welcome({ recent, onNew, onOpen, onImport, onOpenRecent }: Props) {
  return (
    <div className="welcome">
      <section className="welcome-left">
        <div className="welcome-hero">
          <div className="welcome-brand">
            <h1>
              <span className="brand-a">A</span>ksar<span className="brand-last">a<img src={pena} alt="" className="brand-pen" /></span>
            </h1>
            <span className="brand-kicker">Tempat kisah bermula</span>
            <svg className="brand-ornament" aria-hidden="true" width="96" height="10" viewBox="0 0 96 10"><path d="M0 5h40M56 5h40" stroke="var(--gold)" strokeOpacity=".6" strokeWidth="1" /><path d="M48 1l4 4-4 4-4-4z" fill="var(--gold)" /></svg>
            <p>Tulis naskah dan bangun dunia ceritamu, di satu meja.</p>
          </div>

          <div className="welcome-actions">
            <button className="action action-primary" onClick={() => onNew()}>
              <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
              <span className="action-text"><span className="action-title">Mulai novel baru</span><span className="action-desc">Buat proyek kosong atau dari template</span></span>
              <kbd>⌘N</kbd>
            </button>
            <button className="action" onClick={onOpen}>
              <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
              <span className="action-text"><span className="action-title">Buka proyek</span><span className="action-desc">Pilih folder novel yang sudah ada</span></span>
              <kbd>⌘O</kbd>
            </button>
            <button className="action" onClick={onImport}>
              <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></svg>
              <span className="action-text"><span className="action-title">Impor naskah</span><span className="action-desc">Dari Word (.docx) atau Markdown</span></span>
              <kbd>⇧⌘I</kbd>
            </button>
          </div>
        </div>

        <span className="welcome-footer">Versi 0.1 · Semua file tersimpan lokal</span>
      </section>

      <section className="welcome-right">
        <div className="welcome-block">
          <h2 className="label">Proyek terbaru</h2>
          {recent.length === 0 ? (
            <div className="recent-empty">
              <svg aria-hidden="true" width="64" height="64" viewBox="0 0 64 64" fill="none" stroke="#B9A06A" strokeWidth="1.5" strokeLinejoin="round"><path d="M12 14c8-3 14-3 20 2v36c-6-5-12-5-20-2z" /><path d="M52 14c-8-3-14-3-20 2v36c6-5 12-5 20-2z" /><path d="M18 22h8M18 28h8M38 22h8M38 28h8" /></svg>
              <span className="recent-empty-title">Belum ada novel</span>
              <span className="recent-empty-desc">Novel yang Anda buat atau buka akan muncul di sini, lengkap dengan jumlah kata dan kapan terakhir ditulis.</span>
            </div>
          ) : (
            <ul className="recent-list">
              {recent.map((p) => (
                <li key={p.id}>
                  <button className="recent-item" onClick={() => onOpenRecent(p)}>
                    <span className="recent-cover" aria-hidden="true">{p.title.trim().charAt(0).toUpperCase() || '?'}</span>
                    <span className="recent-info">
                      <span className="recent-title">{p.title}</span>
                      <span className="recent-meta">
                        {p.genre ? `${p.genre} · ` : ''}{formatNumber(p.words)} kata
                      </span>
                    </span>
                    <span className="recent-time">{timeAgo(p.lastOpened)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="welcome-block">
          <h2 className="label">Mulai dari template</h2>
          <div className="templates">
            {TEMPLATES.map((t) => (
              <button key={t.id} className="template" onClick={() => onNew(t.id)}>
                <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--gold-text)" strokeWidth="1.6" strokeLinejoin="round">{t.icon}</svg>
                <span className="template-name">{t.name}</span>
                <span className="template-desc">{t.desc}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="welcome-bottom">
        <InstallCard />
        <div className="welcome-tip">
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--gold-text)" strokeWidth="1.6" strokeLinejoin="round"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /></svg>
          <span>Punya ide tapi belum tahu mulai dari mana? Asisten AI bisa membantu menyusun premis dan kerangka bab.</span>
        </div>
        </div>
      </section>
    </div>
  )
}
