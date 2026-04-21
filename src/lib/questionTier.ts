// ─── Question difficulty tiers ───────────────────────────────────────────────
// Tier 1 = easiest, 10 = hardest.
// In the admin Rankings view, tiers are assigned via NTILE(10) (percentile).
// For the play badge, we derive tier from a stored correct_rate using the same
// absolute thresholds that roughly match the percentile distribution.

export type TierInfo = {
  tier: number          // 1–10, or 0 = unranked
  name: string
  shortName: string
  color: string         // Tailwind bg class
  textColor: string     // Tailwind text class
  borderColor: string   // Tailwind border class
}

// Ordered easiest → hardest (tier 1 → 10)
export const TIER_NAMES: Record<number, { name: string; shortName: string }> = {
  1:  { name: 'Initiate',        shortName: 'Initiate'  },
  2:  { name: 'Solver',          shortName: 'Solver'    },
  3:  { name: 'Challenger',      shortName: 'Challenger'},
  4:  { name: 'Decoder',         shortName: 'Decoder'   },
  5:  { name: 'Architect',       shortName: 'Architect' },
  6:  { name: 'Theorist',        shortName: 'Theorist'  },
  7:  { name: 'Cryptic Mind',    shortName: 'Cryptic'   },
  8:  { name: 'Paradox Solver',  shortName: 'Paradox'   },
  9:  { name: 'Conundrum Elite', shortName: 'Elite'     },
  10: { name: 'The Oracle',      shortName: 'Oracle'    },
}

// Gradient of colors: green (easy) → yellow → orange → red → purple (hardest)
const TIER_COLORS: Record<number, { bg: string; text: string; border: string }> = {
  1:  { bg: 'bg-emerald-100',  text: 'text-emerald-700', border: 'border-emerald-300' },
  2:  { bg: 'bg-green-100',    text: 'text-green-700',   border: 'border-green-300'   },
  3:  { bg: 'bg-teal-100',     text: 'text-teal-700',    border: 'border-teal-300'    },
  4:  { bg: 'bg-sky-100',      text: 'text-sky-700',     border: 'border-sky-300'     },
  5:  { bg: 'bg-yellow-100',   text: 'text-yellow-700',  border: 'border-yellow-300'  },
  6:  { bg: 'bg-amber-100',    text: 'text-amber-700',   border: 'border-amber-300'   },
  7:  { bg: 'bg-orange-100',   text: 'text-orange-700',  border: 'border-orange-300'  },
  8:  { bg: 'bg-red-100',      text: 'text-red-700',     border: 'border-red-300'     },
  9:  { bg: 'bg-rose-100',     text: 'text-rose-700',    border: 'border-rose-300'    },
  10: { bg: 'bg-purple-100',   text: 'text-purple-700',  border: 'border-purple-300'  },
}

export function getTierInfo(tier: number | null | undefined): TierInfo {
  if (!tier || tier < 1 || tier > 10) {
    return {
      tier: 0,
      name: 'Unranked',
      shortName: 'Unranked',
      color: 'bg-gray-100',
      textColor: 'text-gray-400',
      borderColor: 'border-gray-200',
    }
  }
  const { name, shortName } = TIER_NAMES[tier]
  const { bg, text, border } = TIER_COLORS[tier]
  return { tier, name, shortName, color: bg, textColor: text, borderColor: border }
}

// Derive tier (1–10) from a correct_rate using absolute thresholds.
// Used for play badge when NTILE is not available.
export function tierFromRate(rate: number | null | undefined): number | null {
  if (rate === null || rate === undefined) return null
  if (rate >= 0.90) return 1   // Initiate
  if (rate >= 0.80) return 2   // Solver
  if (rate >= 0.70) return 3   // Challenger
  if (rate >= 0.60) return 4   // Decoder
  if (rate >= 0.50) return 5   // Architect
  if (rate >= 0.40) return 6   // Theorist
  if (rate >= 0.30) return 7   // Cryptic Mind
  if (rate >= 0.20) return 8   // Paradox Solver
  if (rate >= 0.10) return 9   // Conundrum Elite
  return 10                    // The Oracle
}
