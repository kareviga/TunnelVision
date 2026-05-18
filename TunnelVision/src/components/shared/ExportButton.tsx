import { useState, useEffect, useRef } from 'react'

interface Props {
  onPNG: () => void | Promise<void>
  onPDF: () => void | Promise<void>
}

const BTN: React.CSSProperties = {
  width: 30, height: 30,
  background: 'var(--bg3)',
  border: '1px solid var(--border2)',
  borderRadius: 4,
  color: 'var(--text)',
  fontSize: 13,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backdropFilter: 'blur(4px)',
  fontFamily: 'var(--mono)',
  transition: 'opacity .15s',
}

const ITEM: React.CSSProperties = {
  display: 'block',
  width: '100%',
  padding: '6px 12px',
  background: 'none',
  border: 'none',
  color: 'var(--text)',
  fontFamily: 'var(--mono)',
  fontSize: 10,
  letterSpacing: 1,
  textAlign: 'left',
  cursor: 'pointer',
}

export function ExportButton({ onPNG, onPDF }: Props) {
  const [open, setOpen]       = useState(false)
  const [loading, setLoading] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  async function trigger(fn: () => void | Promise<void>) {
    setOpen(false)
    setLoading(true)
    try { await fn() } finally { setLoading(false) }
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        onClick={() => { if (!loading) setOpen(o => !o) }}
        style={{ ...BTN, opacity: loading ? 0.5 : 1, cursor: loading ? 'default' : 'pointer' }}
        title={loading ? 'Exporting…' : 'Export image'}
      >
        {loading ? '…' : '⬇'}
      </button>
      {open && !loading && (
        <div style={{
          position: 'absolute', right: 0, top: '100%', marginTop: 3,
          background: 'var(--bg2)', border: '1px solid var(--border2)',
          borderRadius: 4, overflow: 'hidden', zIndex: 2000, minWidth: 72,
        }}>
          {([['PNG', onPNG], ['PDF', onPDF]] as [string, () => void | Promise<void>][]).map(([label, fn], i) => (
            <button
              key={label}
              style={{ ...ITEM, borderBottom: i === 0 ? '1px solid var(--border)' : 'none' }}
              onMouseOver={e => { e.currentTarget.style.background = 'var(--border)' }}
              onMouseOut={e =>  { e.currentTarget.style.background = 'none' }}
              onClick={() => trigger(fn)}
            >{label}</button>
          ))}
        </div>
      )}
    </div>
  )
}
