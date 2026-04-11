const R = 6371000

/** Offset a lat/lon by az degrees (bearing) and m metres */
export function off(lat: number, lon: number, az: number, m: number): [number, number] {
  const a = (az * Math.PI) / 180
  const dLat = (m * Math.cos(a)) / R
  const dLon = (m * Math.sin(a)) / (R * Math.cos((lat * Math.PI) / 180))
  return [lat + (dLat * 180) / Math.PI, lon + (dLon * 180) / Math.PI]
}

export const TUNNEL_R = 3.54   // outer radius (7080mm diameter)
export const TBM_W    = 3.55
export const TBM_LENGTH = 24.7

/** Find the closest alignment index for a given chainage fraction */
export function chToAlignIdx(ch: number, chMin: number, chMax: number, len: number): number {
  const f = (ch - chMin) / (chMax - chMin)
  return Math.min(len - 1, Math.max(0, Math.round(f * (len - 1))))
}
