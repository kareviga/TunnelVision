import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { useStore } from '../../store/useStore'
import { downloadDataUrl, printAsPDF } from '../../utils/exportImage'
import { ExportButton } from '../shared/ExportButton'
import { ThreeDPanel } from './ThreeDPanel'
import type { AppData } from '../../types'
import styles from './ThreeDView.module.css'

// ── Constants ─────────────────────────────────────────────────────────────────
const TUNNEL_R      = 3.55          // 7100mm / 2
const TERRAIN_HW    = 22            // half-width of terrain strip (metres each side)
const RADIAL_SEGS   = 32
const TBM_TOTAL_LEN = 24.7         // cutterhead(1) + front(4.9) + drilling(12.9) + gripper(5.9)

const TBM_PARTS: { name: string; len: number; hex: number; emissive?: number }[] = [
  { name: 'Cutterhead',      len: 1.0,  hex: 0x222222 },
  { name: 'Front shield',    len: 4.9,  hex: 0xe0e0e0 },
  { name: 'Drilling shield', len: 12.9, hex: 0xcccccc },
  { name: 'Gripper shield',  len: 5.9,  hex: 0xbbbbbb },
]

// ── Coordinate helpers ────────────────────────────────────────────────────────
function alignVec3(e: number, n: number, elev: number, e0: number, n0: number): THREE.Vector3 {
  return new THREE.Vector3(e - e0, elev, -(n - n0))
}

function findNearestIdx(pts: { ch: number }[], targetCh: number): number {
  let best = 0, bd = Infinity
  for (let i = 0; i < pts.length; i++) {
    const d = Math.abs(pts[i].ch - targetCh)
    if (d < bd) { bd = d; best = i }
  }
  return best
}

// ── Scene ref state ───────────────────────────────────────────────────────────
interface SceneState {
  renderer:       THREE.WebGLRenderer
  scene:          THREE.Scene
  camera:         THREE.PerspectiveCamera
  controls:       OrbitControls
  tbmGroup:       THREE.Group
  tunnelGroup:    THREE.Group
  ringGroup:      THREE.Group
  terrainGroup:   THREE.Group
  piezosGroup:    THREE.Group
  centrelineMesh: THREE.Line
  gridHelper:     THREE.GridHelper
  coneLight:      THREE.PointLight
  excTube:        THREE.Mesh
  futTube:        THREE.Mesh
  tubularSegs:    number
  alignPts:       { pos: THREE.Vector3; ch: number; dir: THREE.Vector3; perp: THREE.Vector3 }[]
  chMin: number
  chMax: number
  rafId: number
  drillHolesMesh:      THREE.LineSegments | null
  drillHolesChainages: number[]
  drillHoleStartPts:   { pos: THREE.Vector3; holeNo: number; length: number; inleakage: number }[]
  initCamPos:     THREE.Vector3
  initTarget:     THREE.Vector3
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props { data: AppData | null }

export function ThreeDView({ data }: Props) {
  const currentTs        = useStore(s => s.currentTs)
  const zoomToTBMTick    = useStore(s => s.zoomToTBMTick)
  const theme            = useStore(s => s.theme)
  const threedLayers     = useStore(s => s.threedLayers)
  const activeView       = useStore(s => s.activeView)
  const setSelectedSensor = useStore(s => s.setSelectedSensor)
  const mountRef         = useRef<HTMLDivElement>(null)
  const stateRef         = useRef<SceneState | null>(null)
  const currentTsRef     = useRef(currentTs)
  const dataRef          = useRef(data)
  const [panelOpen, setPanelOpen] = useState(false)
  const [piezoTooltip, setPiezoTooltip] = useState<{
    x: number; y: number; id: string; sensorName: string
    method: string; depth: number; soilClass: string
    pressure: number | null; hasSeries: boolean
  } | null>(null)
  const [drillTooltip, setDrillTooltip] = useState<{
    x: number; y: number; holeNo: number; length: number; inleakage: number
  } | null>(null)
  const [measuring3D, setMeasuring3D]   = useState(false)
  const [measureDist3D, setMeasureDist3D] = useState<number | null>(null)
  const measuring3DRef    = useRef(false)
  const measure3DPtsRef   = useRef<THREE.Vector3[]>([])
  const measure3DSceneRef = useRef<THREE.Object3D[]>([])

  useEffect(() => { currentTsRef.current = currentTs }, [currentTs])
  useEffect(() => { dataRef.current = data }, [data])
  useEffect(() => {
    measuring3DRef.current = measuring3D
    if (!measuring3D) {
      const s = stateRef.current
      if (s) measure3DSceneRef.current.forEach(o => s.scene.remove(o))
      measure3DSceneRef.current = []; measure3DPtsRef.current = []
      setMeasureDist3D(null)
    }
  }, [measuring3D])

  // ── Initialise scene (once, when data is ready) ───────────────────────────
  useEffect(() => {
    if (!mountRef.current || !data?.alignment.length) return
    const el = mountRef.current

    const al   = data.alignment
    const e0   = al[0].easting
    const n0   = al[0].northing
    const chMin = al[0].ch
    const chMax = al[al.length - 1].ch

    // ── Pre-compute 3D alignment ──────────────────────────────────────────
    const rawPts = al.map(a => ({
      pos:  alignVec3(a.easting, a.northing, a.tunnelElev, e0, n0),
      surf: a.surfaceElev,
      soil: a.soilBaseElev,
      ch:   a.ch,
    }))

    const step = Math.max(1, Math.floor(rawPts.length / 400))
    const tubePts = rawPts.filter((_, i) => i % step === 0 || i === rawPts.length - 1)
    const tubularSegs = tubePts.length - 1

    const alignPts = tubePts.map((p, i) => {
      const prev = tubePts[Math.max(0, i - 1)].pos
      const next = tubePts[Math.min(tubePts.length - 1, i + 1)].pos
      const dir  = next.clone().sub(prev).normalize()
      const perp = new THREE.Vector3(-dir.z, 0, dir.x).normalize()
      return { pos: p.pos, ch: p.ch, dir, perp, surf: p.surf, soil: p.soil }
    })

    // ── Renderer ──────────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(el.clientWidth, el.clientHeight)
    renderer.setClearColor(0x080a0e)
    el.appendChild(renderer.domElement)

    // ── Scene ─────────────────────────────────────────────────────────────
    const scene = new THREE.Scene()
    scene.fog = new THREE.FogExp2(0x0a0d14, 0.00008)

    // ── Camera ────────────────────────────────────────────────────────────
    const camera = new THREE.PerspectiveCamera(55, el.clientWidth / el.clientHeight, 1, 60000)
    const midPt  = alignPts[Math.floor(alignPts.length / 2)].pos
    const initCamPos = new THREE.Vector3(midPt.x + 800, midPt.y + 600, midPt.z + 1200)
    const initTarget = midPt.clone()
    camera.position.copy(initCamPos)
    camera.lookAt(midPt)

    // ── Controls ──────────────────────────────────────────────────────────
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.copy(midPt)
    controls.enableDamping = true
    controls.dampingFactor = 0.07
    controls.minDistance = 10
    controls.maxDistance = 30000
    controls.update()

    renderer.domElement.addEventListener('dblclick', () => {
      camera.position.copy(initCamPos)
      controls.target.copy(initTarget)
      controls.update()
    })

    // ── Lighting ──────────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0x2a3a50, 3))
    const sun = new THREE.DirectionalLight(0xffffff, 2)
    sun.position.set(-500, 800, 300)
    scene.add(sun)
    const coneLight = new THREE.PointLight(0x22c55e, 3, 300)
    scene.add(coneLight)

    // ── Tube geometry ─────────────────────────────────────────────────────
    const curve   = new THREE.CatmullRomCurve3(alignPts.map(p => p.pos), false, 'catmullrom', 0.1)
    const tubeGeo = new THREE.TubeGeometry(curve, tubularSegs, TUNNEL_R, RADIAL_SEGS, false)

    const excMat = new THREE.MeshPhongMaterial({
      color: 0x003344, emissive: 0x001a22,
      transparent: true, opacity: 0.55, side: THREE.BackSide,
    })
    const excTube = new THREE.Mesh(tubeGeo, excMat)

    const futMat = new THREE.MeshPhongMaterial({
      color: 0x00d4ff, transparent: true, opacity: 0.06, side: THREE.BackSide,
    })
    const futTube = new THREE.Mesh(tubeGeo.clone(), futMat)

    const tunnelGroup = new THREE.Group()
    tunnelGroup.add(excTube, futTube)
    scene.add(tunnelGroup)

    // ── Ring outlines ──────────────────────────────────────────────────────
    const ringGroup = new THREE.Group()
    for (let i = 0; i < alignPts.length; i += 20) {
      const pt  = alignPts[i]
      const geo = new THREE.TorusGeometry(TUNNEL_R + 0.08, 0.06, 6, RADIAL_SEGS)
      const mat = new THREE.MeshBasicMaterial({ color: 0x00d4ff, transparent: true, opacity: 0.18 })
      const ring = new THREE.Mesh(geo, mat)
      ring.position.copy(pt.pos)
      ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), pt.dir)
      ringGroup.add(ring)
    }
    scene.add(ringGroup)

    // ── Terrain strip ─────────────────────────────────────────────────────
    const terrainGroup = new THREE.Group()
    buildTerrainStrip(terrainGroup, alignPts)
    scene.add(terrainGroup)

    // ── Piezometers ───────────────────────────────────────────────────────
    const piezosGroup = new THREE.Group()
    if (data.piezometers?.length) {
      buildPiezometers(piezosGroup, data.piezometers, e0, n0)
    }
    scene.add(piezosGroup)

    // ── Drill holes ───────────────────────────────────────────────────────
    let drillHolesMesh: THREE.LineSegments | null = null
    let drillHolesChainages: number[] = []
    let drillHoleStartPts: { pos: THREE.Vector3; holeNo: number; length: number; inleakage: number }[] = []
    if (data.drillHoles?.length) {
      const result = buildDrillHoles(scene, data.drillHoles, data.alignment, e0, n0)
      drillHolesMesh = result.mesh
      drillHolesChainages = result.chainages
      drillHoleStartPts = result.startPts
    }

    // ── TBM group ─────────────────────────────────────────────────────────
    const tbmGroup = new THREE.Group()
    let yOffset = 0
    for (const seg of TBM_PARTS) {
      const isCutter = seg.name === 'Cutterhead'
      const geo = new THREE.CylinderGeometry(TUNNEL_R - 0.05, TUNNEL_R - 0.05, seg.len, RADIAL_SEGS, 1, !isCutter)
      const mat = new THREE.MeshPhongMaterial({ color: seg.hex, shininess: 80, side: THREE.DoubleSide })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.position.y = -(yOffset + seg.len / 2)
      yOffset += seg.len
      tbmGroup.add(mesh)
    }
    const backGeo  = new THREE.CircleGeometry(TUNNEL_R - 0.05, RADIAL_SEGS)
    const backMesh = new THREE.Mesh(backGeo, new THREE.MeshPhongMaterial({ color: 0x888888 }))
    backMesh.position.y = -TBM_TOTAL_LEN
    backMesh.rotation.x = Math.PI
    tbmGroup.add(backMesh)
    scene.add(tbmGroup)

    // ── Centreline ────────────────────────────────────────────────────────
    const clGeo = new THREE.BufferGeometry().setFromPoints(alignPts.map(p => p.pos))
    const centrelineMesh = new THREE.Line(clGeo, new THREE.LineBasicMaterial({ color: 0x00d4ff, transparent: true, opacity: 0.3 }))
    scene.add(centrelineMesh)

    // ── Grid ──────────────────────────────────────────────────────────────
    const startPos  = alignPts[0].pos
    const gridHelper = new THREE.GridHelper(500, 20, 0x1a2a3a, 0x1a2a3a)
    gridHelper.position.set(startPos.x, startPos.y - 5, startPos.z)
    scene.add(gridHelper)

    // ── Render loop ───────────────────────────────────────────────────────
    function animate() {
      const id = requestAnimationFrame(animate)
      if (stateRef.current) stateRef.current.rafId = id
      controls.update()
      renderer.render(scene, camera)
    }
    const rafId = requestAnimationFrame(animate)

    // ── Resize ────────────────────────────────────────────────────────────
    const ro = new ResizeObserver(() => {
      camera.aspect = el.clientWidth / el.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(el.clientWidth, el.clientHeight)
    })
    ro.observe(el)

    stateRef.current = {
      renderer, scene, camera, controls,
      tbmGroup, tunnelGroup, ringGroup, terrainGroup, piezosGroup,
      centrelineMesh, gridHelper,
      coneLight, excTube, futTube,
      tubularSegs, alignPts,
      chMin, chMax, rafId,
      drillHolesMesh, drillHolesChainages, drillHoleStartPts,
      initCamPos, initTarget,
    }

    return () => {
      cancelAnimationFrame(stateRef.current?.rafId ?? rafId)
      ro.disconnect()
      renderer.dispose()
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement)
      stateRef.current = null
    }
  }, [data])

  // ── Update TBM position + draw ranges when currentTs changes ─────────────
  useEffect(() => {
    const s = stateRef.current
    if (!s || !data?.tbm.length) return

    const vis  = data.tbm.filter(t => t.ts <= currentTs)
    const last = vis.length ? vis[vis.length - 1] : data.tbm[0]

    const idx = findNearestIdx(s.alignPts, last.ch)
    const pt  = s.alignPts[idx]

    s.tbmGroup.position.copy(pt.pos)
    const Y = new THREE.Vector3(0, 1, 0)
    if (Math.abs(pt.dir.dot(Y)) < 0.9999) {
      s.tbmGroup.quaternion.setFromUnitVectors(Y, pt.dir)
    }
    s.coneLight.position.copy(pt.pos)

    const excFrac = (last.ch - s.chMin) / (s.chMax - s.chMin)
    const excSegs = Math.round(Math.max(0, Math.min(1, excFrac)) * s.tubularSegs)
    const idxPerSeg = RADIAL_SEGS * 6
    s.excTube.geometry.setDrawRange(0, excSegs * idxPerSeg)
    s.futTube.geometry.setDrawRange(excSegs * idxPerSeg, s.tubularSegs * idxPerSeg)

    if (s.drillHolesMesh) {
      const visibleCount = s.drillHolesChainages.filter(ch => ch <= last.ch).length
      s.drillHolesMesh.geometry.setDrawRange(0, visibleCount * 2)
    }
  }, [currentTs, data])

  // ── Toggle layer visibility ────────────────────────────────────────────────
  useEffect(() => {
    const s = stateRef.current
    if (!s) return
    s.tunnelGroup.visible    = threedLayers.tunnel
    s.tbmGroup.visible       = threedLayers.tbm
    s.ringGroup.visible      = threedLayers.rings
    s.terrainGroup.visible   = threedLayers.terrain
    s.piezosGroup.visible    = threedLayers.piezos
    if (s.drillHolesMesh) s.drillHolesMesh.visible = threedLayers.drillholes
  }, [threedLayers])

  // ── Theme change: update renderer background + fog ───────────────────────
  useEffect(() => {
    const s = stateRef.current
    if (!s) return
    const light = theme === 'light'
    s.renderer.setClearColor(light ? 0xe4eaf2 : 0x080a0e)
    if (s.scene.fog instanceof THREE.FogExp2) {
      s.scene.fog.color.setHex(light ? 0xd8e0ec : 0x0a0d14)
    }
  }, [theme])

  // ── Zoom to TBM ───────────────────────────────────────────────────────────
  useEffect(() => {
    const s = stateRef.current
    if (!zoomToTBMTick || !s || !data?.tbm.length) return
    const vis  = data.tbm.filter(t => t.ts <= currentTs)
    const last = vis.length ? vis[vis.length - 1] : data.tbm[0]
    const idx  = findNearestIdx(s.alignPts, last.ch)
    const pt   = s.alignPts[idx]
    s.controls.target.copy(pt.pos)
    s.camera.position.copy(pt.pos).add(
      pt.dir.clone().multiplyScalar(-80)
        .add(new THREE.Vector3(0, 30, 0))
        .add(pt.perp.clone().multiplyScalar(50))
    )
    s.controls.update()
  }, [zoomToTBMTick])

  function handleExportPNG() {
    const s = stateRef.current; if (!s) return
    s.renderer.render(s.scene, s.camera)
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    downloadDataUrl(s.renderer.domElement.toDataURL('image/png'), `3DView_${date}.png`)
  }
  function handleExportPDF() {
    const s = stateRef.current; if (!s) return
    s.renderer.render(s.scene, s.camera)
    printAsPDF(s.renderer.domElement.toDataURL('image/png'), '3D View')
  }

  // ── Piezometer raycasting (tooltip + click-to-chart) ─────────────────────
  useEffect(() => {
    const s = stateRef.current; if (!s || !data) return
    const scene = s                        // non-null alias for nested fns
    const canvas = scene.renderer.domElement
    const raycaster = new THREE.Raycaster()

    const DRILL_HIT_PX = 14  // screen-space radius in pixels for drill hole hover

    function onMouseMove(e: MouseEvent) {
      if (measuring3DRef.current) { setPiezoTooltip(null); setDrillTooltip(null); return }
      const rect = canvas.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      const ndc = new THREE.Vector2((mx / rect.width) * 2 - 1, (my / rect.height) * -2 + 1)

      // Piezometer raycasting (sphere meshes — reliable)
      raycaster.setFromCamera(ndc, scene.camera)
      if (scene.piezosGroup.visible) {
        const piezHits = raycaster.intersectObjects(scene.piezosGroup.children, true)
          .filter(h => h.object.userData?.type === 'piezo')
        if (piezHits.length) {
          setDrillTooltip(null)
          const ud = piezHits[0].object.userData
          const p = dataRef.current?.piezometers.find(p => p.id === ud.id)
          if (!p) { setPiezoTooltip(null); return }
          const recent = p.series.filter(s => s[0] <= currentTsRef.current).at(-1)
          setPiezoTooltip({
            x: e.clientX, y: e.clientY,
            id: p.id, sensorName: p.sensorName,
            method: p.method, depth: p.depth, soilClass: p.soilClass,
            pressure: recent ? recent[1] : null,
            hasSeries: p.series.length > 0,
          })
          return
        }
      }
      setPiezoTooltip(null)

      // Drill hole hover via screen-space proximity (no extra scene objects needed)
      if (scene.drillHolesMesh?.visible) {
        const visCount = scene.drillHolesMesh.geometry.drawRange.count / 2
        let best: typeof scene.drillHoleStartPts[0] | null = null
        let bestDist = DRILL_HIT_PX * DRILL_HIT_PX
        const proj = new THREE.Vector3()
        for (let i = 0; i < Math.min(visCount, scene.drillHoleStartPts.length); i++) {
          proj.copy(scene.drillHoleStartPts[i].pos).project(scene.camera)
          const sx = (proj.x * 0.5 + 0.5) * rect.width
          const sy = (-proj.y * 0.5 + 0.5) * rect.height
          const d2 = (sx - mx) ** 2 + (sy - my) ** 2
          if (d2 < bestDist) { bestDist = d2; best = scene.drillHoleStartPts[i] }
        }
        if (best) {
          setDrillTooltip({ x: e.clientX, y: e.clientY, holeNo: best.holeNo, length: best.length, inleakage: best.inleakage })
          return
        }
      }
      setDrillTooltip(null)
    }

    function onClick(e: MouseEvent) {
      if (measuring3DRef.current) return
      if (!scene.piezosGroup.visible) return
      const rect = canvas.getBoundingClientRect()
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width)  *  2 - 1,
        ((e.clientY - rect.top)  / rect.height) * -2 + 1,
      )
      raycaster.setFromCamera(ndc, scene.camera)
      const hits = raycaster.intersectObjects(scene.piezosGroup.children, true)
        .filter(h => h.object.userData?.type === 'piezo')
      if (!hits.length) return
      const ud = hits[0].object.userData
      const p = dataRef.current?.piezometers.find(p => p.id === ud.id)
      if (p?.series.length) setSelectedSensor({ type: 'piezometer', id: ud.id })
    }

    canvas.addEventListener('mousemove', onMouseMove)
    canvas.addEventListener('mouseleave', () => { setPiezoTooltip(null); setDrillTooltip(null) })
    canvas.addEventListener('click', onClick)
    return () => {
      canvas.removeEventListener('mousemove', onMouseMove)
      canvas.removeEventListener('mouseleave', () => { setPiezoTooltip(null); setDrillTooltip(null) })
      canvas.removeEventListener('click', onClick)
    }
  }, [data, setSelectedSensor])

  // ── 3D measure tool ───────────────────────────────────────────────────────
  useEffect(() => {
    const s = stateRef.current; if (!s || !data) return
    const canvas = s.renderer.domElement
    const scene  = s
    const raycaster = new THREE.Raycaster()

    function onClick(e: MouseEvent) {
      if (!measuring3DRef.current) return
      const rect = canvas.getBoundingClientRect()
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width)  *  2 - 1,
        ((e.clientY - rect.top)  / rect.height) * -2 + 1,
      )
      raycaster.setFromCamera(ndc, scene.camera)
      const hits = raycaster.intersectObjects(scene.scene.children, true).filter(h =>
        h.object.visible &&
        !(h.object instanceof THREE.Line) &&
        !(h.object instanceof THREE.LineSegments) &&
        !measure3DSceneRef.current.includes(h.object)
      )
      if (!hits.length) return
      const pt = hits[0].point
      const pts = measure3DPtsRef.current
      if (pts.length >= 2) {
        measure3DSceneRef.current.forEach(o => scene.scene.remove(o))
        measure3DSceneRef.current = []; measure3DPtsRef.current = []
        setMeasureDist3D(null)
      }
      measure3DPtsRef.current.push(pt)
      const sph = new THREE.Mesh(
        new THREE.SphereGeometry(2, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0x00d4ff }),
      )
      sph.position.copy(pt)
      scene.scene.add(sph)
      measure3DSceneRef.current.push(sph)
      if (measure3DPtsRef.current.length === 2) {
        const [p1, p2] = measure3DPtsRef.current
        const geo = new THREE.BufferGeometry().setFromPoints([p1, p2])
        const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x00d4ff }))
        scene.scene.add(line)
        measure3DSceneRef.current.push(line)
        setMeasureDist3D(p1.distanceTo(p2))
      }
    }

    canvas.addEventListener('click', onClick)
    return () => canvas.removeEventListener('click', onClick)
  }, [data])

  return (
    <div className={styles.wrap}>
      {/* Left panel */}
      <div className={`${styles.panelOverlay} ${panelOpen ? styles.open : ''}`}>
        <ThreeDPanel />
      </div>

      {/* 3D canvas area — mountRef is just the bare canvas mount target */}
      <div style={{ flex: 1, height: '100%', position: 'relative' }}>
        <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
        {!data && <div className={styles.loading}>LOADING 3D DATA…</div>}
        {/* Piezometer tooltip */}
        {piezoTooltip && (
          <div style={{
            position: 'fixed', left: piezoTooltip.x + 14, top: piezoTooltip.y - 10,
            background: '#111', border: '1px solid #253040',
            borderRadius: 4, padding: '5px 9px',
            fontFamily: 'var(--mono)', fontSize: 10, color: '#fff',
            pointerEvents: 'none', zIndex: 9999, lineHeight: 1.8,
            boxShadow: '0 2px 8px rgba(0,0,0,.5)',
          }}>
            <div style={{ fontFamily: 'var(--cond)', fontSize: 13, fontWeight: 700, color: '#f472b6' }}>
              PZ {piezoTooltip.id}{piezoTooltip.sensorName ? ` (${piezoTooltip.sensorName})` : ''}
            </div>
            {piezoTooltip.pressure !== null && (
              <div>{piezoTooltip.pressure.toFixed(1)} <span style={{ color: '#7090a8' }}>kPa</span></div>
            )}
            {piezoTooltip.method && <div style={{ color: '#7090a8' }}>{piezoTooltip.method}</div>}
            {piezoTooltip.soilClass && <div style={{ color: '#7090a8' }}>{piezoTooltip.soilClass}</div>}
            <div style={{ color: '#7090a8' }}>Depth: {piezoTooltip.depth} m</div>
            {piezoTooltip.hasSeries && (
              <div style={{ color: '#7090a8', fontSize: 9, marginTop: 2 }}>Click to open chart</div>
            )}
          </div>
        )}
        {drillTooltip && (
          <div style={{
            position: 'fixed', left: drillTooltip.x + 14, top: drillTooltip.y - 10,
            background: '#111', border: '1px solid #253040',
            borderRadius: 4, padding: '5px 9px',
            fontFamily: 'var(--mono)', fontSize: 10, color: '#fff',
            pointerEvents: 'none', zIndex: 9999, lineHeight: 1.8,
            boxShadow: '0 2px 8px rgba(0,0,0,.5)',
          }}>
            <div style={{ fontFamily: 'var(--cond)', fontSize: 13, fontWeight: 700, color: '#60a5fa' }}>
              Hole #{drillTooltip.holeNo}
            </div>
            <div>Length: {drillTooltip.length.toFixed(1)} <span style={{ color: '#7090a8' }}>m</span></div>
            <div>Inleakage: {drillTooltip.inleakage.toFixed(1)} <span style={{ color: '#7090a8' }}>l/min</span></div>
          </div>
        )}
        {measuring3D && measureDist3D !== null && (
          <div style={{
            position: 'absolute', bottom: 48, left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,0.75)', border: '1px solid var(--accent)',
            borderRadius: 4, padding: '4px 10px',
            fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--accent)',
            pointerEvents: 'none', zIndex: 10,
          }}>
            {measureDist3D.toFixed(1)} m
          </div>
        )}
        {measuring3D && measureDist3D === null && (
          <div style={{
            position: 'absolute', bottom: 48, left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,0.65)', border: '1px solid var(--border2)',
            borderRadius: 4, padding: '4px 10px',
            fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text2)',
            pointerEvents: 'none', zIndex: 10,
          }}>
            Click first point
          </div>
        )}
        <div className={styles.hint}>DRAG TO ROTATE · SCROLL TO ZOOM · DOUBLE-CLICK RESET</div>
        {/* Zoom + measure controls */}
        <div style={{ position:'absolute', top:12, right:12, display:'flex', flexDirection:'column', gap:3, zIndex:10 }}>
          {([
            ['+', () => { const s = stateRef.current; if (!s) return; const dir = s.camera.position.clone().sub(s.controls.target); s.camera.position.copy(s.controls.target).add(dir.multiplyScalar(0.6)); s.controls.update() }],
            ['−', () => { const s = stateRef.current; if (!s) return; const dir = s.camera.position.clone().sub(s.controls.target); s.camera.position.copy(s.controls.target).add(dir.multiplyScalar(1.6)); s.controls.update() }],
            ['⊡', () => { const s = stateRef.current; if (!s) return; s.camera.position.copy(s.initCamPos); s.controls.target.copy(s.initTarget); s.controls.update() }],
          ] as [string, () => void][]).map(([label, fn], i) => (
            <button key={i} onClick={fn} style={{
              width:30, height:30, background:'var(--bg3)', border:'1px solid var(--border2)',
              borderRadius:4, color:'var(--text)', fontSize: label==='⊡' ? 10 : 16,
              cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
              backdropFilter:'blur(4px)', fontFamily:'var(--mono)',
            }}>{label}</button>
          ))}
          <button
            onClick={() => setMeasuring3D(m => !m)}
            title="Measure distance"
            style={{
              width:30, height:30,
              background: measuring3D ? 'var(--accent)' : 'var(--bg3)',
              border: `1px solid ${measuring3D ? 'var(--accent)' : 'var(--border2)'}`,
              borderRadius:4,
              color: measuring3D ? '#000' : 'var(--text)',
              fontSize: 13,
              cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
              backdropFilter:'blur(4px)', fontFamily:'var(--mono)',
            }}
          >↔</button>
          <div style={{ height: 3 }} />
          <ExportButton onPNG={handleExportPNG} onPDF={handleExportPDF} />
        </div>
      </div>

      {/* Mobile panel toggle */}
      <button
        className={styles.panelToggle}
        onClick={() => setPanelOpen(o => !o)}
        aria-label="Toggle panel"
      >
        {panelOpen ? '✕' : '☰'}
      </button>

      {/* Tap-outside backdrop (mobile only) */}
      {panelOpen && (
        <div
          className={styles.backdrop}
          onClick={() => setPanelOpen(false)}
          style={{ position: 'absolute', inset: 0, zIndex: 540, background: 'rgba(0,0,0,0.45)' }}
        />
      )}
    </div>
  )
}

// ── Piezometer builder ────────────────────────────────────────────────────────
function buildPiezometers(
  group: THREE.Group,
  piezometers: import('../../types').PiezometerSensor[],
  e0: number,
  n0: number,
) {
  const PINK  = new THREE.Color(0xf472b6)
  const valid = piezometers.filter(p => p.easting && p.northing)
  if (!valid.length) return

  for (const p of valid) {
    const x =  p.easting  - e0
    const z = -(p.northing - n0)
    const yTop    = p.elev
    const yBottom = p.elev - p.depth

    const pts = [new THREE.Vector3(x, yTop, z), new THREE.Vector3(x, yBottom, z)]
    const lineGeo = new THREE.BufferGeometry().setFromPoints(pts)
    group.add(new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: PINK, transparent: true, opacity: 0.7 })))

    const sGeo = new THREE.SphereGeometry(1.2, 8, 6)
    const sMat = new THREE.MeshBasicMaterial({ color: PINK, transparent: true, opacity: 0.85 })
    const sphere = new THREE.Mesh(sGeo, sMat)
    sphere.position.set(x, yTop, z)
    sphere.userData = { type: 'piezo', id: p.id }
    group.add(sphere)
  }
}

// ── Drill hole builder ────────────────────────────────────────────────────────
function buildDrillHoles(
  scene: THREE.Scene,
  drillHoles: import('../../types').DrillHole[],
  alignment: import('../../types').AlignPoint[],
  e0: number,
  n0: number,
): { mesh: THREE.LineSegments | null; chainages: number[]; startPts: { pos: THREE.Vector3; holeNo: number; length: number; inleakage: number }[] } {
  const active = drillHoles.filter(h => h.length > 0)
  if (!active.length || alignment.length < 2) return { mesh: null, chainages: [], startPts: [] }

  const DEG8_RAD = 8 * Math.PI / 180
  const WORLD_UP = new THREE.Vector3(0, 1, 0)

  const COLOR_STOPS: [number, [number, number, number]][] = [
    [0,  [1,     1,     1    ]],
    [1,  [0.678, 0.847, 0.902]],
    [10, [0.118, 0.392, 0.863]],
    [50, [0.020, 0.039, 0.314]],
  ]

  function lerpColor(v: number): [number, number, number] {
    const val = Math.max(0, v)
    for (let i = 0; i < COLOR_STOPS.length - 1; i++) {
      if (val <= COLOR_STOPS[i + 1][0]) {
        const t = (val - COLOR_STOPS[i][0]) / (COLOR_STOPS[i + 1][0] - COLOR_STOPS[i][0])
        return [
          COLOR_STOPS[i][1][0] + t * (COLOR_STOPS[i+1][1][0] - COLOR_STOPS[i][1][0]),
          COLOR_STOPS[i][1][1] + t * (COLOR_STOPS[i+1][1][1] - COLOR_STOPS[i][1][1]),
          COLOR_STOPS[i][1][2] + t * (COLOR_STOPS[i+1][1][2] - COLOR_STOPS[i][1][2]),
        ]
      }
    }
    return COLOR_STOPS[COLOR_STOPS.length - 1][1]
  }

  const sorted = [...active].sort((a, b) => a.advance - b.advance)
  const positions: number[] = []
  const colors:    number[] = []
  const chainages: number[] = []
  const startPts:  { pos: THREE.Vector3; holeNo: number; length: number; inleakage: number }[] = []

  for (const hole of sorted) {
    const advIdx = Math.max(0, Math.min(Math.round(hole.advance), alignment.length - 1))
    const al     = alignment[advIdx]
    const alPrev = alignment[Math.max(0, advIdx - 1)]
    const alNext = alignment[Math.min(alignment.length - 1, advIdx + 1)]

    const posPrev = alignVec3(alPrev.easting, alPrev.northing, alPrev.tunnelElev, e0, n0)
    const posNext = alignVec3(alNext.easting, alNext.northing, alNext.tunnelElev, e0, n0)
    const pos     = alignVec3(al.easting,     al.northing,     al.tunnelElev,     e0, n0)

    const fwd = posNext.clone().sub(posPrev).normalize()
    let right_cs = new THREE.Vector3().crossVectors(fwd, WORLD_UP).normalize()
    if (right_cs.lengthSq() < 0.0001) right_cs.set(1, 0, 0)
    const up_cs = new THREE.Vector3().crossVectors(right_cs, fwd).normalize()

    const angleRad = (7.5 + (hole.holeNo - 1) * 15) * Math.PI / 180
    const radial = right_cs.clone().multiplyScalar(Math.sin(angleRad))
                     .add(up_cs.clone().multiplyScalar(Math.cos(angleRad)))

    const start = pos.clone()
      .sub(fwd.clone().multiplyScalar(6))
      .add(radial.clone().multiplyScalar(TUNNEL_R))

    const holeDir = fwd.clone().multiplyScalar(Math.cos(DEG8_RAD))
                      .add(radial.clone().multiplyScalar(Math.sin(DEG8_RAD)))
                      .normalize()

    const end = start.clone().add(holeDir.multiplyScalar(hole.length))
    const [r, g, b] = lerpColor(hole.inleakage)
    positions.push(start.x, start.y, start.z, end.x, end.y, end.z)
    colors.push(r, g, b, r, g, b)
    chainages.push(al.ch)
    startPts.push({ pos: start.clone(), holeNo: hole.holeNo, length: hole.length, inleakage: hole.inleakage })
  }

  if (!positions.length) return { mesh: null, chainages: [], startPts: [] }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('color',    new THREE.Float32BufferAttribute(colors, 3))
  geo.setDrawRange(0, 0)

  const mat  = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85 })
  const mesh = new THREE.LineSegments(geo, mat)
  scene.add(mesh)
  return { mesh, chainages, startPts }
}

// ── Terrain strip builder ──────────────────────────────────────────────────────
function buildTerrainStrip(
  group: THREE.Group,
  alignPts: { pos: THREE.Vector3; perp: THREE.Vector3; surf: number; soil: number }[]
) {
  const N = alignPts.length
  if (N < 2) return

  function buildStrip(
    leftElev:  (i: number) => number,
    rightElev: (i: number) => number,
    color: number,
    opacity: number,
    side: THREE.Side = THREE.DoubleSide
  ) {
    const verts = new Float32Array(N * 2 * 3)
    const idx: number[] = []

    for (let i = 0; i < N; i++) {
      const p    = alignPts[i]
      const left  = p.pos.clone().setY(leftElev(i)).add(p.perp.clone().multiplyScalar(-TERRAIN_HW))
      const right = p.pos.clone().setY(rightElev(i)).add(p.perp.clone().multiplyScalar(TERRAIN_HW))
      const v = i * 6
      verts[v]   = left.x;  verts[v+1] = left.y;  verts[v+2] = left.z
      verts[v+3] = right.x; verts[v+4] = right.y; verts[v+5] = right.z
      if (i < N - 1) {
        const a = i*2, b = i*2+1, c = (i+1)*2, d = (i+1)*2+1
        idx.push(a, c, b,  b, c, d)
      }
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3))
    geo.setIndex(idx)
    geo.computeVertexNormals()

    const mat = new THREE.MeshPhongMaterial({
      color, transparent: true, opacity, side, depthWrite: opacity > 0.5,
    })
    group.add(new THREE.Mesh(geo, mat))
  }

  // Surface (green grass level)
  buildStrip(
    i => alignPts[i].surf, i => alignPts[i].surf,
    0x1a4a1a, 0.75
  )

  // Soil body
  {
    const verts = new Float32Array(N * 4 * 3)
    const idx: number[] = []
    for (let i = 0; i < N; i++) {
      const p     = alignPts[i]
      const left  = p.perp.clone().multiplyScalar(-TERRAIN_HW)
      const right = p.perp.clone().multiplyScalar(TERRAIN_HW)
      const surf = alignPts[i].surf
      const soil = Math.min(alignPts[i].soil, surf)
      const pts4 = [
        p.pos.clone().setY(surf).add(left),
        p.pos.clone().setY(surf).add(right),
        p.pos.clone().setY(soil).add(right),
        p.pos.clone().setY(soil).add(left),
      ]
      pts4.forEach((pt, j) => {
        const base = (i * 4 + j) * 3
        verts[base] = pt.x; verts[base+1] = pt.y; verts[base+2] = pt.z
      })
      if (i < N - 1) {
        for (let j = 0; j < 4; j++) {
          const a = i*4+j, b = i*4+(j+1)%4, c = (i+1)*4+j, d = (i+1)*4+(j+1)%4
          if (j < 3) idx.push(a, c, b, b, c, d)
        }
        const a = i*4, b = i*4+1, c = (i+1)*4, d = (i+1)*4+1
        idx.push(a, b, c, b, d, c)
        const e = i*4+3, f = i*4+2, g = (i+1)*4+3, h = (i+1)*4+2
        idx.push(e, g, f, f, g, h)
      }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3))
    geo.setIndex(idx)
    geo.computeVertexNormals()
    group.add(new THREE.Mesh(geo, new THREE.MeshPhongMaterial({
      color: 0x8b6020, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false,
    })))
  }

  // Rock body
  {
    const verts = new Float32Array(N * 4 * 3)
    const idx: number[] = []
    for (let i = 0; i < N; i++) {
      const p    = alignPts[i]
      const left  = p.perp.clone().multiplyScalar(-TERRAIN_HW)
      const right = p.perp.clone().multiplyScalar(TERRAIN_HW)
      const soil  = Math.min(alignPts[i].soil, alignPts[i].surf)
      const rock  = alignPts[i].pos.y - TUNNEL_R - 2
      const pts4  = [
        p.pos.clone().setY(soil).add(left),
        p.pos.clone().setY(soil).add(right),
        p.pos.clone().setY(rock).add(right),
        p.pos.clone().setY(rock).add(left),
      ]
      pts4.forEach((pt, j) => {
        const base = (i * 4 + j) * 3
        verts[base] = pt.x; verts[base+1] = pt.y; verts[base+2] = pt.z
      })
      if (i < N - 1) {
        for (let j = 0; j < 3; j++) {
          const a = i*4+j, b = i*4+j+1, c = (i+1)*4+j, d = (i+1)*4+j+1
          idx.push(a, c, b, b, c, d)
        }
        const a = i*4, b = i*4+1, c = (i+1)*4, d = (i+1)*4+1
        idx.push(a, b, c, b, d, c)
      }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3))
    geo.setIndex(idx)
    geo.computeVertexNormals()
    group.add(new THREE.Mesh(geo, new THREE.MeshPhongMaterial({
      color: 0x4a6070, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false,
    })))
  }

  // Surface edge line (green)
  const surfPts = alignPts.map(p => p.pos.clone().setY(p.surf))
  const surfGeo = new THREE.BufferGeometry().setFromPoints(surfPts)
  group.add(new THREE.Line(surfGeo, new THREE.LineBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.7 })))
}
