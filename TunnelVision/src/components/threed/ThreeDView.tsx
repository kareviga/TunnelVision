import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { useStore } from '../../store/useStore'
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
// Use easting/northing (already in metres) directly as X/Z
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
  renderer:   THREE.WebGLRenderer
  scene:      THREE.Scene
  camera:     THREE.PerspectiveCamera
  controls:   OrbitControls
  tbmGroup:   THREE.Group
  pulseRing:  THREE.Mesh
  coneLight:  THREE.PointLight
  excTube:    THREE.Mesh
  futTube:    THREE.Mesh
  tubularSegs: number
  alignPts:   { pos: THREE.Vector3; ch: number; dir: THREE.Vector3; perp: THREE.Vector3 }[]
  chMin: number
  chMax: number
  rafId: number
  drillHolesMesh: THREE.LineSegments | null
  drillHolesChainages: number[]   // chainage per hole, parallel to geometry vertex pairs
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props { data: AppData | null }

export function ThreeDView({ data }: Props) {
  const currentTs      = useStore(s => s.currentTs)
  const zoomToTBMTick  = useStore(s => s.zoomToTBMTick)
  const mountRef   = useRef<HTMLDivElement>(null)
  const stateRef   = useRef<SceneState | null>(null)

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

    // Subsample for tube geometry (every 4th pt → ~1500 pts max)
    const step = Math.max(1, Math.floor(rawPts.length / 400))
    const tubePts = rawPts.filter((_, i) => i % step === 0 || i === rawPts.length - 1)
    const tubularSegs = tubePts.length - 1

    // Direction + perpendicular for each tube point
    const alignPts = tubePts.map((p, i) => {
      const prev = tubePts[Math.max(0, i - 1)].pos
      const next = tubePts[Math.min(tubePts.length - 1, i + 1)].pos
      const dir  = next.clone().sub(prev).normalize()
      const perp = new THREE.Vector3(-dir.z, 0, dir.x).normalize()
      return { pos: p.pos, ch: p.ch, dir, perp, surf: p.surf, soil: p.soil }
    })

    // ── Renderer ──────────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true })
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
    camera.position.set(midPt.x + 800, midPt.y + 600, midPt.z + 1200)
    camera.lookAt(midPt)

    // ── Controls ──────────────────────────────────────────────────────────
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.copy(midPt)
    controls.enableDamping = true
    controls.dampingFactor = 0.07
    controls.minDistance = 10
    controls.maxDistance = 30000
    controls.update()

    // Double-click → reset to overview
    renderer.domElement.addEventListener('dblclick', () => {
      camera.position.set(midPt.x + 800, midPt.y + 600, midPt.z + 1200)
      controls.target.copy(midPt)
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
    const curve = new THREE.CatmullRomCurve3(alignPts.map(p => p.pos), false, 'catmullrom', 0.1)

    const tubeGeo = new THREE.TubeGeometry(curve, tubularSegs, TUNNEL_R, RADIAL_SEGS, false)

    // Excavated: bright cyan interior
    const excMat = new THREE.MeshPhongMaterial({
      color: 0x003344, emissive: 0x001a22,
      transparent: true, opacity: 0.55,
      side: THREE.BackSide,
    })
    const excTube = new THREE.Mesh(tubeGeo, excMat)
    scene.add(excTube)

    // Future: dim wireframe-style
    const futMat = new THREE.MeshPhongMaterial({
      color: 0x00d4ff,
      transparent: true, opacity: 0.06,
      side: THREE.BackSide,
    })
    const futTube = new THREE.Mesh(tubeGeo.clone(), futMat)
    scene.add(futTube)

    // Tube edge ring outlines (bright at intervals)
    for (let i = 0; i < alignPts.length; i += 20) {
      const pt  = alignPts[i]
      const geo = new THREE.TorusGeometry(TUNNEL_R + 0.08, 0.06, 6, RADIAL_SEGS)
      const mat = new THREE.MeshBasicMaterial({ color: 0x00d4ff, transparent: true, opacity: 0.18 })
      const ring = new THREE.Mesh(geo, mat)
      ring.position.copy(pt.pos)
      ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), pt.dir)
      scene.add(ring)
    }

    // ── Terrain strip ─────────────────────────────────────────────────────
    buildTerrainStrip(scene, alignPts)

    // ── Drill holes ───────────────────────────────────────────────────────
    let drillHolesMesh: THREE.LineSegments | null = null
    let drillHolesChainages: number[] = []
    if (data.drillHoles?.length) {
      const result = buildDrillHoles(scene, data.drillHoles, data.alignment, e0, n0)
      drillHolesMesh = result.mesh
      drillHolesChainages = result.chainages
    }

    // ── TBM group ─────────────────────────────────────────────────────────
    const tbmGroup = new THREE.Group()
    let yOffset = 0

    for (const seg of TBM_PARTS) {
      const geo = new THREE.CylinderGeometry(TUNNEL_R - 0.05, TUNNEL_R - 0.05, seg.len, RADIAL_SEGS, 1, true)
      const mat = new THREE.MeshPhongMaterial({ color: seg.hex, shininess: 80, side: THREE.DoubleSide })
      const mesh = new THREE.Mesh(geo, mat)
      // CylinderGeometry along Y; offset so cutter face is at y=0
      mesh.position.y = -(yOffset + seg.len / 2)
      yOffset += seg.len
      tbmGroup.add(mesh)
    }

    // Cutter face disc
    const faceGeo = new THREE.CircleGeometry(TUNNEL_R - 0.05, RADIAL_SEGS)
    const faceMat = new THREE.MeshPhongMaterial({ color: 0x333333, side: THREE.DoubleSide })
    const faceMesh = new THREE.Mesh(faceGeo, faceMat)
    // CircleGeometry is in XZ plane (normal = +Y); it sits at y=0 already
    tbmGroup.add(faceMesh)

    // Pulsing green ring at cutter face
    const pulseRing = new THREE.Mesh(
      new THREE.TorusGeometry(TUNNEL_R, 0.25, 8, RADIAL_SEGS),
      new THREE.MeshBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.9 })
    )
    tbmGroup.add(pulseRing)

    // Back cap
    const backGeo = new THREE.CircleGeometry(TUNNEL_R - 0.05, RADIAL_SEGS)
    const backMat = new THREE.MeshPhongMaterial({ color: 0x888888 })
    const backMesh = new THREE.Mesh(backGeo, backMat)
    backMesh.position.y = -TBM_TOTAL_LEN
    backMesh.rotation.x = Math.PI
    tbmGroup.add(backMesh)

    scene.add(tbmGroup)

    // ── Centreline ────────────────────────────────────────────────────────
    const clGeo = new THREE.BufferGeometry().setFromPoints(alignPts.map(p => p.pos))
    scene.add(new THREE.Line(clGeo, new THREE.LineBasicMaterial({ color: 0x00d4ff, transparent: true, opacity: 0.3 })))

    // ── Axes / scale helper ───────────────────────────────────────────────
    const startPos = alignPts[0].pos
    const gridHelper = new THREE.GridHelper(500, 20, 0x1a2a3a, 0x1a2a3a)
    gridHelper.position.set(startPos.x, startPos.y - 5, startPos.z)
    scene.add(gridHelper)

    // ── Render loop ───────────────────────────────────────────────────────
    let frame = 0
    function animate() {
      const id = requestAnimationFrame(animate)
      if (stateRef.current) stateRef.current.rafId = id
      frame++
      const t = frame * 0.05
      // Pulse the ring
      const s = 1 + 0.12 * Math.sin(t)
      pulseRing.scale.setScalar(s);
      (pulseRing.material as THREE.MeshBasicMaterial).opacity = 0.5 + 0.4 * Math.abs(Math.sin(t))
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
      tbmGroup, pulseRing, coneLight,
      excTube, futTube,
      tubularSegs, alignPts,
      chMin, chMax, rafId,
      drillHolesMesh, drillHolesChainages,
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

    // ── Position TBM group ──────────────────────────────────────────────
    s.tbmGroup.position.copy(pt.pos)
    // Align group's +Y axis to tunnel forward direction
    const Y = new THREE.Vector3(0, 1, 0)
    if (Math.abs(pt.dir.dot(Y)) < 0.9999) {
      s.tbmGroup.quaternion.setFromUnitVectors(Y, pt.dir)
    }

    // Point light follows TBM
    s.coneLight.position.copy(pt.pos)

    // ── Update draw ranges ──────────────────────────────────────────────
    const excFrac = (last.ch - s.chMin) / (s.chMax - s.chMin)
    const excSegs = Math.round(Math.max(0, Math.min(1, excFrac)) * s.tubularSegs)
    const idxPerSeg = RADIAL_SEGS * 6

    // Excavated tube: draw from 0 to excSegs
    s.excTube.geometry.setDrawRange(0, excSegs * idxPerSeg)
    // Future tube: draw from excSegs to end
    s.futTube.geometry.setDrawRange(excSegs * idxPerSeg, s.tubularSegs * idxPerSeg)

    // ── Drill holes: show only holes at or behind TBM chainage ──────────
    if (s.drillHolesMesh) {
      const visibleCount = s.drillHolesChainages.filter(ch => ch <= last.ch).length
      s.drillHolesMesh.geometry.setDrawRange(0, visibleCount * 2)
    }

  }, [currentTs, data])

  // ── Zoom to TBM ───────────────────────────────────────────────────────────
  useEffect(() => {
    const s = stateRef.current
    if (!zoomToTBMTick || !s || !data?.tbm.length) return
    const vis  = data.tbm.filter(t => t.ts <= currentTs)
    const last = vis.length ? vis[vis.length - 1] : data.tbm[0]
    const idx  = findNearestIdx(s.alignPts, last.ch)
    const pt   = s.alignPts[idx]
    // Move orbit controls target to TBM, offset camera to a nice side view
    s.controls.target.copy(pt.pos)
    s.camera.position.copy(pt.pos).add(
      pt.dir.clone().multiplyScalar(-80)
        .add(new THREE.Vector3(0, 30, 0))
        .add(pt.perp.clone().multiplyScalar(50))
    )
    s.controls.update()
  }, [zoomToTBMTick])

  return (
    <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#080a0e' }}>
      <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
      {!data && (
        <div className={styles.loading}>LOADING 3D DATA…</div>
      )}
      <div className={styles.hint}>
        DRAG TO ROTATE · SCROLL TO ZOOM · DOUBLE-CLICK RESET
      </div>
      <div className={styles.legend}>
        <div className={styles.legendRow}><div className={styles.swatch} style={{ background: '#00d4ff' }} />Tunnel</div>
        <div className={styles.legendRow}><div className={styles.swatch} style={{ background: '#22c55e' }} />TBM front</div>
        <div className={styles.legendRow}><div className={styles.swatch} style={{ background: 'rgba(160,120,70,0.6)' }} />Soil</div>
        <div className={styles.legendRow}><div className={styles.swatch} style={{ background: 'rgba(90,110,140,0.6)' }} />Rock</div>
        <div className={styles.legendRow}><div className={styles.swatch} style={{ background: '#22c55e', opacity: 0.5 }} />Surface</div>
      </div>
    </div>
  )
}

// ── Drill hole builder ────────────────────────────────────────────────────────
function buildDrillHoles(
  scene: THREE.Scene,
  drillHoles: import('../../types').DrillHole[],
  alignment: import('../../types').AlignPoint[],
  e0: number,
  n0: number,
) {
  const active = drillHoles.filter(h => h.length > 0)
  if (!active.length || alignment.length < 2) return { mesh: null, chainages: [] }

  const DEG8_RAD = 8 * Math.PI / 180
  const WORLD_UP = new THREE.Vector3(0, 1, 0)

  // Inleakage → RGB  (0=white, 5=light-blue, 50=blue, 200=dark-blue)
  const COLOR_STOPS: [number, [number, number, number]][] = [
    [0,   [1,     1,     1    ]],
    [5,   [0.678, 0.847, 0.902]],
    [50,  [0.118, 0.392, 0.863]],
    [200, [0.020, 0.039, 0.314]],
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

  // Sort holes by chainage so setDrawRange gives contiguous "up to TBM" slices
  const sorted = [...active].sort((a, b) => a.advance - b.advance)

  const positions:  number[] = []
  const colors:     number[] = []
  const chainages:  number[] = []   // one entry per hole, parallel to vertex pairs

  for (const hole of sorted) {
    // Advance is an index into the alignment array; clamp to valid range
    const advIdx = Math.max(0, Math.min(Math.round(hole.advance), alignment.length - 1))
    const al     = alignment[advIdx]
    const alPrev = alignment[Math.max(0, advIdx - 1)]
    const alNext = alignment[Math.min(alignment.length - 1, advIdx + 1)]

    // 3D positions for direction computation
    const posPrev = alignVec3(alPrev.easting, alPrev.northing, alPrev.tunnelElev, e0, n0)
    const posNext = alignVec3(alNext.easting, alNext.northing, alNext.tunnelElev, e0, n0)
    const pos     = alignVec3(al.easting,     al.northing,     al.tunnelElev,     e0, n0)

    const fwd = posNext.clone().sub(posPrev).normalize()
    let right_cs = new THREE.Vector3().crossVectors(fwd, WORLD_UP).normalize()
    if (right_cs.lengthSq() < 0.0001) right_cs.set(1, 0, 0)
    const up_cs = new THREE.Vector3().crossVectors(right_cs, fwd).normalize()

    // Angular position: hole 1 = 7.5° from top, clockwise looking from behind
    const angleRad = (7.5 + (hole.holeNo - 1) * 15) * Math.PI / 180
    const radial = right_cs.clone().multiplyScalar(Math.sin(angleRad))
                     .add(up_cs.clone().multiplyScalar(Math.cos(angleRad)))

    // Start: 6 m behind advance, at the tunnel wall (radially offset by tunnel radius)
    const start = pos.clone()
      .sub(fwd.clone().multiplyScalar(6))
      .add(radial.clone().multiplyScalar(TUNNEL_R))

    // Drill direction: forward + 8° outward
    const holeDir = fwd.clone().multiplyScalar(Math.cos(DEG8_RAD))
                      .add(radial.clone().multiplyScalar(Math.sin(DEG8_RAD)))
                      .normalize()

    const end = start.clone().add(holeDir.multiplyScalar(hole.length))

    const [r, g, b] = lerpColor(hole.inleakage)
    positions.push(start.x, start.y, start.z, end.x, end.y, end.z)
    colors.push(r, g, b, r, g, b)
    chainages.push(al.ch)
  }

  if (!positions.length) return { mesh: null, chainages: [] }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('color',    new THREE.Float32BufferAttribute(colors, 3))
  geo.setDrawRange(0, 0)   // start hidden; currentTs effect will set correct range

  const mat  = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85 })
  const mesh = new THREE.LineSegments(geo, mat)
  scene.add(mesh)
  return { mesh, chainages }
}

// ── Terrain strip builder ──────────────────────────────────────────────────────
function buildTerrainStrip(
  scene: THREE.Scene,
  alignPts: { pos: THREE.Vector3; perp: THREE.Vector3; surf: number; soil: number }[]
) {
  const N = alignPts.length
  if (N < 2) return

  // Helper: build a quad strip mesh between two elevation tracks
  function buildStrip(
    getY0: (i: number) => number,   // left-edge Y at point i
    getY1: (i: number) => number,   // right-edge Y at point i
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
    scene.add(new THREE.Mesh(geo, mat))
  }

  // ── Surface (green grass level) ─────────────────────────────────────
  buildStrip(
    i => alignPts[i].surf, i => alignPts[i].surf,
    i => alignPts[i].surf, i => alignPts[i].surf,
    0x1a4a1a, 0.75
  )

  // ── Soil layer (surface → soil/rock contact) ────────────────────────
  buildStrip(
    i => alignPts[i].surf,  i => alignPts[i].surf,
    i => alignPts[i].surf,  i => alignPts[i].surf,
    0x8b6020, 0.0  // top of soil already covered by surface
  )
  // Soil body (surface top → soil base bottom)
  {
    const verts = new Float32Array(N * 4 * 3)  // 4 verts per cross-section
    const idx: number[] = []
    for (let i = 0; i < N; i++) {
      const p     = alignPts[i]
      const left  = p.perp.clone().multiplyScalar(-TERRAIN_HW)
      const right = p.perp.clone().multiplyScalar(TERRAIN_HW)
      // v0: left at surf, v1: right at surf, v2: right at soil, v3: left at soil
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
        // Top face (surface level)
        const a = i*4, b = i*4+1, c = (i+1)*4, d = (i+1)*4+1
        idx.push(a, b, c, b, d, c)
        // Bottom face (soil base level)
        const e = i*4+3, f = i*4+2, g = (i+1)*4+3, h = (i+1)*4+2
        idx.push(e, g, f, f, g, h)
      }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3))
    geo.setIndex(idx)
    geo.computeVertexNormals()
    scene.add(new THREE.Mesh(geo, new THREE.MeshPhongMaterial({
      color: 0x8b6020, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false,
    })))
  }

  // ── Rock layer (soil base → tunnel axis level) ──────────────────────
  buildStrip(
    i => Math.min(alignPts[i].soil, alignPts[i].surf),
    i => Math.min(alignPts[i].soil, alignPts[i].surf),
    i => Math.min(alignPts[i].soil, alignPts[i].surf),
    i => Math.min(alignPts[i].soil, alignPts[i].surf),
    0x5a7080, 0.0
  )
  {
    const verts = new Float32Array(N * 4 * 3)
    const idx: number[] = []
    for (let i = 0; i < N; i++) {
      const p    = alignPts[i]
      const left  = p.perp.clone().multiplyScalar(-TERRAIN_HW)
      const right = p.perp.clone().multiplyScalar(TERRAIN_HW)
      const soil  = Math.min(alignPts[i].soil, alignPts[i].surf)
      const rock  = alignPts[i].pos.y - TUNNEL_R - 2  // just below tunnel
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
    scene.add(new THREE.Mesh(geo, new THREE.MeshPhongMaterial({
      color: 0x4a6070, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false,
    })))
  }

  // ── Surface edge line (green) ───────────────────────────────────────
  const surfPts = alignPts.map(p => p.pos.clone().setY(p.surf))
  const surfGeo = new THREE.BufferGeometry().setFromPoints(surfPts)
  scene.add(new THREE.Line(surfGeo, new THREE.LineBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.7 })))
}
