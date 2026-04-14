import { useEffect, useRef, useCallback } from 'react'
import L from 'leaflet'
import { useStore } from '../../store/useStore'
import { off, TUNNEL_R, TBM_W } from '../../utils/geo'
import { valToColor } from '../../utils/color'
import { formatCH, fmtDate } from '../../utils/format'
import { PARAMS, RING_TYPE_COLORS, GROUT_PARAMS } from '../../data/params'
import type { AppData, TBMRecord } from '../../types'

const TILE_URLS = {
  voyager: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
  dark:    'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  sat:     'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
}
const TILE_ATTRS = {
  voyager: '© OpenStreetMap © CARTO',
  dark:    '© CARTO',
  sat:     '© Esri',
}

const TBM_PARTS: [string, number, string, string][] = [
  ['Cutterhead',      1.0,  '#111111', '#333333'],
  ['Front shield',    4.9,  '#f0f0f0', '#aaaaaa'],
  ['Drilling shield', 12.9, '#e0e0e0', '#aaaaaa'],
  ['Gripper shield',  5.9,  '#d0d0d0', '#aaaaaa'],
]
const BAR_W = 1.6

// White → light blue → blue → dark blue ramp for grout attribute colouring
// Anchors: 0=white, 5=light blue, 50=blue, 200=dark blue
const GROUT_COLOR_STOPS: [number, [number,number,number]][] = [
  [0,   [255, 255, 255]],
  [5,   [173, 216, 230]],
  [50,  [30,  100, 220]],
  [200, [5,   10,  80 ]],
]
function groutAttrColor(val: number): string {
  if (!val || val <= 0) return '#ffffff'
  const stops = GROUT_COLOR_STOPS
  if (val >= stops[stops.length - 1][0]) {
    const [r, g, b] = stops[stops.length - 1][1]
    return `rgb(${r},${g},${b})`
  }
  for (let i = 0; i < stops.length - 1; i++) {
    const [v0, c0] = stops[i]
    const [v1, c1] = stops[i + 1]
    if (val <= v1) {
      const t = (val - v0) / (v1 - v0)
      const r = Math.round(c0[0] + (c1[0] - c0[0]) * t)
      const g = Math.round(c0[1] + (c1[1] - c0[1]) * t)
      const b = Math.round(c0[2] + (c1[2] - c0[2]) * t)
      return `rgb(${r},${g},${b})`
    }
  }
  return '#ffffff'
}

interface Props { data: AppData | null }

function chInterval(z: number) {
  return z>=17?100 : z>=16?200 : z>=15?500 : z>=14?1000 : z>=13?2000 : 5000
}

export function LeafletMap({ data }: Props) {
  const mapRef        = useRef<L.Map | null>(null)
  const containerRef  = useRef<HTMLDivElement>(null)
  const tilesRef      = useRef<Record<string,L.TileLayer>>({})
  const layersRef     = useRef<{
    tunnel: L.LayerGroup|null, center: L.Polyline|null, markers: L.LayerGroup|null,
    rings: L.LayerGroup|null, grout: L.LayerGroup|null, piezos: L.LayerGroup|null,
    mano: L.LayerGroup|null, bars: L.GeoJSON|null, tbmHead: L.LayerGroup|null,
  }>({
    tunnel:null, center:null, markers:null, rings:null, grout:null,
    piezos:null, mano:null, bars:null, tbmHead:null,
  })

  const currentTs         = useStore(s => s.currentTs)
  const channels          = useStore(s => s.channels)
  const layerVis          = useStore(s => s.layerVis)
  const layerOrder        = useStore(s => s.layerOrder)
  const barOpacity        = useStore(s => s.barOpacity)
  const basemap           = useStore(s => s.basemap)
  const groutParam        = useStore(s => s.groutParam)
  const activeView        = useStore(s => s.activeView)
  const setSelectedSensor = useStore(s => s.setSelectedSensor)
  const zoomToTBMTick     = useStore(s => s.zoomToTBMTick)
  const isSliding         = useStore(s => s.isSliding)
  const piezAnnotations   = useStore(s => s.piezAnnotations)
  const isActive          = activeView === 'map'
  const setStore          = useStore

  // ── Init map ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = L.map(containerRef.current, {
      center: [59.9375, 10.7611], zoom: 13, zoomControl: false,
    })

    // Panes
    const panes: [string, number, boolean][] = [
      ['tunnelPane',415,false],['ringsPane',425,false],['centerPane',435,false],
      ['markersPane',445,true],['groutPane',455,true],['manoPane',465,true],
      ['piezosPane',475,true],['tbmPane',700,true],
    ]
    for (const [name, z, ptr] of panes) {
      map.createPane(name)
      const el = map.getPane(name)!
      el.style.zIndex = String(z)
      el.style.pointerEvents = ptr ? 'auto' : 'none'
    }

    // Tiles
    tilesRef.current = {
      voyager: L.tileLayer(TILE_URLS.voyager, { attribution: TILE_ATTRS.voyager, maxZoom: 19, subdomains: 'abcd' }),
      dark:    L.tileLayer(TILE_URLS.dark,    { attribution: TILE_ATTRS.dark,    maxZoom: 19, subdomains: 'abcd' }),
      sat:     L.tileLayer(TILE_URLS.sat,     { attribution: TILE_ATTRS.sat,     maxZoom: 19 }),
    }
    tilesRef.current.voyager.addTo(map)

    map.on('zoom', () => {
      redrawMarkers(map)
    })

    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  }, [])

  // ── Layer order → pane z-index ────────────────────────────────────────────
  const LAYER_PANE: Record<string, string> = {
    piezos: 'piezosPane', mano: 'manoPane', grout: 'groutPane',
    rings: 'ringsPane', tunnel: 'tunnelPane', center: 'centerPane', markers: 'markersPane',
  }
  useEffect(() => {
    const map = mapRef.current; if (!map) return
    // index 0 = bottom, last = top; z-index range 410–480
    layerOrder.forEach((key, i) => {
      const paneName = LAYER_PANE[key]
      if (!paneName) return
      const el = map.getPane(paneName)
      if (el) el.style.zIndex = String(410 + (layerOrder.length - 1 - i) * 10)
    })
  }, [layerOrder])

  // ── Basemap switch ────────────────────────────────────────────────────────
  const prevBasemap = useRef(basemap)
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (prevBasemap.current !== basemap) {
      map.removeLayer(tilesRef.current[prevBasemap.current])
      tilesRef.current[basemap].addTo(map)
      prevBasemap.current = basemap
    }
  }, [basemap])

  // ── Helpers ───────────────────────────────────────────────────────────────

  const removeLayer = (key: keyof typeof layersRef.current) => {
    const map = mapRef.current
    if (!map) return
    const l = layersRef.current[key]
    if (l) { map.removeLayer(l); layersRef.current[key] = null }
  }

  function getExcIdx() {
    if (!data) return 0
    const vis = data.tbm.filter(t => t.ts <= currentTs)
    if (!vis.length) return 0
    const lastCh = vis[vis.length-1].ch
    const al = data.alignment
    let best = 0, bd = Infinity
    for (let i = 0; i < al.length; i++) {
      const d = Math.abs(al[i].ch - lastCh)
      if (d < bd) { bd = d; best = i }
    }
    return best
  }

  // ── Draw tunnel ───────────────────────────────────────────────────────────
  const drawTunnel = useCallback(() => {
    const map = mapRef.current; if (!map || !data) return
    removeLayer('tunnel'); removeLayer('center')
    const al = data.alignment
    const leftPts  = al.map(a => off(a.lat, a.lon, (a.dir - 90 + 360) % 360, TUNNEL_R))
    const rightPts = al.map(a => off(a.lat, a.lon, (a.dir + 90) % 360,       TUNNEL_R))
    const ei = getExcIdx()

    if (layerVis.tunnel) {
      const tl = L.layerGroup()
      if (ei > 0) {
        L.polygon(
          [...leftPts.slice(0, ei+1), ...[...rightPts.slice(0, ei+1)].reverse()],
          { pane:'tunnelPane', color:'#00d4ff', weight:0, fillColor:'#00d4ff', fillOpacity:0.22 }
        ).addTo(tl)
      }
      if (ei < al.length - 1) {
        L.polygon(
          [...leftPts.slice(ei), ...[...rightPts.slice(ei)].reverse()],
          { pane:'tunnelPane', color:'#00d4ff', weight:0.8, fill:false, dashArray:'5,5', opacity:0.2 }
        ).addTo(tl)
      }
      tl.addTo(map)
      layersRef.current.tunnel = tl
    }

    if (layerVis.center) {
      layersRef.current.center = L.polyline(
        al.map(a => [a.lat, a.lon]),
        { pane:'centerPane', color:'#00d4ff', weight:1.5, opacity:0.7 }
      ).addTo(map)
    }
  }, [data, currentTs, layerVis.tunnel, layerVis.center])

  // ── Draw rings ────────────────────────────────────────────────────────────
  const drawRings = useCallback(() => {
    const map = mapRef.current; if (!map || !data) return
    removeLayer('rings')
    if (!layerVis.rings) return
    const vis = data.tbm.filter(t => t.ts <= currentTs)
    const al  = data.alignment
    const leftPts  = al.map(a => off(a.lat, a.lon, (a.dir - 90 + 360) % 360, TUNNEL_R))
    const rightPts = al.map(a => off(a.lat, a.lon, (a.dir + 90) % 360,       TUNNEL_R))

    const rl = L.layerGroup()
    for (let i = 0; i < vis.length - 1; i++) {
      const t = vis[i]
      // Find alignment index
      let idx = 0; let bd = Infinity
      for (let j = 0; j < al.length; j++) {
        const d = Math.abs(al[j].ch - t.ch)
        if (d < bd) { bd = d; idx = j }
      }
      if (idx >= al.length - 1) continue
      const color = RING_TYPE_COLORS[t.ringType] ?? '#22c55e'
      L.polygon(
        [leftPts[idx], rightPts[idx], rightPts[idx+1], leftPts[idx+1]],
        { pane:'ringsPane', color: '#000', weight: 0.5, fillColor: color, fillOpacity: 0.6 }
      )
        .bindTooltip(
          `<b style="color:${color}">Ring ${t.ring}</b><br/>` +
          `${t.ringType}<br/>` +
          `CH ${t.ch.toFixed(0)} m<br/>` +
          `<span style="color:#7090a8;font-size:10px">${fmtDate(t.ts)}</span>`,
          { sticky: true, className: 'tbm-tip' }
        )
        .addTo(rl)
    }
    rl.addTo(map)
    layersRef.current.rings = rl
  }, [data, currentTs, layerVis.rings])

  // ── Draw bars ─────────────────────────────────────────────────────────────
  const drawBars = useCallback(() => {
    const map = mapRef.current; if (!map || !data) return
    removeLayer('bars')
    const features: GeoJSON.Feature[] = []

    for (const side of ['right','left'] as const) {
      const ch = channels[side]
      if (!ch.visible || ch.param === 'none') continue
      const def = PARAMS[ch.param]
      if (!def) continue
      const perpDelta = side === 'right' ? 90 : -90

      const rowData: (TBMRecord | typeof data.xrf[0])[] = def.dataKey === 'tbm'
        ? data.tbm.filter(t => t.ts <= currentTs)
        : (() => {
            const maxCh = data.tbm.filter(t => t.ts <= currentTs).at(-1)?.ch ?? 0
            return data.xrf.filter(x => x.ch <= maxCh)
          })()

      for (const row of rowData) {
        const val = (row as unknown as Record<string,number>)[def.field as string]
        if (!val || val <= 0) continue
        const norm = Math.max(0, Math.min(1, (val - ch.scaleMin) / (ch.scaleMax - ch.scaleMin)))
        const len  = norm * ch.maxLen
        if (len < 0.3) continue
        const color = valToColor(val, ch)
        const { lat, lon, dir } = row as { lat: number; lon: number; dir: number }
        const pd = (dir + perpDelta + 360) % 360
        const [aLat, aLon] = off(lat, lon, (dir + 180) % 360, BAR_W * 0.5)
        const [bLat, bLon] = off(lat, lon, dir, BAR_W * 0.5)
        const wall = TUNNEL_R + 0.3
        const poly = [
          off(aLat, aLon, pd, wall),
          off(bLat, bLon, pd, wall),
          off(bLat, bLon, pd, wall + len),
          off(aLat, aLon, pd, wall + len),
        ]
        features.push({
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [poly.map(p => [p[1], p[0]])] },
          properties: { color, val, label: def.label, unit: def.unit, side, ch: (row as TBMRecord).ch, ring: (row as TBMRecord).ring },
        })
      }
    }

    layersRef.current.bars = L.geoJSON({ type: 'FeatureCollection', features } as GeoJSON.FeatureCollection, {
      style: f => ({
        color: f!.properties.color, weight: 0.2,
        fillColor: f!.properties.color, fillOpacity: barOpacity, opacity: barOpacity * 0.5,
      }),
      onEachFeature: (feature, layer) => {
        const p = feature.properties
        const tipHtml = `
          <b style="color:var(--accent);font-family:var(--cond);font-size:13px">${p.label}</b><br/>
          <span style="color:var(--text2)">Value: </span><span style="color:var(--text)">${p.val?.toFixed(2)} ${p.unit}</span><br/>
          <span style="color:var(--text2)">Ring: </span><span style="color:var(--text)">${p.ring}</span>
          <span style="color:var(--text2)">&nbsp;CH: </span><span style="color:var(--text)">${formatCH(p.ch)}</span>`
        layer.bindTooltip(tipHtml, { sticky: true, opacity: 0.96, className: 'tbm-tip' })
        layer.on('mouseover', function(this: L.Path) { this.setStyle({ weight: 1.5, fillOpacity: 1 }) })
        layer.on('mouseout',  function(this: L.Layer) { layersRef.current.bars?.resetStyle(this) })
      },
    }).addTo(map)
  }, [data, currentTs, channels, barOpacity])

  // ── Draw grouting ─────────────────────────────────────────────────────────
  const drawGrout = useCallback(() => {
    const map = mapRef.current; if (!map || !data) return
    removeLayer('grout')
    if (!layerVis.grout) return
    const vis = data.grout.filter(g => g.ts <= currentTs)
    const gl = L.layerGroup()
    const fanRad = 8 * Math.PI / 180
    const paramDef = GROUT_PARAMS[groutParam]

    for (const g of vis) {
      // Drilling-only: no injection took place
      const isDrillingOnly = (!g.injVol || g.injVol <= 0) && (!g.cement || g.cement <= 0)

      // Trapezoid corners
      const backDir = (g.dir + 180) % 360
      const [bcLat, bcLon] = off(g.lat, g.lon, backDir, 6)
      const sHW = TUNNEL_R
      const eHW = TUNNEL_R + g.screenLen * Math.tan(fanRad)
      const [fcLat, fcLon] = off(bcLat, bcLon, g.dir, g.screenLen)
      const perpR = (g.dir + 90) % 360
      const perpL = (g.dir - 90 + 360) % 360
      const corners: [number, number][] = [
        off(bcLat, bcLon, perpL, sHW),
        off(bcLat, bcLon, perpR, sHW),
        off(fcLat, fcLon, perpR, eHW),
        off(fcLat, fcLon, perpL, eHW),
      ]

      const tip =
        `<b style="color:var(--accent)">Screen CH ${formatCH(g.ch)}</b><br/>` +
        `${g.drillType} | Screen: ${g.screenLen}m<br/>` +
        `Inleakage: ${g.inleakage} L/min | Vol: ${g.injVol.toLocaleString()} L<br/>` +
        `Cement: ${g.cement} kg | Drillm: ${g.drillM} m`

      const val = isDrillingOnly
        ? 0
        : (paramDef ? (g as unknown as Record<string, number>)[paramDef.field] ?? 0 : 0)
      const fillColor = groutAttrColor(val)
      L.polygon(corners, {
        pane: 'groutPane',
        color:       isDrillingOnly ? '#ef4444' : '#555',
        weight:      isDrillingOnly ? 1.8 : 0.5,
        dashArray:   isDrillingOnly ? '6,4' : undefined,
        fillColor,
        fillOpacity: 0.92,
      }).bindTooltip(tip, { sticky: true, className: 'tbm-tip' }).addTo(gl)
    }
    gl.addTo(map)
    layersRef.current.grout = gl
  }, [data, currentTs, layerVis.grout, groutParam])

  // ── Draw manometers ───────────────────────────────────────────────────────
  const drawMano = useCallback(() => {
    const map = mapRef.current; if (!map || !data) return
    removeLayer('mano')
    if (!layerVis.mano) return
    const ml = L.layerGroup()
    for (const m of data.manometers) {
      const recent = m.series.filter(s => s[0] <= currentTs).at(-1)
      const pressure = recent ? recent[1] : null
      const hasSeries = m.series.length > 0
      const icon = L.divIcon({
        html: `<div style="width:10px;height:10px;background:#fb923c;border-radius:50%;border:1.5px solid #fff;transform:translate(-5px,-5px);${hasSeries ? 'cursor:pointer' : ''}"></div>`,
        className: '',
      })
      const marker = L.marker([m.lat, m.lon], { icon, pane: 'manoPane' })
        .bindTooltip(
          `<b style="color:#fb923c">${m.name}</b><br/>` +
          (pressure !== null ? `Pressure: ${pressure.toFixed(3)} bar` : 'No data yet') +
          (hasSeries ? '<br/><span style="color:#7090a8;font-size:10px">Click to graph</span>' : ''),
          { sticky: true, className: 'tbm-tip' }
        )
      if (hasSeries) {
        marker.on('click', () => setSelectedSensor({ type: 'manometer', id: m.id }))
      }
      marker.addTo(ml)
    }
    ml.addTo(map)
    layersRef.current.mano = ml
  }, [data, currentTs, layerVis.mano, setSelectedSensor])

  // ── Draw piezometers ──────────────────────────────────────────────────────
  const drawPiezos = useCallback(() => {
    const map = mapRef.current; if (!map || !data) return
    removeLayer('piezos')
    if (!layerVis.piezos) return
    const pl = L.layerGroup()
    for (const p of data.piezometers) {
      const hasSeries = p.series.length > 0

      // Base dot size + pressure-drop scaling when normal annotation is set
      let radius = 5
      let color = hasSeries ? '#f472b6' : '#8b6070'
      const annot = piezAnnotations[p.id]
      if (annot?.normalVal && hasSeries) {
        const recent = p.series.filter(s => s[0] <= currentTs).at(-1)
        if (recent) {
          const drop = annot.normalVal - recent[1]
          if (drop > 0) {
            const dropRatio = Math.min(1, drop / Math.max(1, annot.normalVal))
            radius = 5 + Math.round(dropRatio * 20)
            color = dropRatio < 0.3 ? '#f472b6' : dropRatio < 0.6 ? '#f97316' : '#ef4444'
          }
        }
      }

      const half = radius
      const icon = L.divIcon({
        html: `<div style="width:${radius*2}px;height:${radius*2}px;background:${color};border-radius:50%;border:1.5px solid #fff;transform:translate(-${half}px,-${half}px);${hasSeries ? 'cursor:pointer' : ''}"></div>`,
        className: '',
      })
      const marker = L.marker([p.lat, p.lon], { icon, pane: 'piezosPane' })
        .bindTooltip(
          `<b style="color:${color}">PZ ${p.id}${p.sensorName ? ' (' + p.sensorName + ')' : ''}</b><br/>` +
          `${p.method}<br/>${p.soilClass}<br/>Depth: ${p.depth}m` +
          (hasSeries ? '<br/><span style="color:#7090a8;font-size:10px">Click to graph</span>' : ''),
          { sticky: true, className: 'tbm-tip' }
        )
      if (hasSeries) {
        marker.on('click', () => setSelectedSensor({ type: 'piezometer', id: p.id }))
      }
      marker.addTo(pl)
    }
    pl.addTo(map)
    layersRef.current.piezos = pl
  }, [data, currentTs, layerVis.piezos, setSelectedSensor, piezAnnotations])

  // ── Draw TBM head ─────────────────────────────────────────────────────────
  const drawTBMHead = useCallback(() => {
    const map = mapRef.current; if (!map || !data) return
    removeLayer('tbmHead')
    const vis = data.tbm.filter(t => t.ts <= currentTs)
    if (!vis.length) return
    const t = vis[vis.length-1]
    const { lat, lon, dir } = t
    const hl = L.layerGroup()
    let curLat = lat, curLon = lon
    const backDir = (dir + 180) % 360
    for (const [name, len, fill, stroke] of TBM_PARTS) {
      const perpR = (dir + 90) % 360, perpL = (dir - 90 + 360) % 360
      const [bLat, bLon] = off(curLat, curLon, backDir, len)
      const coords: [number,number][] = [
        off(curLat, curLon, perpL, TBM_W), off(curLat, curLon, perpR, TBM_W),
        off(bLat, bLon, perpR, TBM_W),     off(bLat, bLon, perpL, TBM_W),
      ]
      L.polygon(coords, { pane:'tbmPane', color:stroke, weight:1, fillColor:fill, fillOpacity:1 })
        .bindTooltip(name, { sticky: true, className:'tbm-tip' }).addTo(hl)
      ;[curLat, curLon] = off(curLat, curLon, backDir, len)
    }
    const icon = L.divIcon({
      html: `<div style="position:relative;width:0;height:0">
        <div style="position:absolute;top:-14px;left:-14px;width:28px;height:28px;border:2px solid #22c55e;border-radius:50%;animation:tbmp 1.5s infinite"></div>
        <div style="position:absolute;top:-5px;left:-5px;width:10px;height:10px;background:#22c55e;border-radius:50%"></div>
      </div>`,
      className: '', iconAnchor: [0, 0],
    })
    L.marker([lat, lon], { icon, pane:'markersPane', zIndexOffset:2000 }).addTo(hl)
    hl.addTo(map)
    layersRef.current.tbmHead = hl
  }, [data, currentTs])

  // ── Draw CH markers ───────────────────────────────────────────────────────
  function redrawMarkers(map: L.Map) {
    if (!data) return
    if (layersRef.current.markers) { map.removeLayer(layersRef.current.markers); layersRef.current.markers = null }
    if (!layerVis.markers) return
    const zoom = map.getZoom(), interval = chInterval(zoom)
    const tbm  = data.tbm
    if (!tbm.length) return
    const firstCh = Math.ceil(tbm[0].ch / interval) * interval
    const ml = L.layerGroup()
    for (let ch = firstCh; ch <= tbm[tbm.length-1].ch; ch += interval) {
      let best: TBMRecord | null = null; let bd = Infinity
      for (const t of tbm) {
        const d = Math.abs(t.ch - ch); if (d < bd) { bd = d; best = t }
        if (t.ch > ch + 200) break
      }
      if (!best || bd > interval) continue
      const { lat, lon, dir } = best
      const tickOffset = TUNNEL_R + 4
      L.polyline([off(lat,lon,(dir+90)%360,tickOffset), off(lat,lon,(dir-90+360)%360,tickOffset)],
        { color:'#445566', weight:1, opacity:0.7 }).addTo(ml)
      const labelPt = off(lat, lon, (dir-90+360)%360, tickOffset+6)
      const icon = L.divIcon({
        html: `<div style="transform:rotate(${dir}deg);transform-origin:left center;font-family:'Share Tech Mono',monospace;font-size:11px;color:#7090a8;white-space:nowrap;font-weight:500">${formatCH(ch)}</div>`,
        className: '', iconAnchor: [0, 6],
      })
      L.marker(labelPt, { icon, pane:'markersPane', interactive:false }).addTo(ml)
    }
    ml.addTo(map)
    layersRef.current.markers = ml
  }

  // ── Fit tunnel ────────────────────────────────────────────────────────────
  function fitTunnel() {
    const map = mapRef.current; if (!map || !data) return
    const bounds = L.latLngBounds(data.alignment.map(a => [a.lat, a.lon]))
    map.fitBounds(bounds, { padding: [40, 40] })
  }

  // ── Reactive redraws ──────────────────────────────────────────────────────
  const pendingRedrawRef = useRef(false)

  // Fast path: TBM head always updates (even while sliding)
  useEffect(() => {
    if (!isActive) return
    drawTBMHead()
  }, [isActive, drawTBMHead])

  // Slow path: expensive layers — skip while slider is being dragged
  useEffect(() => {
    if (!isActive) { pendingRedrawRef.current = true; return }
    if (isSliding) { pendingRedrawRef.current = true; return }
    pendingRedrawRef.current = false
    drawTunnel(); drawRings(); drawGrout(); drawBars(); drawMano(); drawPiezos()
  }, [isActive, isSliding, drawTunnel, drawRings, drawGrout, drawBars, drawMano, drawPiezos])

  // When switching back to map tab or slider released, flush pending redraw
  useEffect(() => {
    if (isActive && !isSliding && pendingRedrawRef.current) {
      pendingRedrawRef.current = false
      drawTunnel(); drawRings(); drawGrout(); drawBars(); drawMano(); drawPiezos()
    }
  }, [isActive, isSliding])

  // Fit tunnel once data is ready
  useEffect(() => {
    if (data?.alignment.length) {
      setTimeout(() => fitTunnel(), 100)
    }
  }, [data])

  // ── Zoom to TBM ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!zoomToTBMTick || !mapRef.current || !data?.tbm.length) return
    const vis  = data.tbm.filter(t => t.ts <= currentTs)
    const last = vis.length ? vis[vis.length - 1] : data.tbm[0]
    if (last) mapRef.current.flyTo([last.lat, last.lon], 16, { duration: 1 })
  }, [zoomToTBMTick])

  // ── Zoom buttons ──────────────────────────────────────────────────────────
  return (
    <div style={{ flex:1, position:'relative', display:'flex', flexDirection:'column' }}>
      <div ref={containerRef} style={{ flex:1 }} />
      {/* Custom zoom controls */}
      <div style={{ position:'absolute', top:12, right:12, display:'flex', flexDirection:'column', gap:3, zIndex:1000 }}>
        {([
          ['+', () => mapRef.current?.zoomIn()],
          ['−', () => mapRef.current?.zoomOut()],
          ['⊡', fitTunnel],
        ] as [string, () => void][]).map(([label, fn], i) => (
          <button key={i} onClick={fn} style={{
            width:30, height:30, background:'var(--bg3)', border:'1px solid var(--border2)',
            borderRadius:4, color:'var(--text)', fontSize: label === '⊡' ? 10 : 16,
            cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
            backdropFilter:'blur(4px)', fontFamily:'var(--mono)',
          }}>{label}</button>
        ))}
      </div>
      {/* Basemap buttons */}
      <BasemapButtons />
    </div>
  )
}

function BasemapButtons() {
  const basemap    = useStore(s => s.basemap)
  const setBasemap = useStore(s => s.setBasemap)
  const opts: { id: 'voyager'|'dark'|'sat'; label: string }[] = [
    { id:'voyager', label:'Voyager' }, { id:'dark', label:'Dark' }, { id:'sat', label:'Satellite' },
  ]
  return (
    <div style={{ position:'absolute', bottom:12, left:12, display:'flex', gap:4, zIndex:1000 }}>
      {opts.map(o => (
        <button
          key={o.id}
          onClick={() => setBasemap(o.id)}
          style={{
            padding:'3px 9px', background: basemap===o.id ? 'rgba(0,136,170,.15)' : 'var(--bg3)',
            border: `1px solid ${basemap===o.id ? 'var(--accent)' : 'var(--border2)'}`,
            borderRadius:3, color: basemap===o.id ? 'var(--accent)' : 'var(--text2)',
            fontSize:10, cursor:'pointer', fontFamily:'var(--cond)', letterSpacing:1, textTransform:'uppercase',
          }}
        >{o.label}</button>
      ))}
    </div>
  )
}
