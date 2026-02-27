import { PUNDITS, type PunditCharacter } from './pundit-characters'
import type { PunditKey } from './types'

/** Deterministic UUIDs matching the database migration */
export const PUNDIT_PLAYER_IDS: Record<PunditKey, string> = {
  neverill: '00000000-0000-0000-0000-000000000001',
  bright: '00000000-0000-0000-0000-000000000002',
  meane: '00000000-0000-0000-0000-000000000003',
  scaragher: '00000000-0000-0000-0000-000000000004',
}

const PLAYER_ID_TO_KEY = new Map(
  Object.entries(PUNDIT_PLAYER_IDS).map(([key, id]) => [id, key as PunditKey])
)

export function isPunditPlayer(playerId: string): boolean {
  return PLAYER_ID_TO_KEY.has(playerId)
}

export function getPunditByPlayerId(playerId: string): (PunditCharacter & { key: PunditKey }) | null {
  const key = PLAYER_ID_TO_KEY.get(playerId)
  if (!key) return null
  return { ...PUNDITS[key], key }
}
