// ── Raw CSV row types (as parsed by PapaParse) ────────────────────────────────

export interface AlignmentRow {
  chainage: number
  advance: number
  ring: number
  easting: number
  northing: number
  tunnel_elev: number
  surface_elev: number
  soil_base_elev: number
  soil_depth: number
  lon: number
  lat: number
  tunnel_dir: number
}

export interface TBMRow {
  chainage: number
  advance: number
  ring: number
  ring_type: string
  date: string
  week: number
  timestamp: string
  pen_mm_min: number
  pen_mm_rev: number
  rpm: number
  torque: number
  thrust: number
  vibration: number
  mekv: number
  fpi: number
  pen_hr: number
}

export interface XRFRow {
  chainage: number
  advance: number
  ring: number
  color: string
  S: number
  U: number
  NP_AP: number
  Fe_S: number
  Ca: number
  Fe: number
  Al: number
  K: number
  Si: number
  Ti: number
  Mg: number
}

export interface PregroutingRow {
  round: number
  screen: string
  date: string
  advance: number
  chainage: number
  drill_type: string
  total_drillmeters: number
  start_drilling: string
  end_drilling: string
  totel_time: number   // note: original CSV has this typo
  capacity: number
  screen_length_m: number
  inleakage_l_per_min: number
  otv: string
  deviation_measurement: string
  otv_comment: string
  start_pumping: string
  end_pumping: string
  injection_pressure: number
  cement_type: string
  injection_volume_litres: number
  injection_qty_kg: number
  superplastisizer_qty: number
  accelerator_qty: number
  packers: number
}

export interface ManometerPositionRow {
  manometer_id: string
  name: string
  chainage_m: number
  manometer_elev: number
}

export interface ManometerDataRow {
  date: string
  manometer_id: string
  pressure_bar: number
  chainage_m: number
  pressure_elev: number
  dist_tbm: number
}

export interface PiezometerPositionRow {
  area: number
  method: string
  id: string
  partID: number
  x: number
  y: number
  z: number
  lon: number
  lat: number
  depth: number
  height_probe: number
  soil_classification: string
}

// ── Processed / joined types (used at runtime) ────────────────────────────────

/** One ring of TBM data enriched with lat/lon/dir from alignment */
export interface TBMRecord {
  ch: number
  ring: number
  thrust: number
  torque: number
  rpm: number
  pen_rev: number
  pen_hr: number
  fpi: number
  lat: number
  lon: number
  dir: number
  ts: number        // unix timestamp (seconds)
  ringTypeIdx: number
  ringType: string
}

/** One ring of XRF data enriched with lat/lon/dir */
export interface XRFRecord {
  ch: number
  ring: number
  lat: number
  lon: number
  dir: number
  S: number; U: number; NP_AP: number; Fe_S: number
  Ca: number; Fe: number; Al: number; K: number
  Si: number; Ti: number; Mg: number
}

/** One grouting screen */
export interface GroutRecord {
  ch: number
  screenLen: number
  lat: number
  lon: number
  dir: number
  ts: number
  inleakage: number
  injVol: number
  cement: number
  drillM: number
  capacity: number
  duration: number
  packers: number
  drillType: string
}

/** One alignment point */
export interface AlignPoint {
  ch: number
  lat: number
  lon: number
  easting: number
  northing: number
  dir: number
  tunnelElev: number
  surfaceElev: number
  soilBaseElev: number
}

/** Profile data for profile view */
export interface ProfilePoint {
  ch: number
  tunnelElev: number
  surfaceElev: number
  soilBaseElev: number
  soilDepth: number
}

/** One manometer sensor with its time series */
export interface ManometerSensor {
  id: string
  name: string
  ch: number
  elev: number
  lat: number
  lon: number
  series: Array<[number, number, number]>  // [ts, pressure, elev]
}

/** One piezometer sensor */
export interface PiezometerSensor {
  id: string
  lat: number
  lon: number
  easting: number
  northing: number
  elev: number                            // ground elevation (z column)
  method: string
  depth: number
  soilClass: string
  sensorName: string                      // name as in data file header (may be empty)
  series: Array<[number, number]>         // [ts_seconds, kPa]
}

/** One drill hole at a grouting screen advance */
export interface DrillHole {
  advance: number      // advance (metres) — position along tunnel
  holeNo: number       // 1-24
  length: number       // hole length in metres (0 = not drilled)
  inleakage: number    // L/min
}

// ── App data (fully loaded + processed) ──────────────────────────────────────

export interface AppData {
  tbm: TBMRecord[]
  xrf: XRFRecord[]
  grout: GroutRecord[]
  drillHoles: DrillHole[]
  alignment: AlignPoint[]
  profile: ProfilePoint[]
  manometers: ManometerSensor[]
  piezometers: PiezometerSensor[]
  tsMin: number
  tsMax: number
  chMin: number
  chMax: number
}

// ── Channel / display state ───────────────────────────────────────────────────

export type Side = 'right' | 'left'
export type DataGroup = 'tbm' | 'xrf'
export type ColorMode = 'continuous' | 'discrete'

export interface DiscreteClass {
  from: number
  to: number
  color: string
}

export interface ChannelState {
  param: string
  group: DataGroup
  visible: boolean
  scaleMin: number
  scaleMax: number
  inverted: boolean
  maxLen: number
  discrete: boolean
  classes: DiscreteClass[] | null
}

export type LayerKey = 'tunnel' | 'center' | 'markers' | 'rings' | 'grout' | 'piezos' | 'mano'

export type ProfParam = 'fpi' | 'thrust' | 'torque' | 'pen_hr'
export type ProfLayerKey = 'grout' | 'piezos' | 'mano' | 'soil' | 'rock'

// ── Param catalogue entry ─────────────────────────────────────────────────────

export interface ParamDef {
  label: string
  unit: string
  dataKey: 'tbm' | 'xrf'
  field: keyof TBMRecord | keyof XRFRecord
  min: number
  max: number
}
