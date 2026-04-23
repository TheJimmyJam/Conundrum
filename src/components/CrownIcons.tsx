/** Gold crown — Global #1 */
export function GlobalCrown({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Base band */}
      <rect x="4" y="22" width="32" height="7" rx="2" fill="#F59E0B" />
      {/* Crown prongs */}
      <polygon points="4,22 4,6 11,15 20,2 29,15 36,6 36,22" fill="#FBBF24" />
      {/* Jewel accents */}
      <circle cx="20" cy="25.5" r="2.5" fill="#FDE68A" />
      <circle cx="11" cy="25.5" r="1.8" fill="#FDE68A" />
      <circle cx="29" cy="25.5" r="1.8" fill="#FDE68A" />
      {/* Shine */}
      <polygon points="4,22 4,6 11,15 20,2 29,15 36,6 36,22" fill="url(#globalShine)" />
      <defs>
        <linearGradient id="globalShine" x1="20" y1="2" x2="20" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="white" stopOpacity="0.3" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  )
}

/** Indigo/purple crown — Friends #1 */
export function FriendsCrown({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Base band */}
      <rect x="4" y="22" width="32" height="7" rx="2" fill="#6D28D9" />
      {/* Crown body — rounded top prongs (friends vibe) */}
      <path
        d="M4 22 L4 10 Q4 6 7 8 L12 12 Q16 4 20 4 Q24 4 28 12 L33 8 Q36 6 36 10 L36 22 Z"
        fill="#7C3AED"
      />
      {/* Jewels */}
      <circle cx="20" cy="25.5" r="2.5" fill="#C4B5FD" />
      <circle cx="11" cy="25.5" r="1.8" fill="#C4B5FD" />
      <circle cx="29" cy="25.5" r="1.8" fill="#C4B5FD" />
      {/* Star gem at top center */}
      <circle cx="20" cy="7" r="3" fill="#A78BFA" />
      <circle cx="20" cy="7" r="1.5" fill="#EDE9FE" />
      {/* Shine */}
      <path
        d="M4 22 L4 10 Q4 6 7 8 L12 12 Q16 4 20 4 Q24 4 28 12 L33 8 Q36 6 36 10 L36 22 Z"
        fill="url(#friendsShine)"
      />
      <defs>
        <linearGradient id="friendsShine" x1="20" y1="4" x2="20" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="white" stopOpacity="0.25" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  )
}

/** Inline small crown badges for leaderboard rows */
export function GlobalCrownBadge() {
  return (
    <span title="Global #1" className="inline-flex items-center gap-1 text-xs font-bold bg-yellow-50 text-yellow-600 border border-yellow-200 px-1.5 py-0.5 rounded-full">
      <GlobalCrown size={12} /> #1
    </span>
  )
}

export function FriendsCrownBadge() {
  return (
    <span title="Friends #1" className="inline-flex items-center gap-1 text-xs font-bold bg-violet-50 text-violet-600 border border-violet-200 px-1.5 py-0.5 rounded-full">
      <FriendsCrown size={12} /> #1
    </span>
  )
}
