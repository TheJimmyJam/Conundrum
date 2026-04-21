// Mirrors the server-side scoring logic for client-side display only.
// The Edge Function (finalize-session) is the source of truth.

export const BASE_POINTS = 100
export const MAX_SPEED_BONUS = 50
export const SPEED_WINDOW_MS = 15000
export const STREAK_BONUS = 10
export const STREAK_THRESHOLD = 3

export function calcSpeedBonus(responseTimeMs: number): number {
  return Math.max(0, Math.round(MAX_SPEED_BONUS * (1 - responseTimeMs / SPEED_WINDOW_MS)))
}

export function calcPoints(isCorrect: boolean, responseTimeMs: number, streakCount: number): number {
  if (!isCorrect) return 0
  const base = BASE_POINTS
  const speed = calcSpeedBonus(responseTimeMs)
  const streak = streakCount >= STREAK_THRESHOLD ? STREAK_BONUS : 0
  return base + speed + streak
}

export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const secs = seconds % 60
  if (minutes > 0) return `${minutes}m ${secs}s`
  return `${secs}s`
}
