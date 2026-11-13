// Kolom isian dengan daftar saran (bisa memilih dari daftar ATAU mengetik bebas).
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import './select.css'

interface Props {
  value: string
  options: string[]
  onChange: (v: string) => void
  placeholder?: string
  /** true: kosongkan isian setelah memilih (untuk menambah ke daftar). */
  clearOnPick?: boolean
  'aria-label': string
}

export default function Combo({ value, options, onChange, placeholder, clearOnPick, ...aria }: Props) {
  const [text, setText] = useState(value)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const listId = useId()
  useEffect(() => setText(value), [value])

  const filtered = useMemo(() => {
    const q = text.trim().toLowerCase()
    const list = options.filter((o) => o && (!q || o.toLowerCase().includes(q)))
    return q && !clearOnPick && list.length === 1 && list[0] === text ? [] : list
  }, [options, text, clearOnPick])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!rootRef.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const pick = (v: string) => {
    onChange(v)
    setText(clearOnPick ? '' : v)
    setOpen(false)
  }
  const commitTyped = () => {
    const t = text.trim()
    if (clearOnPick) { if (t) pick(t) }
    else if (t !== value) onChange(t)
  }

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(filtered.length - 1, a + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      if (open && filtered[active]) pick(filtered[active]); else { commitTyped(); setOpen(false) }
    } else if (e.key === 'Escape') { if (open) { e.stopPropagation(); setOpen(false) } }
  }

  return (
    <div className="select combo" ref={rootRef}>
      <input className="input" value={text} placeholder={placeholder}
        role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" {...aria}
        onChange={(e) => { setText(e.target.value); setOpen(true); setActive(0) }}
        onMouseDown={() => { setOpen(true); setActive(0) }}
        onBlur={() => { setOpen(false); if (!clearOnPick) commitTyped() }}
        onKeyDown={onKey} />
      {open && filtered.length > 0 && (
        <ul id={listId} role="listbox" className="select-list">
          {filtered.map((o, i) => (
            <li key={o} role="option" aria-selected={i === active}
              className={'select-option' + (i === active ? ' is-active' : '') + (o === value ? ' is-selected' : '')}
              onMouseEnter={() => setActive(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(o)}>
              <span>{o}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
