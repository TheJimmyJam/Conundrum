import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import {
  searchUsers,
  sendFriendRequest,
  respondToFriendRequest,
  removeFriend,
  getFriendships,
  createChallenge,
  getMyChallenges,
  declineChallenge,
} from '../lib/api'

type Tab = 'friends' | 'challenges'

type Friendship = {
  id: string
  status: string
  created_at: string
  requester: { id: string; username: string; display_name: string | null }
  addressee: { id: string; username: string; display_name: string | null }
}

type Challenge = {
  id: string
  status: string
  winner_id: string | null
  created_at: string
  expires_at: string | null
  challenger: { id: string; username: string; display_name: string | null }
  challenged: { id: string; username: string; display_name: string | null }
  challenger_session: { score: number; correct_count: number; duration_ms: number } | null
  challenged_session: { score: number; correct_count: number; duration_ms: number } | null
}

type SearchResult = { id: string; username: string; display_name: string | null }

function displayName(u: { username: string; display_name: string | null }) {
  return u.display_name || u.username
}

function formatMs(ms: number) {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`
}

export default function FriendsPage() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('friends')

  const [friendships, setFriendships] = useState<Friendship[]>([])
  const [challenges, setChallenges] = useState<Challenge[]>([])
  const [loading, setLoading] = useState(true)

  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [pendingRequest, setPendingRequest] = useState<string | null>(null) // userId being requested
  const [challengingId, setChallengingId] = useState<string | null>(null)

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    try {
      const [fs, cs] = await Promise.all([getFriendships(), getMyChallenges()])
      setFriendships(fs)
      setChallenges(cs)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // ── Search ────────────────────────────────────────────────────────────────

  function handleSearchChange(q: string) {
    setSearchQuery(q)
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    if (!q.trim()) { setSearchResults([]); return }
    searchTimeout.current = setTimeout(async () => {
      setSearching(true)
      try {
        const results = await searchUsers(q.trim())
        // Filter out self and already-friends
        const friendIds = new Set(friendships.map((f) => {
          const other = f.requester.id === user?.id ? f.addressee.id : f.requester.id
          return other
        }))
        setSearchResults(results.filter((r) => r.id !== user?.id && !friendIds.has(r.id)))
      } catch { setSearchResults([]) }
      setSearching(false)
    }, 400)
  }

  async function handleSendRequest(toId: string) {
    setPendingRequest(toId)
    try {
      await sendFriendRequest(toId)
      setSearchResults((prev) => prev.filter((r) => r.id !== toId))
      setSearchQuery('')
      await load()
    } catch (err: any) {
      alert(err?.message ?? 'Could not send friend request.')
    } finally {
      setPendingRequest(null)
    }
  }

  // ── Friend actions ────────────────────────────────────────────────────────

  async function handleRespond(friendshipId: string, accept: boolean) {
    try {
      await respondToFriendRequest(friendshipId, accept)
      await load()
    } catch (err: any) {
      alert(err?.message ?? 'Something went wrong.')
    }
  }

  async function handleRemove(friendshipId: string) {
    if (!confirm('Remove this friend?')) return
    try {
      await removeFriend(friendshipId)
      await load()
    } catch (err: any) {
      alert(err?.message ?? 'Something went wrong.')
    }
  }

  // ── Challenge actions ─────────────────────────────────────────────────────

  async function handleChallenge(friendId: string) {
    setChallengingId(friendId)
    try {
      const result = await createChallenge(friendId)
      navigate(`/challenge/${result.challenge_id}/play`, {
        state: { session_id: result.session_id, questions: result.questions },
      })
    } catch (err: any) {
      const msg = err?.message ?? ''
      if (msg.includes('already pending')) {
        alert('You already have a pending challenge with this person today.')
      } else {
        alert('Could not create challenge: ' + msg)
      }
      setChallengingId(null)
    }
  }

  async function handleDeclineChallenge(challengeId: string) {
    try {
      await declineChallenge(challengeId)
      await load()
    } catch (err: any) {
      alert(err?.message ?? 'Something went wrong.')
    }
  }

  async function handleAcceptChallenge(challengeId: string) {
    navigate(`/challenge/${challengeId}/play`)
  }

  // ── Derived lists ─────────────────────────────────────────────────────────

  const pendingIncoming = friendships.filter(
    (f) => f.status === 'pending' && f.addressee.id === user?.id
  )
  const pendingOutgoing = friendships.filter(
    (f) => f.status === 'pending' && f.requester.id === user?.id
  )
  const acceptedFriends = friendships.filter((f) => f.status === 'accepted')

  const pendingChallenges = challenges.filter(
    (c) => c.status === 'pending' && c.challenged.id === user?.id
  )
  const activeChallenges = challenges.filter(
    (c) => c.status === 'awaiting_opponent'
  )
  const completedChallenges = challenges.filter((c) => c.status === 'completed')

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-10 w-10 border-4 border-indigo-600 border-t-transparent" />
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-6 py-10">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Friends</h1>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 mb-8">
          {(['friends', 'challenges'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors capitalize ${
                tab === t
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t}
              {t === 'challenges' && pendingChallenges.length > 0 && (
                <span className="ml-2 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5">
                  {pendingChallenges.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Friends Tab ─────────────────────────────────────────────────── */}
        {tab === 'friends' && (
          <div className="space-y-8">

            {/* Search */}
            <section>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Add a Friend</h2>
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  placeholder="Search by username or email…"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
                />
                {searching && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-indigo-500 border-t-transparent" />
                  </div>
                )}
              </div>

              {searchResults.length > 0 && (
                <div className="mt-2 bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm">
                  {searchResults.map((r) => (
                    <div key={r.id} className="flex items-center justify-between px-4 py-3 border-b border-gray-50 last:border-0">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{displayName(r)}</p>
                        <p className="text-xs text-gray-400">@{r.username}</p>
                      </div>
                      <button
                        onClick={() => handleSendRequest(r.id)}
                        disabled={pendingRequest === r.id}
                        className="text-sm bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                      >
                        {pendingRequest === r.id ? 'Sending…' : 'Add'}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {searchQuery && !searching && searchResults.length === 0 && (
                <p className="mt-2 text-sm text-gray-400 px-1">No users found.</p>
              )}
            </section>

            {/* Pending incoming requests */}
            {pendingIncoming.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Friend Requests</h2>
                <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
                  {pendingIncoming.map((f) => (
                    <div key={f.id} className="flex items-center justify-between px-4 py-3 border-b border-gray-50 last:border-0">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{displayName(f.requester)}</p>
                        <p className="text-xs text-gray-400">@{f.requester.username}</p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleRespond(f.id, true)}
                          className="text-sm bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700"
                        >
                          Accept
                        </button>
                        <button
                          onClick={() => handleRespond(f.id, false)}
                          className="text-sm border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50"
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Pending outgoing requests */}
            {pendingOutgoing.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  Sent Requests
                  <span className="ml-2 text-xs bg-amber-100 text-amber-600 font-semibold px-1.5 py-0.5 rounded-full normal-case">
                    {pendingOutgoing.length} pending
                  </span>
                </h2>
                <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
                  {pendingOutgoing.map((f) => (
                    <div key={f.id} className="flex items-center justify-between px-4 py-3 border-b border-gray-50 last:border-0">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{displayName(f.addressee)}</p>
                        <p className="text-xs text-gray-400">@{f.addressee.username} · waiting for them to accept</p>
                      </div>
                      <button
                        onClick={() => handleRemove(f.id)}
                        className="text-xs border border-gray-200 text-gray-400 px-3 py-1.5 rounded-lg hover:bg-gray-50 hover:text-red-500 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Accepted friends */}
            <section>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                My Friends {acceptedFriends.length > 0 && `(${acceptedFriends.length})`}
              </h2>
              {acceptedFriends.length === 0 ? (
                <div className="bg-white border border-gray-100 rounded-xl px-6 py-10 text-center">
                  <div className="text-4xl mb-3">👋</div>
                  <p className="text-gray-500 text-sm">No friends yet. Search above to add some!</p>
                </div>
              ) : (
                <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
                  {acceptedFriends.map((f) => {
                    const friend = f.requester.id === user?.id ? f.addressee : f.requester
                    return (
                      <div key={f.id} className="flex items-center justify-between px-4 py-3 border-b border-gray-50 last:border-0">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{displayName(friend)}</p>
                          <p className="text-xs text-gray-400">@{friend.username}</p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleChallenge(friend.id)}
                            disabled={challengingId === friend.id}
                            className="text-sm bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                          >
                            {challengingId === friend.id ? 'Starting…' : '⚔️ Challenge'}
                          </button>
                          <button
                            onClick={() => handleRemove(f.id)}
                            className="text-sm border border-gray-200 text-gray-400 px-3 py-1.5 rounded-lg hover:bg-gray-50 hover:text-red-500"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>

          </div>
        )}

        {/* ── Challenges Tab ───────────────────────────────────────────────── */}
        {tab === 'challenges' && (
          <div className="space-y-8">

            {/* Incoming */}
            {pendingChallenges.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Waiting for You</h2>
                <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
                  {pendingChallenges.map((c) => (
                    <div key={c.id} className="flex items-center justify-between px-4 py-4 border-b border-gray-50 last:border-0">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">
                          ⚔️ Challenge from <span className="text-indigo-600">{displayName(c.challenger)}</span>
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">10 questions · Ready to play</p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleAcceptChallenge(c.id)}
                          className="text-sm bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700"
                        >
                          Play
                        </button>
                        <button
                          onClick={() => handleDeclineChallenge(c.id)}
                          className="text-sm border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50"
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Awaiting opponent */}
            {activeChallenges.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Waiting on Them</h2>
                <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
                  {activeChallenges.map((c) => {
                    const iAmChallenger = c.challenger.id === user?.id
                    const opponent = iAmChallenger ? c.challenged : c.challenger
                    return (
                      <div key={c.id} className="flex items-center justify-between px-4 py-4 border-b border-gray-50 last:border-0">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">vs. {displayName(opponent)}</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {iAmChallenger
                              ? `Waiting for ${displayName(opponent)} to play…`
                              : 'You played — waiting for result'}
                          </p>
                        </div>
                        <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full font-medium">Pending</span>
                      </div>
                    )
                  })}
                </div>
              </section>
            )}

            {/* Completed */}
            {completedChallenges.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Completed</h2>
                <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
                  {completedChallenges.map((c) => {
                    const iAmChallenger = c.challenger.id === user?.id
                    const opponent = iAmChallenger ? c.challenged : c.challenger
                    const mySession = iAmChallenger ? c.challenger_session : c.challenged_session
                    const opSession = iAmChallenger ? c.challenged_session : c.challenger_session
                    const won = c.winner_id === user?.id
                    const tied = !c.winner_id
                    return (
                      <div key={c.id} className="px-4 py-4 border-b border-gray-50 last:border-0">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-sm font-semibold text-gray-900">vs. {displayName(opponent)}</p>
                          <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                            tied ? 'bg-gray-100 text-gray-600' :
                            won ? 'bg-green-100 text-green-700' :
                            'bg-red-100 text-red-600'
                          }`}>
                            {tied ? 'Tie' : won ? 'You Won!' : 'They Won'}
                          </span>
                        </div>
                        {mySession && opSession && (
                          <div className="text-xs text-gray-500 flex gap-4">
                            <span>You: {mySession.correct_count}/10 · {formatMs(mySession.duration_ms)}</span>
                            <span>{displayName(opponent)}: {opSession.correct_count}/10 · {formatMs(opSession.duration_ms)}</span>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </section>
            )}

            {pendingChallenges.length === 0 && activeChallenges.length === 0 && completedChallenges.length === 0 && (
              <div className="bg-white border border-gray-100 rounded-xl px-6 py-10 text-center">
                <div className="text-4xl mb-3">⚔️</div>
                <p className="text-gray-500 text-sm">No challenges yet. Go challenge a friend from the Friends tab!</p>
              </div>
            )}

          </div>
        )}

      </div>
    </div>
  )
}
