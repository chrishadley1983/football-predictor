import type { PunditKey } from './types'

export interface PunditCharacter {
  key: PunditKey
  name: string
  personality: string
  tagline: string
  color: string
  skinTone: string
  hairColor: string
  shirtColor: string
  accentColor: string
}

export const PUNDITS: Record<PunditKey, PunditCharacter> = {
  neverill: {
    key: 'neverill',
    name: 'Gary Neverill',
    personality: 'The Analyst',
    tagline: 'Looks right, sounds wrong',
    color: '#C41E3A',
    skinTone: '#DEBA9E',
    hairColor: '#2A1A0E',
    shirtColor: '#C41E3A',
    accentColor: '#FFD700',
  },
  bright: {
    key: 'bright',
    name: 'Ian Bright',
    personality: 'The Enthusiast',
    tagline: 'Bright by name, bright by nature',
    color: '#EE1C25',
    skinTone: '#6B4226',
    hairColor: '#1A1A1A',
    shirtColor: '#EE1C25',
    accentColor: '#FFFFFF',
  },
  meane: {
    key: 'meane',
    name: 'Roy Meane',
    personality: 'The Enforcer',
    tagline: 'Does what it says on the tin',
    color: '#1B4D3E',
    skinTone: '#D4A27A',
    hairColor: '#6E6E6E',
    shirtColor: '#1B4D3E',
    accentColor: '#FF4500',
  },
  scaragher: {
    key: 'scaragher',
    name: 'Jamie Scaragher',
    personality: 'The Debater',
    tagline: 'Nod to the Scouse',
    color: '#C8102E',
    skinTone: '#DEBB9E',
    hairColor: '#3D2B1F',
    shirtColor: '#C8102E',
    accentColor: '#00B2A9',
  },
}

export const PUNDIT_KEYS: PunditKey[] = ['neverill', 'bright', 'meane', 'scaragher']
