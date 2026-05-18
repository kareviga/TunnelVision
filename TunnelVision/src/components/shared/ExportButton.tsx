import { useState, useEffect, useRef } from 'react'

interface Props {
  onPNG: () => void
  onPDF: () => void
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
}

const ITEM: React.CSSProperties = {
  display: 'block',
  width: '100%',
  padding: '6px 12px',
  background: 'none',
  border: 'none',
  borderBottom: '1px solid var(--border)',
  color: 'var(--text)',
  fontFamily: 'var(--mono)',
  fontSize: 10,
  letterSpacing: 1,
  textAlign: 'left',
  cursor: 'pointer',
}

export function ExportButton({ onPNG, onPDF }: Props) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={BTN} title="Export image">
        ⬇
      </button>
      {open && (
        <div style={{
          position: 'absolute', right: 0, top: '100%', marginTop: 3,
          background: 'var(--bg2)', border: '1px solid var(--border2)',
          borderRadius: 4, overflow: 'hidden', zIndex: 2000, minWidth: 72,
        }}>
          {([['PNG', onPNG], ['PDF', onPDF]] as [string, () => void][]).map(([label, fn], i) => (
            <button
              key={label}
              style={{ ...ITEM, borderBottom: i === 0 ? '1px solid var(--border)' : 'none' }}
              onMouseOver={e => { e.currentTarget.style.background = 'var(--border)' }}
              onMouseOut={e =>  { e.currentTarget.style.background = 'none' }}
              onClick={() => { fn(); setOpen(false) }}
            >{label}</button>
          ))}
        </div>
      )}
    </div>
  )
}
