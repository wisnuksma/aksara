import { useEffect, useRef } from 'react'
import '../screens/dialog.css'

interface Props {
  title: string
  message: string
  confirmLabel: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/** Dialog konfirmasi (dipakai sebelum menghapus apa pun). */
export default function Confirm({ title, message, confirmLabel, danger, onConfirm, onCancel }: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    cancelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onCancel() } }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onCancel])
  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="dialog confirm" role="alertdialog" aria-modal="true" aria-labelledby="cf-title" aria-describedby="cf-msg">
        <div className="dialog-head"><h1 id="cf-title">{title}</h1></div>
        <div className="dialog-body"><p id="cf-msg" className="confirm-msg">{message}</p></div>
        <div className="dialog-foot">
          <button ref={cancelRef} className="btn" onClick={onCancel}>Batal</button>
          <button className={'btn ' + (danger ? 'btn-danger' : 'btn-primary')} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
