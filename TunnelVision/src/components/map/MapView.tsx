import { useEffect, useRef, useState } from 'react'
import { MapPanel } from './MapPanel'
import { LeafletMap } from './LeafletMap'
import { useStore } from '../../store/useStore'
import type { AppData } from '../../types'
import styles from './MapView.module.css'

interface Props { data: AppData | null }

// Fast Leaflet screenshot: draws tiles then serialises each SVG pane directly to
// canvas — avoids html2canvas DOM traversal and tile re-downloading.
async function captureLeafletMap(container: HTMLElement): Promise<string> {
  const rect = container.getBoundingClientRect()
  const W = Math.round(rect.width)
  const H = Math.round(rect.height)

  const canvas = document.createElement('canvas')
  canvas.width  = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#0a0c10'
  ctx.fillRect(0, 0, W, H)

  // 1. Tile images — drawn in parallel from existing DOM elements
  const tiles = Array.from(
    container.querySelectorAll<HTMLImageElement>('img.leaflet-tile'),
  ).filter(t => t.complete && t.naturalWidth > 0)

  await Promise.all(tiles.map(tile => {
    const tr = tile.getBoundingClientRect()
    const x = tr.left - rect.left
    const y = tr.top  - rect.top
    try {
      ctx.drawImage(tile, x, y, tr.width, tr.height)
      return Promise.resolve()
    } catch {
      // Cross-origin tile: re-fetch with CORS header then draw
      return new Promise<void>(resolve => {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.onload  = () => { try { ctx.drawImage(img, x, y, tr.width, tr.height) } catch { /* tainted */ } resolve() }
        img.onerror = () => resolve()
        img.src = tile.src
        setTimeout(resolve, 2000)
      })
    }
  }))

  // 2. SVG panes — serialise each one and stamp onto canvas in DOM order (= correct z-order)
  const svgs = Array.from(container.querySelectorAll<SVGSVGElement>('svg'))
  for (const svg of svgs) {
    const sr = svg.getBoundingClientRect()
    if (!sr.width || !sr.height) continue

    const clone = svg.cloneNode(true) as SVGSVGElement
    clone.style.transform = 'none'   // strip CSS translate so the SVG renders from its own origin

    const url = URL.createObjectURL(
      new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }),
    )
    await new Promise<void>(resolve => {
      const img = new Image()
      img.onload = () => {
        try { ctx.drawImage(img, sr.left - rect.left, sr.top - rect.top) } catch { /* skip */ }
        URL.revokeObjectURL(url)
        resolve()
      }
      img.onerror = () => { URL.revokeObjectURL(url); resolve() }
      img.src = url
      setTimeout(() => { URL.revokeObjectURL(url); resolve() }, 4000)
    })
  }

  return canvas.toDataURL('image/png')
}

export function MapView({ data }: Props) {
  const [panelOpen, setPanelOpen] = useState(false)
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const exportPNGTick   = useStore(s => s.exportPNGTick)
  const activeView      = useStore(s => s.activeView)

  useEffect(() => {
    if (exportPNGTick === 0 || activeView !== 'map') return
    const el = mapContainerRef.current; if (!el) return
    captureLeafletMap(el).then(dataUrl => {
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = `MapView_${new Date().toISOString().slice(0,10).replace(/-/g,'')}.png`
      a.click()
    })
  }, [exportPNGTick])

  return (
    <div className={`${styles.mapView} ${panelOpen ? styles.panelOpen : ''}`} style={{ position: 'relative' }}>
      <div className={styles.workspace}>
        {/* Desktop: panel inline. Mobile: panel as overlay */}
        <div className={`${styles.panelOverlay} ${panelOpen ? styles.open : ''}`}>
          <MapPanel data={data} />
        </div>
        <div ref={mapContainerRef} style={{ flex: 1, position: 'relative', overflow: 'hidden', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <LeafletMap data={data} />
        </div>
      </div>

      {/* Tap-outside backdrop (mobile only, when panel open) */}
      {panelOpen && (
        <div
          onClick={() => setPanelOpen(false)}
          style={{
            position: 'absolute', inset: 0, zIndex: 540,
            background: 'rgba(0,0,0,0.45)',
          }}
          className={styles.backdrop}
        />
      )}

      {/* Mobile-only hamburger toggle */}
      <button
        className={styles.panelToggle}
        onClick={() => setPanelOpen(o => !o)}
        aria-label="Toggle panel"
      >
        {panelOpen ? '✕' : '☰'}
      </button>
    </div>
  )
}
