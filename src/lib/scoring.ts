// Mirrors the server-side scoring logic for client-side display only.
// The Edge Function (submit-endless-answer) is the source of truth.

export const BASE_POINTS = 100
export const MAX_SPEED_BONUS = 100
export const SPEED_WINDOW_MS = 30000
export const STREAK_BONUS = 10
export const STREAK_THRESHOLD = 3

// Difficulty-weighted penalties for wrong answers / timeouts
export const WRONG_PENALTY: Record<string, number> = {
  easy:   -350,
  medium: -275,
  hard:   -200,
}

export function calcSpeedBonus(responseTimeMs: number): number {
  return Math.max(0, Math.round(MAX_SPEED_BONUS * (1 - responseTimeMs / SPEED_WINDOW_MS)))
}

export function calcPoints(
  isCorrect: boolean,
  responseTimeMs: number,
  streakCount: number,
  difficulty = 'medium',
): number {
  if (isCorrect) {
    const speed = calcSpeedBonus(responseTimeMs)
    const streak = streakCount >= STREAK_THRESHOLD ? STREAK_BONUS : 0
    return BASE_POINTS + speed + streak
  }
  return WRONG_PENALTY[difficulty] ?? -275
}

export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const secs = seconds % 60
  if (minutes > 0) return `${minutes}m ${secs}s`
  return `${secs}s`
}
