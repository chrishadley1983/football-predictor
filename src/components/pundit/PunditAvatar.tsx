'use client'

import { motion } from 'motion/react'
import type { PunditKey } from '@/lib/types'
import { PUNDITS } from '@/lib/pundit-characters'

function lighten(hex: string, pct: number) {
  const num = parseInt(hex.replace('#', ''), 16)
  const r = Math.min(255, ((num >> 16) & 0xff) + Math.round(2.55 * pct))
  const g = Math.min(255, ((num >> 8) & 0xff) + Math.round(2.55 * pct))
  const b = Math.min(255, (num & 0xff) + Math.round(2.55 * pct))
  return `rgb(${r},${g},${b})`
}

function darken(hex: string, pct: number) {
  const num = parseInt(hex.replace('#', ''), 16)
  const r = Math.max(0, ((num >> 16) & 0xff) - Math.round(2.55 * pct))
  const g = Math.max(0, ((num >> 8) & 0xff) - Math.round(2.55 * pct))
  const b = Math.max(0, (num & 0xff) - Math.round(2.55 * pct))
  return `rgb(${r},${g},${b})`
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnimTarget = any

interface Anims {
  body?: AnimTarget
  eyes?: AnimTarget
  brows?: AnimTarget
  mouth?: AnimTarget
  nose?: AnimTarget
  extra?: AnimTarget | null
}

// Pick a random idle animation per pundit
function getIdleAnim(punditKey: PunditKey): Anims {
  const baseBreathing: Anims = {
    body: {
      y: [0, -1.5, 0],
      transition: { duration: 3, repeat: Infinity, ease: 'easeInOut' },
    },
    eyes: {
      scaleY: [1, 1, 0.3, 0.3, 1],
      transition: { duration: 4, repeat: Infinity, ease: 'easeInOut', times: [0, 0.85, 0.88, 0.92, 0.95] },
    },
  }

  if (punditKey === 'neverill') {
    return {
      ...baseBreathing,
      brows: {
        y: [0, 1, 0],
        transition: { duration: 2.5, repeat: Infinity, ease: 'easeInOut' },
      },
      mouth: {
        scaleX: [1, 0.85, 1],
        transition: { duration: 3, repeat: Infinity, ease: 'easeInOut' },
      },
    }
  }
  if (punditKey === 'bright') {
    return {
      ...baseBreathing,
      mouth: {
        scaleY: [1.2, 1.3, 1.2],
        transition: { duration: 2, repeat: Infinity, ease: 'easeInOut' },
      },
    }
  }
  if (punditKey === 'meane') {
    return {
      ...baseBreathing,
      brows: {
        y: [0, 1.5, 1.5, 0],
        transition: { duration: 3.5, repeat: Infinity, ease: 'easeInOut' },
      },
      nose: {
        scaleX: [1, 1.2, 1],
        transition: { duration: 3.5, repeat: Infinity, ease: 'easeInOut' },
      },
    }
  }
  // scaragher
  return {
    ...baseBreathing,
    mouth: {
      scaleY: [1, 1.15, 0.9, 1],
      transition: { duration: 2.5, repeat: Infinity, ease: 'easeInOut' },
    },
  }
}

function NeverillFace({ s, cx, p, anims }: { s: number; cx: number; p: typeof PUNDITS.neverill; anims: Anims }) {
  const sd = darken(p.skinTone, 18)
  const hd = darken(p.hairColor, 12)
  return (
    <>
      <rect x={cx - s * 0.05} y={s * 0.57} width={s * 0.1} height={s * 0.19} rx={s * 0.025} fill={sd} />
      <path d={`M ${cx - s * 0.24} ${s * 0.28} Q ${cx - s * 0.28} ${s * 0.38} ${cx - s * 0.22} ${s * 0.52} Q ${cx - s * 0.18} ${s * 0.6} ${cx - s * 0.08} ${s * 0.64} Q ${cx} ${s * 0.66} ${cx + s * 0.08} ${s * 0.64} Q ${cx + s * 0.18} ${s * 0.6} ${cx + s * 0.22} ${s * 0.52} Q ${cx + s * 0.28} ${s * 0.38} ${cx + s * 0.24} ${s * 0.28} Q ${cx + s * 0.2} ${s * 0.14} ${cx} ${s * 0.12} Q ${cx - s * 0.2} ${s * 0.14} ${cx - s * 0.24} ${s * 0.28} Z`} fill={p.skinTone} />
      <ellipse cx={cx - s * 0.14} cy={s * 0.44} rx={s * 0.05} ry={s * 0.07} fill={sd} opacity="0.15" />
      <ellipse cx={cx + s * 0.14} cy={s * 0.44} rx={s * 0.05} ry={s * 0.07} fill={sd} opacity="0.15" />
      <ellipse cx={cx - s * 0.27} cy={s * 0.38} rx={s * 0.04} ry={s * 0.055} fill={sd} />
      <ellipse cx={cx + s * 0.27} cy={s * 0.38} rx={s * 0.04} ry={s * 0.055} fill={sd} />
      <path d={`M ${cx - s * 0.25} ${s * 0.28} Q ${cx - s * 0.26} ${s * 0.2} ${cx - s * 0.22} ${s * 0.15} Q ${cx - s * 0.15} ${s * 0.08} ${cx - s * 0.05} ${s * 0.07} L ${cx - s * 0.05} ${s * 0.1} Q ${cx + s * 0.05} ${s * 0.06} ${cx + s * 0.18} ${s * 0.1} Q ${cx + s * 0.24} ${s * 0.13} ${cx + s * 0.25} ${s * 0.22} Q ${cx + s * 0.26} ${s * 0.28} ${cx + s * 0.24} ${s * 0.3} L ${cx + s * 0.22} ${s * 0.22} Q ${cx + s * 0.18} ${s * 0.16} ${cx + s * 0.05} ${s * 0.14} L ${cx - s * 0.05} ${s * 0.16} Q ${cx - s * 0.18} ${s * 0.14} ${cx - s * 0.22} ${s * 0.22} Z`} fill={p.hairColor} />
      <path d={`M ${cx - s * 0.05} ${s * 0.08} Q ${cx - s * 0.02} ${s * 0.12} ${cx - s * 0.05} ${s * 0.16}`} fill="none" stroke={hd} strokeWidth="1.5" opacity="0.5" />
      <path d={`M ${cx - s * 0.18} ${s * 0.29} Q ${cx} ${s * 0.26} ${cx + s * 0.18} ${s * 0.29}`} fill={sd} opacity="0.12" />
      <motion.g animate={anims.brows || {}} style={{ originX: `${cx}px`, originY: `${s * 0.29}px` }}>
        <path d={`M ${cx - s * 0.16} ${s * 0.3} Q ${cx - s * 0.1} ${s * 0.27} ${cx - s * 0.05} ${s * 0.29}`} fill="none" stroke={p.hairColor} strokeWidth={s * 0.022} strokeLinecap="round" />
        <path d={`M ${cx + s * 0.05} ${s * 0.29} Q ${cx + s * 0.1} ${s * 0.27} ${cx + s * 0.16} ${s * 0.3}`} fill="none" stroke={p.hairColor} strokeWidth={s * 0.022} strokeLinecap="round" />
      </motion.g>
      <motion.g animate={anims.eyes || {}} style={{ originX: `${cx}px`, originY: `${s * 0.36}px` }}>
        <ellipse cx={cx - s * 0.09} cy={s * 0.36} rx={s * 0.035} ry={s * 0.02} fill="white" />
        <ellipse cx={cx + s * 0.09} cy={s * 0.36} rx={s * 0.035} ry={s * 0.02} fill="white" />
        <circle cx={cx - s * 0.09} cy={s * 0.36} r={s * 0.016} fill="#3B2210" />
        <circle cx={cx + s * 0.09} cy={s * 0.36} r={s * 0.016} fill="#3B2210" />
        <circle cx={cx - s * 0.085} cy={s * 0.355} r={s * 0.005} fill="white" />
        <circle cx={cx + s * 0.095} cy={s * 0.355} r={s * 0.005} fill="white" />
      </motion.g>
      <path d={`M ${cx - s * 0.01} ${s * 0.34} L ${cx - s * 0.015} ${s * 0.44} Q ${cx - s * 0.04} ${s * 0.46} ${cx - s * 0.035} ${s * 0.47} Q ${cx} ${s * 0.48} ${cx + s * 0.035} ${s * 0.47} Q ${cx + s * 0.04} ${s * 0.46} ${cx + s * 0.015} ${s * 0.44} L ${cx + s * 0.01} ${s * 0.34}`} fill="none" stroke={sd} strokeWidth="1.2" opacity="0.35" />
      <motion.g animate={anims.mouth || {}} style={{ originX: `${cx}px`, originY: `${s * 0.53}px` }}>
        <path d={`M ${cx - s * 0.06} ${s * 0.53} Q ${cx} ${s * 0.52} ${cx + s * 0.06} ${s * 0.53}`} fill="none" stroke={darken(p.skinTone, 32)} strokeWidth={s * 0.014} strokeLinecap="round" />
      </motion.g>
    </>
  )
}

function BrightFace({ s, cx, p, anims }: { s: number; cx: number; p: typeof PUNDITS.bright; anims: Anims }) {
  const sd = darken(p.skinTone, 15)
  const sl = lighten(p.skinTone, 18)
  return (
    <>
      <rect x={cx - s * 0.07} y={s * 0.56} width={s * 0.14} height={s * 0.19} rx={s * 0.035} fill={sd} />
      <ellipse cx={cx} cy={s * 0.37} rx={s * 0.28} ry={s * 0.3} fill={p.skinTone} />
      <ellipse cx={cx} cy={s * 0.22} rx={s * 0.14} ry={s * 0.06} fill={sl} opacity="0.2" />
      <ellipse cx={cx - s * 0.28} cy={s * 0.37} rx={s * 0.035} ry={s * 0.05} fill={sd} />
      <ellipse cx={cx + s * 0.28} cy={s * 0.37} rx={s * 0.035} ry={s * 0.05} fill={sd} />
      <path d={`M ${cx - s * 0.22} ${s * 0.18} Q ${cx - s * 0.26} ${s * 0.22} ${cx - s * 0.28} ${s * 0.3} L ${cx - s * 0.26} ${s * 0.22} Q ${cx - s * 0.2} ${s * 0.1} ${cx} ${s * 0.08} Q ${cx + s * 0.2} ${s * 0.1} ${cx + s * 0.26} ${s * 0.22} L ${cx + s * 0.28} ${s * 0.3} Q ${cx + s * 0.26} ${s * 0.22} ${cx + s * 0.22} ${s * 0.18} Q ${cx + s * 0.12} ${s * 0.09} ${cx} ${s * 0.08} Q ${cx - s * 0.12} ${s * 0.09} ${cx - s * 0.22} ${s * 0.18} Z`} fill={p.hairColor} opacity="0.3" />
      <motion.g animate={anims.brows || {}} style={{ originX: `${cx}px`, originY: `${s * 0.28}px` }}>
        <path d={`M ${cx - s * 0.15} ${s * 0.28} Q ${cx - s * 0.1} ${s * 0.255} ${cx - s * 0.05} ${s * 0.27}`} fill="none" stroke={p.hairColor} strokeWidth={s * 0.02} strokeLinecap="round" />
        <path d={`M ${cx + s * 0.05} ${s * 0.27} Q ${cx + s * 0.1} ${s * 0.255} ${cx + s * 0.15} ${s * 0.28}`} fill="none" stroke={p.hairColor} strokeWidth={s * 0.02} strokeLinecap="round" />
      </motion.g>
      <motion.g animate={anims.eyes || {}} style={{ originX: `${cx}px`, originY: `${s * 0.34}px` }}>
        <ellipse cx={cx - s * 0.1} cy={s * 0.34} rx={s * 0.042} ry={s * 0.03} fill="white" />
        <ellipse cx={cx + s * 0.1} cy={s * 0.34} rx={s * 0.042} ry={s * 0.03} fill="white" />
        <circle cx={cx - s * 0.1} cy={s * 0.34} r={s * 0.02} fill="#2A1505" />
        <circle cx={cx + s * 0.1} cy={s * 0.34} r={s * 0.02} fill="#2A1505" />
        <circle cx={cx - s * 0.094} cy={s * 0.334} r={s * 0.007} fill="white" />
        <circle cx={cx + s * 0.106} cy={s * 0.334} r={s * 0.007} fill="white" />
      </motion.g>
      <path d={`M ${cx} ${s * 0.33} L ${cx - s * 0.01} ${s * 0.42} Q ${cx - s * 0.04} ${s * 0.445} ${cx - s * 0.04} ${s * 0.45} Q ${cx} ${s * 0.46} ${cx + s * 0.04} ${s * 0.45} Q ${cx + s * 0.04} ${s * 0.445} ${cx + s * 0.01} ${s * 0.42} Z`} fill={sd} opacity="0.25" />
      <motion.g animate={anims.mouth || {}} style={{ originX: `${cx}px`, originY: `${s * 0.53}px` }}>
        <path d={`M ${cx - s * 0.12} ${s * 0.5} Q ${cx - s * 0.06} ${s * 0.49} ${cx} ${s * 0.5} Q ${cx + s * 0.06} ${s * 0.49} ${cx + s * 0.12} ${s * 0.5} Q ${cx + s * 0.1} ${s * 0.57} ${cx} ${s * 0.58} Q ${cx - s * 0.1} ${s * 0.57} ${cx - s * 0.12} ${s * 0.5} Z`} fill={darken(p.skinTone, 40)} />
        <path d={`M ${cx - s * 0.1} ${s * 0.5} Q ${cx} ${s * 0.49} ${cx + s * 0.1} ${s * 0.5} L ${cx + s * 0.09} ${s * 0.52} Q ${cx} ${s * 0.515} ${cx - s * 0.09} ${s * 0.52} Z`} fill="white" opacity="0.9" />
      </motion.g>
    </>
  )
}

function MeaneFace({ s, cx, p, anims }: { s: number; cx: number; p: typeof PUNDITS.meane; anims: Anims }) {
  const sd = darken(p.skinTone, 18)
  const bc = '#7A7A7A'
  return (
    <>
      <rect x={cx - s * 0.08} y={s * 0.56} width={s * 0.16} height={s * 0.2} rx={s * 0.04} fill={sd} />
      <path d={`M ${cx - s * 0.24} ${s * 0.25} Q ${cx - s * 0.28} ${s * 0.35} ${cx - s * 0.26} ${s * 0.46} L ${cx - s * 0.2} ${s * 0.56} Q ${cx - s * 0.14} ${s * 0.62} ${cx} ${s * 0.63} Q ${cx + s * 0.14} ${s * 0.62} ${cx + s * 0.2} ${s * 0.56} L ${cx + s * 0.26} ${s * 0.46} Q ${cx + s * 0.28} ${s * 0.35} ${cx + s * 0.24} ${s * 0.25} Q ${cx + s * 0.18} ${s * 0.12} ${cx} ${s * 0.1} Q ${cx - s * 0.18} ${s * 0.12} ${cx - s * 0.24} ${s * 0.25} Z`} fill={p.skinTone} />
      <ellipse cx={cx - s * 0.27} cy={s * 0.36} rx={s * 0.035} ry={s * 0.05} fill={sd} />
      <ellipse cx={cx + s * 0.27} cy={s * 0.36} rx={s * 0.035} ry={s * 0.05} fill={sd} />
      <path d={`M ${cx - s * 0.24} ${s * 0.25} Q ${cx - s * 0.22} ${s * 0.15} ${cx - s * 0.12} ${s * 0.11} Q ${cx} ${s * 0.08} ${cx + s * 0.12} ${s * 0.11} Q ${cx + s * 0.22} ${s * 0.15} ${cx + s * 0.24} ${s * 0.25} L ${cx + s * 0.22} ${s * 0.2} Q ${cx + s * 0.18} ${s * 0.14} ${cx} ${s * 0.12} Q ${cx - s * 0.18} ${s * 0.14} ${cx - s * 0.22} ${s * 0.2} Z`} fill={p.hairColor} />
      <path d={`M ${cx - s * 0.2} ${s * 0.28} Q ${cx} ${s * 0.25} ${cx + s * 0.2} ${s * 0.28}`} fill={sd} opacity="0.18" />
      <motion.g animate={anims.brows || {}} style={{ originX: `${cx}px`, originY: `${s * 0.28}px` }}>
        <path d={`M ${cx - s * 0.17} ${s * 0.29} Q ${cx - s * 0.11} ${s * 0.26} ${cx - s * 0.05} ${s * 0.28}`} fill="none" stroke={darken(p.hairColor, 15)} strokeWidth={s * 0.028} strokeLinecap="round" />
        <path d={`M ${cx + s * 0.05} ${s * 0.28} Q ${cx + s * 0.11} ${s * 0.26} ${cx + s * 0.17} ${s * 0.29}`} fill="none" stroke={darken(p.hairColor, 15)} strokeWidth={s * 0.028} strokeLinecap="round" />
      </motion.g>
      <motion.g animate={anims.eyes || {}} style={{ originX: `${cx}px`, originY: `${s * 0.34}px` }}>
        <ellipse cx={cx - s * 0.09} cy={s * 0.34} rx={s * 0.03} ry={s * 0.017} fill="white" />
        <ellipse cx={cx + s * 0.09} cy={s * 0.34} rx={s * 0.03} ry={s * 0.017} fill="white" />
        <circle cx={cx - s * 0.09} cy={s * 0.34} r={s * 0.014} fill="#4A6B7C" />
        <circle cx={cx + s * 0.09} cy={s * 0.34} r={s * 0.014} fill="#4A6B7C" />
        <circle cx={cx - s * 0.09} cy={s * 0.34} r={s * 0.008} fill="#1A2A33" />
        <circle cx={cx + s * 0.09} cy={s * 0.34} r={s * 0.008} fill="#1A2A33" />
      </motion.g>
      <motion.g animate={anims.nose || {}} style={{ originX: `${cx}px`, originY: `${s * 0.45}px` }}>
        <path d={`M ${cx} ${s * 0.32} L ${cx - s * 0.01} ${s * 0.42} Q ${cx - s * 0.045} ${s * 0.445} ${cx - s * 0.04} ${s * 0.45} Q ${cx} ${s * 0.46} ${cx + s * 0.04} ${s * 0.45} Q ${cx + s * 0.045} ${s * 0.445} ${cx + s * 0.01} ${s * 0.42} Z`} fill={sd} opacity="0.2" />
      </motion.g>
      <path d={`M ${cx - s * 0.22} ${s * 0.42} Q ${cx - s * 0.24} ${s * 0.5} ${cx - s * 0.18} ${s * 0.58} Q ${cx - s * 0.12} ${s * 0.66} ${cx} ${s * 0.68} Q ${cx + s * 0.12} ${s * 0.66} ${cx + s * 0.18} ${s * 0.58} Q ${cx + s * 0.24} ${s * 0.5} ${cx + s * 0.22} ${s * 0.42} Q ${cx + s * 0.15} ${s * 0.46} ${cx} ${s * 0.46} Q ${cx - s * 0.15} ${s * 0.46} ${cx - s * 0.22} ${s * 0.42} Z`} fill={bc} opacity="0.55" />
      <motion.g animate={anims.mouth || {}} style={{ originX: `${cx}px`, originY: `${s * 0.5}px` }}>
        <path d={`M ${cx - s * 0.06} ${s * 0.5} Q ${cx} ${s * 0.51} ${cx + s * 0.06} ${s * 0.5}`} fill="none" stroke={darken(p.skinTone, 30)} strokeWidth={s * 0.012} strokeLinecap="round" />
      </motion.g>
    </>
  )
}

function ScaragherFace({ s, cx, p, anims }: { s: number; cx: number; p: typeof PUNDITS.scaragher; anims: Anims }) {
  const sd = darken(p.skinTone, 16)
  return (
    <>
      <rect x={cx - s * 0.065} y={s * 0.57} width={s * 0.13} height={s * 0.18} rx={s * 0.03} fill={sd} />
      <path d={`M ${cx - s * 0.25} ${s * 0.26} Q ${cx - s * 0.28} ${s * 0.36} ${cx - s * 0.25} ${s * 0.48} Q ${cx - s * 0.2} ${s * 0.56} ${cx - s * 0.1} ${s * 0.6} Q ${cx - s * 0.04} ${s * 0.64} ${cx} ${s * 0.65} Q ${cx + s * 0.04} ${s * 0.64} ${cx + s * 0.1} ${s * 0.6} Q ${cx + s * 0.2} ${s * 0.56} ${cx + s * 0.25} ${s * 0.48} Q ${cx + s * 0.28} ${s * 0.36} ${cx + s * 0.25} ${s * 0.26} Q ${cx + s * 0.2} ${s * 0.12} ${cx} ${s * 0.1} Q ${cx - s * 0.2} ${s * 0.12} ${cx - s * 0.25} ${s * 0.26} Z`} fill={p.skinTone} />
      <ellipse cx={cx - s * 0.27} cy={s * 0.36} rx={s * 0.04} ry={s * 0.055} fill={sd} />
      <ellipse cx={cx + s * 0.27} cy={s * 0.36} rx={s * 0.04} ry={s * 0.055} fill={sd} />
      <path d={`M ${cx - s * 0.25} ${s * 0.26} Q ${cx - s * 0.26} ${s * 0.2} ${cx - s * 0.24} ${s * 0.16} L ${cx - s * 0.18} ${s * 0.14} L ${cx - s * 0.22} ${s * 0.22} Q ${cx - s * 0.24} ${s * 0.24} ${cx - s * 0.25} ${s * 0.26} Z`} fill={p.hairColor} />
      <path d={`M ${cx + s * 0.25} ${s * 0.26} Q ${cx + s * 0.26} ${s * 0.2} ${cx + s * 0.24} ${s * 0.16} L ${cx + s * 0.18} ${s * 0.14} L ${cx + s * 0.22} ${s * 0.22} Q ${cx + s * 0.24} ${s * 0.24} ${cx + s * 0.25} ${s * 0.26} Z`} fill={p.hairColor} />
      <path d={`M ${cx - s * 0.18} ${s * 0.14} Q ${cx - s * 0.12} ${s * 0.09} ${cx} ${s * 0.08} Q ${cx + s * 0.12} ${s * 0.09} ${cx + s * 0.18} ${s * 0.14} L ${cx + s * 0.12} ${s * 0.16} Q ${cx + s * 0.06} ${s * 0.14} ${cx} ${s * 0.15} Q ${cx - s * 0.06} ${s * 0.14} ${cx - s * 0.12} ${s * 0.16} Z`} fill={p.hairColor} opacity="0.7" />
      <motion.g animate={anims.brows || {}} style={{ originX: `${cx}px`, originY: `${s * 0.28}px` }}>
        <path d={`M ${cx - s * 0.16} ${s * 0.29} Q ${cx - s * 0.1} ${s * 0.265} ${cx - s * 0.05} ${s * 0.28}`} fill="none" stroke={p.hairColor} strokeWidth={s * 0.024} strokeLinecap="round" />
        <path d={`M ${cx + s * 0.05} ${s * 0.28} Q ${cx + s * 0.1} ${s * 0.265} ${cx + s * 0.16} ${s * 0.29}`} fill="none" stroke={p.hairColor} strokeWidth={s * 0.024} strokeLinecap="round" />
      </motion.g>
      <motion.g animate={anims.eyes || {}} style={{ originX: `${cx}px`, originY: `${s * 0.35}px` }}>
        <ellipse cx={cx - s * 0.1} cy={s * 0.35} rx={s * 0.038} ry={s * 0.024} fill="white" />
        <ellipse cx={cx + s * 0.1} cy={s * 0.35} rx={s * 0.038} ry={s * 0.024} fill="white" />
        <circle cx={cx - s * 0.1} cy={s * 0.35} r={s * 0.017} fill="#4A3520" />
        <circle cx={cx + s * 0.1} cy={s * 0.35} r={s * 0.017} fill="#4A3520" />
        <circle cx={cx - s * 0.095} cy={s * 0.345} r={s * 0.006} fill="white" />
        <circle cx={cx + s * 0.105} cy={s * 0.345} r={s * 0.006} fill="white" />
      </motion.g>
      <path d={`M ${cx} ${s * 0.34} L ${cx - s * 0.01} ${s * 0.43} Q ${cx - s * 0.04} ${s * 0.45} ${cx - s * 0.035} ${s * 0.46} Q ${cx} ${s * 0.47} ${cx + s * 0.035} ${s * 0.46} Q ${cx + s * 0.04} ${s * 0.45} ${cx + s * 0.01} ${s * 0.43} Z`} fill={sd} opacity="0.22" />
      <motion.g animate={anims.mouth || {}} style={{ originX: `${cx}px`, originY: `${s * 0.54}px` }}>
        <path d={`M ${cx - s * 0.08} ${s * 0.52} Q ${cx - s * 0.04} ${s * 0.51} ${cx} ${s * 0.52} Q ${cx + s * 0.04} ${s * 0.51} ${cx + s * 0.08} ${s * 0.52} Q ${cx + s * 0.06} ${s * 0.56} ${cx} ${s * 0.565} Q ${cx - s * 0.06} ${s * 0.56} ${cx - s * 0.08} ${s * 0.52} Z`} fill={darken(p.skinTone, 38)} />
        <path d={`M ${cx - s * 0.065} ${s * 0.52} Q ${cx} ${s * 0.515} ${cx + s * 0.065} ${s * 0.52} L ${cx + s * 0.06} ${s * 0.535} Q ${cx} ${s * 0.53} ${cx - s * 0.06} ${s * 0.535} Z`} fill="white" opacity="0.85" />
      </motion.g>
    </>
  )
}

const FACE_COMPONENTS: Record<PunditKey, typeof NeverillFace> = {
  neverill: NeverillFace,
  bright: BrightFace,
  meane: MeaneFace,
  scaragher: ScaragherFace,
}

interface PunditAvatarProps {
  punditKey: PunditKey
  size?: number
}

export function PunditAvatar({ punditKey, size = 80 }: PunditAvatarProps) {
  const s = size
  const cx = s / 2
  const p = PUNDITS[punditKey]
  const anims = getIdleAnim(punditKey)
  const FaceComp = FACE_COMPONENTS[punditKey]

  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
      <defs>
        <radialGradient id={`bg-${punditKey}`} cx="50%" cy="40%">
          <stop offset="0%" stopColor={lighten(p.shirtColor, 30)} />
          <stop offset="100%" stopColor={p.shirtColor} />
        </radialGradient>
        <clipPath id={`clip-${punditKey}`}>
          <circle cx={cx} cy={cx} r={s * 0.45} />
        </clipPath>
      </defs>
      <circle cx={cx} cy={cx} r={s * 0.45} fill={`url(#bg-${punditKey})`} stroke="rgba(255,255,255,0.12)" strokeWidth="1.5" />
      <g clipPath={`url(#clip-${punditKey})`}>
        <motion.g
          animate={anims.body || {}}
          style={{ originX: `${cx}px`, originY: `${s * 0.5}px` }}
        >
          <ellipse cx={cx} cy={s * 0.92} rx={s * 0.42} ry={s * 0.23} fill={darken(p.shirtColor, 15)} />
          <path d={`M ${cx - s * 0.08} ${s * 0.76} Q ${cx} ${s * 0.72} ${cx + s * 0.08} ${s * 0.76}`} fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="1.5" />
          <FaceComp s={s} cx={cx} p={p} anims={anims} />
        </motion.g>
      </g>
    </svg>
  )
}
