// Fast Leaflet map capture: composites tile <img> elements + serialised SVG
// panes directly onto a canvas — avoids html2canvas DOM traversal.
export async function captureLeafletMap(container: HTMLElement): Promise<string> {
  const rect = container.getBoundingClientRect()
  const W = Math.round(rect.width)
  const H = Math.round(rect.height)

  const canvas = document.createElement('canvas')
  canvas.width  = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#0a0c10'
  ctx.fillRect(0, 0, W, H)

  // 1. Tile images drawn in parallel from existing DOM elements
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

  // 2. SVG panes stamped in DOM order (= correct z-order)
  const svgs = Array.from(container.querySelectorAll<SVGSVGElement>('svg'))
  for (const svg of svgs) {
    const sr = svg.getBoundingClientRect()
    if (!sr.width || !sr.height) continue
    const clone = svg.cloneNode(true) as SVGSVGElement
    clone.style.transform = 'none'
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
