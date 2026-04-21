export type AwardCategory =
  | 'daily_streak'
  | 'perfect_rounds'
  | 'fast_correct'
  | 'hot_hand_count'
  | 'endless_correct'
  | 'challenges_won'
  | 'friends_count'
  | 'total_points'
  | 'leaderboard_wins'
  | 'featured_questions'

export interface AwardCategoryDef {
  key: AwardCategory
  name: string
  description: string
  icon: string
  note?: string
  unit: string
  tiers: number[]
  tierNames: string[]
  format?: (v: number) => string
}

export const AWARD_CATEGORIES: AwardCategoryDef[] = [
  {
    key: 'daily_streak',
    name: 'Daily Devotion',
    description: 'Consecutive days playing the daily quiz',
    icon: '🔥',
    note: 'Resets if you miss a day',
    unit: 'days',
    tiers: [1, 3, 7, 14, 21, 30, 60, 90, 180, 365],
    tierNames: [
      'Newcomer', 'Regular', 'Weekly', 'Fortnight',
      'Three Weeks', 'Monthly', 'Two Months', 'Quarter',
      'Half Year', 'Annual',
    ],
  },
  {
    key: 'perfect_rounds',
    name: 'Perfectionist',
    description: 'Total 10/10 daily rounds completed',
    icon: '💯',
    unit: 'perfect rounds',
    tiers: [1, 3, 5, 10, 20, 35, 50, 75, 100, 250],
    tierNames: [
      'Sharp Shooter', 'Hat Trick', 'Perfect Five', 'Perfect Ten',
      'Double Ten', 'Thirty-Five', 'Half Century', 'Seventy-Five',
      'Century', 'Flawless',
    ],
  },
  {
    key: 'fast_correct',
    name: 'Speed Demon',
    description: 'Questions answered correctly in under 5 seconds',
    icon: '⚡',
    unit: 'fast correct',
    tiers: [5, 15, 30, 50, 75, 100, 200, 350, 500, 1000],
    tierNames: [
      'Quick Draw', 'Fast Fingers', 'Speedy', 'Swift',
      'Lightning', 'Flash', 'Quicksilver', 'Turbo',
      'Supersonic', 'Warp Speed',
    ],
  },
  {
    key: 'hot_hand_count',
    name: 'Hot Hand',
    description: 'Daily rounds where you hit a 5+ answer streak',
    icon: '🏀',
    unit: 'hot rounds',
    tiers: [1, 3, 5, 10, 15, 20, 30, 50, 75, 100],
    tierNames: [
      'Warm Up', 'On Fire', 'Streak', 'Hot Hand',
      'Flame', 'Blaze', 'Inferno', 'Firestorm',
      'Pyro', 'Volcano',
    ],
  },
  {
    key: 'endless_correct',
    name: 'Endless Warrior',
    description: 'Total correct answers across all endless sessions',
    icon: '⚔️',
    unit: 'correct answers',
    tiers: [10, 25, 50, 100, 200, 350, 500, 750, 1000, 2500],
    tierNames: [
      'Initiate', 'Scout', 'Soldier', 'Veteran',
      'Elite', 'Champion', 'Warrior', 'Hero',
      'Legend', 'Immortal',
    ],
  },
  {
    key: 'challenges_won',
    name: 'Dominator',
    description: 'Total friend challenges won',
    icon: '👑',
    unit: 'wins',
    tiers: [1, 3, 5, 10, 15, 25, 40, 60, 80, 100],
    tierNames: [
      'Challenger', 'Rival', 'Competitor', 'Victor',
      'Dominator', 'Conqueror', 'Ruler', 'Tyrant',
      'Overlord', 'Supreme',
    ],
  },
  {
    key: 'friends_count',
    name: 'Social Butterfly',
    description: 'Total accepted friends',
    icon: '🦋',
    unit: 'friends',
    tiers: [1, 2, 3, 5, 7, 10, 15, 20, 30, 50],
    tierNames: [
      'Acquaintance', 'Friendly', 'Social', 'Connected',
      'Popular', 'Networked', 'Influencer', 'Hub',
      'Connector', 'Butterfly',
    ],
  },
  {
    key: 'total_points',
    name: 'Point Hoarder',
    description: 'Total lifetime points accumulated across all modes',
    icon: '💎',
    unit: 'pts',
    tiers: [1000, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 750000, 1000000],
    tierNames: [
      'Penny', 'Collector', 'Accumulator', 'Saver',
      'Hoarder', 'Treasurer', 'Banker', 'Vault',
      'Fort Knox', 'Millionaire',
    ],
    format: (v) => v >= 1000 ? `${(v / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}K` : v.toString(),
  },
  {
    key: 'leaderboard_wins',
    name: 'Leaderboard Climber',
    description: 'Times finishing #1 on the daily global leaderboard',
    icon: '🏆',
    unit: 'wins',
    tiers: [1, 2, 3, 5, 7, 10, 15, 20, 30, 50],
    tierNames: [
      'On the Board', 'Rising', 'Contender', 'Podium',
      'Bronze Era', 'Silver Era', 'Gold Era', 'Champion',
      'Elite', 'Untouchable',
    ],
  },
  {
    key: 'featured_questions',
    name: 'Community Voice',
    description: 'Submitted questions selected and featured by the team',
    icon: '📢',
    unit: 'featured',
    tiers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    tierNames: [
      'First Draft', 'Contributor', 'Storyteller', 'Creator',
      'Curator', 'Editor', 'Voice', 'Columnist',
      'Author', 'Legend',
    ],
  },
]

export type PlayerStats = Record<AwardCategory, number>

export interface EarnedAward {
  category: AwardCategory
  tier: number
  earned_at: string
}

export function getCurrentTier(category: AwardCategoryDef, value: number): number {
  let tier = 0
  for (let i = 0; i < category.tiers.length; i++) {
    if (value >= category.tiers[i]) tier = i + 1
  }
  return tier
}

export function getNextThreshold(category: AwardCategoryDef, currentTier: number): number | null {
  if (currentTier >= category.tiers.length) return null
  return category.tiers[currentTier]
}

export function formatValue(category: AwardCategoryDef, value: number): string {
  return category.format ? category.format(value) : value.toLocaleString()
}
