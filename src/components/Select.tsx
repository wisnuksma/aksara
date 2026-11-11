// Dropdown buatan sendiri (pengganti <select> bawaan Mac), tetap bisa dipakai
// dengan keyboard: ↑ ↓ Home End, Enter/Spasi untuk memilih, Esc untuk menutup,
// dan mengetik huruf awal untuk melompat ke pilihan.
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import './select.css'

interface Props {
  value: string
  options: string[]
  onChange: (v: string) => void
  id?: string
  'aria-labelledby'?: string
}

export default function Select({ value, options, onChange, id, ...aria }: Props) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(() => Math.max(0, options.indexOf(value)))
  const [up, setUp] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const listId = useId()
  const typed = useRef({ text: '', at: 0 })

  // Tutup bila klik di luar
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  // Buka ke atas bila ruang di bawah tidak cukup
  useLayoutEffect(() => {
    if (!open || !btnRef.current || !listRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    setUp(window.innerHeight - r.bottom < listRef.current.offsetHeight + 12 && r.top > window.innerHeight - r.bottom)
  }, [open])

  // Pastikan pilihan aktif terlihat
  useEffect(() => {
    if (open) listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' })
  }, [open, active])

  const openList = () => { setActive(Math.max(0, options.indexOf(value))); setOpen(true) }
  const choose = (i: number) => {
    onChange(options[i])
    setOpen(false)
    btnRef.current?.focus()
  }

  function onKeyDown(e: KeyboardEvent) {
    const last = options.length - 1
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        e.preventDefault()
        if (!open) { openList(); return }
        setActive((a) => e.key === 'ArrowDown' ? Math.min(last, a + 1) : Math.max(0, a - 1))
        return
      }
      case 'Home': if (open) { e.preventDefault(); setActive(0) } return
      case 'End': if (open) { e.preventDefault(); setActive(last) } return
      case 'Enter':
      case ' ':
        e.preventDefault()
        if (open) choose(active); else openList()
        return
      case 'Escape':
        if (open) { e.preventDefault(); e.stopPropagation(); setOpen(false) }
        return
      case 'Tab':
        setOpen(false)
        return
    }
    // Ketik huruf untuk melompat
    if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
      const now = Date.now()
      const t = typed.current
      t.text = (now - t.at > 700 ? '' : t.text) + e.key.toLowerCase()
      t.at = now
      const i = options.findIndex((o) => o.toLowerCase().startsWith(t.text))
      if (i >= 0) { if (open) setActive(i); else onChange(options[i]) }
    }
  }

  return (
    <div className="select" ref={rootRef}>
      <button
        ref={btnRef} id={id} type="button"
        className={'input select-button' + (open ? ' is-open' : '')}
        role="combobox" aria-haspopup="listbox" aria-expanded={open} aria-controls={listId}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        {...aria}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
      >
        <span className="select-value">{value}</span>
        <svg className="select-chevron" aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open && (
        <ul ref={listRef} id={listId} role="listbox" className={'select-list' + (up ? ' is-up' : '')}>
          {options.map((o, i) => (
            <li
              key={o} id={`${listId}-${i}`} role="option" aria-selected={o === value}
              className={'select-option' + (i === active ? ' is-active' : '') + (o === value ? ' is-selected' : '')}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(i)}
            >
              <span>{o}</span>
              {o === value && (
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
