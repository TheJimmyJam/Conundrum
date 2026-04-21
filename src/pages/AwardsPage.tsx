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
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-10 w-10 border-4 border-indigo-600 border-t-transparent" />
    </div>
  )

  if (error) return (
    <div className="min-h-screen flex items-center justify-center text-red-500">{error}</div>
  )

  const earnedSet = new Set(earned.map((a) => `${a.category}:${a.tier}`))

  // Summary counts
  const totalEarned = earned.length
  const totalPossible = AWARD_CATEGORIES.length * 10

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-6 py-10">

        {/* Header */}
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-1">Awards</h1>
            <p className="text-gray-500 text-sm">Earn awards by hitting milestones across every part of Cnndrm.</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-indigo-600">{totalEarned} <span className="text-gray-300">/</span> {totalPossible}</p>
            <p className="text-xs text-gray-400 mt-0.5">awards earned</p>
          </div>
        </div>

        {/* Overall progress bar */}
        <div className="mb-10 bg-white border border-gray-100 rounded-2xl px-6 py-4">
          <div className="flex justify-between text-xs text-gray-500 mb-2">
            <span>Overall progress</span>
            <span>{Math.round((totalEarned / totalPossible) * 100)}%</span>
          </div>
          <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-700"
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

            // Progress within the current tier window
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
    if (t <= 6) return 'bg-indigo-500'
    if (t <= 9) return 'bg-purple-600'
    return 'bg-gradient-to-br from-yellow-400 to-orange-500'
  }

  return (
    <div className={`bg-white border rounded-2xl overflow-hidden transition-all ${
      isMaxed ? 'border-yellow-300 shadow-sm shadow-yellow-100' : 'border-gray-100'
    }`}>
      <div className="px-5 py-5">
        {/* Top row */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{cat.icon}</span>
            <div>
              <h3 className="font-bold text-gray-900 text-sm">{cat.name}</h3>
              <p className="text-xs text-gray-400 mt-0.5">{cat.description}</p>
            </div>
          </div>
          <div className="text-right flex-shrink-0 ml-2">
            {currentTier > 0 ? (
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full text-white ${
                isMaxed ? 'bg-gradient-to-r from-yellow-400 to-orange-500' :
                currentTier >= 7 ? 'bg-purple-600' :
                currentTier >= 4 ? 'bg-indigo-500' : 'bg-amber-400'
              }`}>
                {isMaxed ? '✦ MAXED' : `Tier ${currentTier}`}
              </span>
            ) : (
              <span className="text-xs text-gray-300 font-medium">Locked</span>
            )}
          </div>
        </div>

        {/* Current tier name */}
        {tierName && (
          <p className="text-xs font-semibold text-indigo-600 mb-3 ml-9">{tierName}</p>
        )}

        {/* Progress bar */}
        <div className="mb-3">
          <div className="flex justify-between text-xs text-gray-500 mb-1.5">
            <span className="font-semibold text-gray-700">{formatValue(cat, value)} {cat.unit}</span>
            {!isMaxed && nextThreshold && (
              <span>Next: {formatValue(cat, nextThreshold)}</span>
            )}
            {isMaxed && <span className="text-yellow-600 font-semibold">All tiers complete!</span>}
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                isMaxed
                  ? 'bg-gradient-to-r from-yellow-400 to-orange-500'
                  : currentTier >= 7 ? 'bg-purple-500'
                  : currentTier >= 4 ? 'bg-indigo-500'
                  : 'bg-amber-400'
              }`}
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
                    ? 'bg-gray-300 ring-2 ring-indigo-300 ring-offset-1'
                    : 'bg-gray-100'
                }`}
              />
            )
          })}
        </div>

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded((e) => !e)}
          className="mt-3 text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
        >
          {expanded ? 'Hide tiers' : 'Show all tiers'}
          <svg className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* Expanded tier list */}
      {expanded && (
        <div className="border-t border-gray-50 px-5 py-3">
          {cat.tiers.map((threshold, i) => {
            const isEarned = earnedSet.has(`${cat.key}:${i + 1}`)
            const isFinal = i === cat.tiers.length - 1
            return (
              <div
                key={i}
                className={`flex items-center gap-3 py-2 border-b border-gray-50 last:border-0 ${
                  isEarned ? '' : 'opacity-40'
                }`}
              >
                <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-xs ${
                  isEarned ? `${tierColor(i)} text-white` : 'bg-gray-100 text-gray-400'
                }`}>
                  {isEarned ? '✓' : i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-semibold ${isEarned ? 'text-gray-900' : 'text-gray-400'} ${isFinal ? 'text-yellow-600' : ''}`}>
                    {cat.tierNames[i]}
                    {isFinal && ' 🏅'}
                  </p>
                </div>
                <span className="text-xs text-gray-400 flex-shrink-0">
                  {formatValue(cat, threshold)} {cat.unit}
                </span>
              </div>
            )
          })}
          {cat.note && (
            <p className="text-xs text-amber-600 mt-2 pt-2 border-t border-gray-50">
              ⚠️ {cat.note}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
