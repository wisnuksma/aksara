import { useState } from 'react'
import Corkboard from './Corkboard'
import Timeline from './Timeline'
import Relations from './Relations'
import WorldMap from './WorldMap'
import Stats from './Stats'
import type { Chapter, Project, Scene } from '../lib/project'
import type { FrontMatter } from '../lib/frontmatter'
import './plan.css'

type View = 'papan' | 'timeline' | 'relasi' | 'peta' | 'statistik'
const VIEWS: { id: View; label: string }[] = [
  { id: 'papan', label: 'Papan plot' }, { id: 'timeline', label: 'Timeline' }, { id: 'relasi', label: 'Relasi tokoh' },
  { id: 'peta', label: 'Peta dunia' }, { id: 'statistik', label: 'Statistik' },
]
const KEY = 'aksara-plan-view'

interface Props {
  project: Project
  version: number
  activeId: string | null
  openScene: (c: Chapter, s: Scene) => void
  openSceneById: (id: string) => void
  openEntry: (id: string) => void
  addScene: (c: Chapter) => void
  moveScene: (src: Chapter, s: Scene, dst: Chapter, index: number) => void
  updateMeta: (c: Chapter, s: Scene, patch: FrontMatter) => void
  onError: (msg: string) => void
}

/** Mode Merencanakan (Fase 4). */
export default function Plan(props: Props) {
  const [view, setView] = useState<View>(() => { try { return (localStorage.getItem(KEY) as View) || 'papan' } catch { return 'papan' } })
  const choose = (v: View) => { setView(v); try { localStorage.setItem(KEY, v) } catch { /* abaikan */ } }
  return (
    <div className="plan">
      <nav className="plan-tabs" role="tablist" aria-label="Alat perencanaan">
        {VIEWS.map((v) => (
          <button key={v.id} role="tab" aria-selected={view === v.id} className={view === v.id ? 'is-active' : ''} onClick={() => choose(v.id)}>{v.label}</button>
        ))}
      </nav>
      <div className="plan-body">
        {view === 'papan' && <Corkboard project={props.project} activeId={props.activeId} openScene={props.openScene} addScene={props.addScene} moveScene={props.moveScene} updateMeta={props.updateMeta} />}
        {view === 'timeline' && <Timeline project={props.project} openSceneById={props.openSceneById} onError={props.onError} />}
        {view === 'relasi' && <Relations project={props.project} openEntry={props.openEntry} onError={props.onError} />}
        {view === 'peta' && <WorldMap project={props.project} openEntry={props.openEntry} onError={props.onError} />}
        {view === 'statistik' && <Stats project={props.project} version={props.version} />}
      </div>
    </div>
  )
}
