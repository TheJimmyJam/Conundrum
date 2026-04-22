import { useEffect, useState } from 'react'
import { syncPlayerAwards } from '../lib/api'
import {
  AWARD_CATEGORIES,
  getCurrentTier,
  getNextThreshold,
  formatValue,
  type AwardCategoryDef,
  type PlayerStats,
  type EarnedAward,
} from '../lib/awards'

export default function AwardsPage() {
  const [stats, setStats] = useState<PlayerStats | null>(null)
  const [earned, setEarned] = useState<EarnedAward[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    syncPlayerAwards()
      .then((data) => {
        setStats(data.stats as PlayerStats)
        setEarned(data.awards as EarnedAward[])
      })
      .catch((err) => {
        console.error(err)
        setError('Could not load awards.')
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f0f1a]">
      <div className="animate-spin rounded-full h-10 w-10 border-4 border-amber-500 border-t-transparent" />
    </div>
  )

  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f0f1a] text-red-400">{error}</div>
  )

  const earnedSet = new Set(earned.map((a) => `${a.category}:${a.tier}`))

  const totalEarned = earned.length
  const totalPossible = AWARD_CATEGORIES.length * 10

  return (
    <div className="min-h-screen bg-[#0f0f1a]">
      <div className="max-w-4xl mx-auto px-6 py-10">

        {/* Header */}
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h1 className="text-4xl font-bold text-white mb-1">Awards</h1>
            <p className="text-sm text-gray-400 uppercase tracking-wider mt-1">
              Earn awards by hitting milestones across every part of Cnndrm.
            </p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-bold text-amber-400">
              {totalEarned} <span className="text-white/20">/</span> {totalPossible}
            </p>
            <p className="text-xs text-gray-500 uppercase tracking-wider mt-1">Awards Earned</p>
          </div>
        </div>

        {/* Overall progress bar */}
        <div className="mb-10 bg-white/5 border border-white/10 rounded-2xl px-6 py-4">
          <div className="flex justify-between text-xs text-gray-400 uppercase tracking-wider mb-2">
            <span>Overall Progress</span>
            <span>{Math.round((totalEarned / totalPossible) * 100)}%</span>
          </div>
          <div className="h-2.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full transition-all duration-700"
              style={{ width: `${(totalEarned / totalPossible) * 100}%` }}
            />
          </div>
        </div>

        {/* Award category grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {AWARD_CATEGORIES.map((cat) => {
            const value = stats?.[cat.key] ?? 0
            const currentTier = getCurrentTier(cat, value)
            const nextThreshold = getNextThreshold(cat, currentTier)
            const prevThreshold = currentTier > 0 ? cat.tiers[currentTier - 1] : 0
            const isMaxed = currentTier === cat.tiers.length
            const tierName = currentTier > 0 ? cat.tierNames[currentTier - 1] : null

            let pct = 0
            if (isMaxed) {
              pct = 100
            } else if (nextThreshold) {
              pct = Math.min(100, ((value - prevThreshold) / (nextThreshold - prevThreshold)) * 100)
            }

            return (
              <AwardCard
                key={cat.key}
                cat={cat}
                value={value}
                currentTier={currentTier}
                nextThreshold={nextThreshold}
                tierName={tierName}
                pct={pct}
                isMaxed={isMaxed}
                earnedSet={earnedSet}
              />
            )
          })}
        </div>

      </div>
    </div>
  )
}

function AwardCard({
  cat,
  value,
  currentTier,
  nextThreshold,
  tierName,
  pct,
  isMaxed,
  earnedSet,
}: {
  cat: AwardCategoryDef
  value: number
  currentTier: number
  nextThreshold: number | null
  tierName: string | null
  pct: number
  isMaxed: boolean
  earnedSet: Set<string>
}) {
  const [expanded, setExpanded] = useState(false)

  const tierColor = (tierIndex: number) => {
    const t = tierIndex + 1
    if (t <= 3) return 'bg-amber-400'
    if (t <= 6) return 'bg-violet-500'
    if (t <= 9) return 'bg-purple-600'
    return 'bg-gradient-to-br from-yellow-400 to-orange-500'
  }

  const tierTextColor = (tierIndex: number) => {
    const t = tierIndex + 1
    if (t <= 3) return 'text-amber-400'
    if (t <= 6) return 'text-violet-400'
    if (t <= 9) return 'text-purple-400'
    return 'text-yellow-400'
  }

  const barColor = () => {
    if (isMaxed) return 'bg-gradient-to-r from-yellow-400 to-orange-500'
    if (currentTier >= 7) return 'bg-purple-500'
    if (currentTier >= 4) return 'bg-violet-500'
    return 'bg-amber-400'
  }

  return (
    <div className={`bg-white/5 border rounded-2xl overflow-hidden transition-all ${
      isMaxed ? 'border-yellow-500/40 shadow-sm shadow-yellow-500/10' : 'border-white/10'
    }`}>
      <div className="px-5 py-5">
        {/* Top row */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{cat.icon}</span>
            <div>
              <h3 className="font-bold text-white text-base">{cat.name}</h3>
              <p className="text-xs text-gray-500 uppercase tracking-wider mt-0.5">{cat.description}</p>
            </div>
          </div>
          <div className="text-right flex-shrink-0 ml-2">
            {currentTier > 0 ? (
              <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider text-white ${
                isMaxed ? 'bg-gradient-to-r from-yellow-400 to-orange-500' :
                currentTier >= 7 ? 'bg-purple-600' :
                currentTier >= 4 ? 'bg-violet-500' : 'bg-amber-400/90'
              }`}>
                {isMaxed ? '✦ Maxed' : `Tier ${currentTier}`}
              </span>
            ) : (
              <span className="text-xs text-white/25 font-medium uppercase tracking-wider">Locked</span>
            )}
          </div>
        </div>

        {/* Current tier name */}
        {tierName && (
          <p className={`text-xs font-semibold uppercase tracking-wider mb-3 ml-11 ${tierTextColor(currentTier - 1)}`}>
            {tierName}
          </p>
        )}

        {/* Progress bar */}
        <div className="mb-3">
          <div className="flex justify-between text-sm mb-1.5">
            <span className="font-semibold text-gray-200">{formatValue(cat, value)} {cat.unit}</span>
            {!isMaxed && nextThreshold && (
              <span className="text-xs text-gray-500 uppercase tracking-wider self-end">
                Next: {formatValue(cat, nextThreshold)}
              </span>
            )}
            {isMaxed && (
              <span className="text-xs text-yellow-400 font-semibold uppercase tracking-wider self-end">
                All tiers complete!
              </span>
            )}
          </div>
          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${barColor()}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Tier dots */}
        <div className="flex gap-1.5 items-center">
          {cat.tiers.map((_, i) => {
            const isEarned = earnedSet.has(`${cat.key}:${i + 1}`)
            const isNext = i === currentTier
            return (
              <div
                key={i}
                title={`${cat.tierNames[i]}: ${formatValue(cat, cat.tiers[i])} ${cat.unit}`}
                className={`flex-1 h-2 rounded-full transition-all ${
                  isEarned
                    ? tierColor(i)
                    : isNext
                    ? 'bg-white/20 ring-2 ring-amber-400/50 ring-offset-1 ring-offset-[#0f0f1a]'
                    : 'bg-white/8'
                }`}
              />
            )
          })}
        </div>

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded((e) => !e)}
          className="mt-3 text-xs text-gray-500 hover:text-amber-400 flex items-center gap-1 uppercase tracking-wider transition-colors"
        >
          {expanded ? 'Hide tiers' : 'Show all tiers'}
          <svg className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* Expanded tier list */}
      {expanded && (
        <div className="border-t border-white/10 px-5 py-3">
          {cat.tiers.map((threshold, i) => {
            const isEarned = earnedSet.has(`${cat.key}:${i + 1}`)
            const isFinal = i === cat.tiers.length - 1
            return (
              <div
                key={i}
                className={`flex items-center gap-3 py-2 border-b border-white/5 last:border-0 ${
                  isEarned ? '' : 'opacity-40'
                }`}
              >
                <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${
                  isEarned ? `${tierColor(i)} text-white` : 'bg-white/10 text-gray-500'
                }`}>
                  {isEarned ? '✓' : i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold uppercase tracking-wide ${
                    isEarned
                      ? isFinal ? 'text-yellow-400' : 'text-gray-200'
                      : 'text-gray-500'
                  }`}>
                    {cat.tierNames[i]}
                    {isFinal && ' 🏅'}
                  </p>
                </div>
                <span className="text-sm text-gray-500 flex-shrink-0 tabular-nums">
                  {formatValue(cat, threshold)} {cat.unit}
                </span>
              </div>
            )
          })}
          {cat.note && (
            <p className="text-sm text-amber-400/80 mt-2 pt-2 border-t border-white/10 uppercase tracking-wide">
              ⚠️ {cat.note}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
