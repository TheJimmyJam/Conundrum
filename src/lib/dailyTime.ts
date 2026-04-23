/**
 * Daily reset is 6:00 AM Eastern Time.
 * Before 6 AM ET: the active set is still yesterday's.
 * At/after 6 AM ET: the active set flips to today's.
 */

function getETParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date)

  return {
    year:   parseInt(parts.find(p => p.type === 'year')!.value),
    month:  parseInt(parts.find(p => p.type === 'month')!.value),  // 1-indexed
    day:    parseInt(parts.find(p => p.type === 'day')!.value),
    hour:   parseInt(parts.find(p => p.type === 'hour')!.value),
    minute: parseInt(parts.find(p => p.type === 'minute')!.value),
    second: parseInt(parts.find(p => p.type === 'second')!.value),
  }
}

/** Returns the set_date string (YYYY-MM-DD) for the currently active daily set. */
export function getActiveDailyDate(now = new Date()): string {
  const { year, month, day, hour } = getETParts(now)

  // Before 6 AM ET: still on the previous day's set
  if (hour < 6) {
    // Subtract one day
    const d = new Date(year, month - 1, day)
    d.setDate(d.getDate() - 1)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${dd}`
  }

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Milliseconds until the next 6:00 AM ET reset. */
export function msUntilNextReset(now = new Date()): number {
  const { hour, minute, second } = getETParts(now)
  const elapsed = hour * 3600 + minute * 60 + second  // seconds since midnight ET
  const target  = 6 * 3600                            // 6:00:00 AM

  const remaining = elapsed < target
    ? target - elapsed                     // before 6 AM today
    : 24 * 3600 - elapsed + target         // after 6 AM — next reset tomorrow

  return remaining * 1000
}

/** Human-readable countdown string: "HH:MM:SS" */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
