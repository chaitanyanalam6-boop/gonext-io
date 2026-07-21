import { useEffect, useState } from 'react'
import { useAuth } from '../AuthContext'
import * as api from '../api'
import type { CommunityTripCard, Contributor, TrendingDestination } from '../types'
import SmartImage from './SmartImage'

interface CommunityProps {
  onOpenTrip: (id: number) => void
  onNewTrip: () => void
  onRequireAuth: () => void
}

function initials(name: string) {
  return name.slice(0, 2).toUpperCase()
}

function TripCard({
  card,
  onOpen,
  onToggleLike,
  onToggleSave,
}: {
  card: CommunityTripCard
  onOpen: () => void
  onToggleLike: () => void
  onToggleSave: () => void
}) {
  return (
    <div className="feed-card">
      <div className="feed-card-head">
        <span className="comment-avatar">{initials(card.ownerName)}</span>
        <div>
          <strong>{card.ownerName}</strong>
          <p>Shared a trip</p>
        </div>
      </div>

      <button type="button" className="feed-card-title" onClick={onOpen}>
        {card.name}
      </button>

      <div className="feed-card-images">
        {card.images.slice(0, 3).map((img, i) => (
          <SmartImage key={i} className="feed-card-img" src={img} alt={card.destination} icon="🌍" />
        ))}
      </div>

      <div className="feed-card-actions">
        <button type="button" className={`social-button ${card.likedByMe ? 'active' : ''}`} onClick={onToggleLike}>
          {card.likedByMe ? '❤️' : '🤍'} Like {card.likeCount > 0 && card.likeCount}
        </button>
        <button type="button" className="social-button" onClick={onOpen}>
          💬 Comment {card.commentCount > 0 && card.commentCount}
        </button>
        <button type="button" className={`social-button ${card.savedByMe ? 'active' : ''}`} onClick={onToggleSave}>
          🔖 {card.savedByMe ? 'Saved' : 'Save'}
        </button>
      </div>
    </div>
  )
}

export default function Community({ onOpenTrip, onNewTrip, onRequireAuth }: CommunityProps) {
  const { token } = useAuth()
  const [feed, setFeed] = useState<CommunityTripCard[] | null>(null)
  const [trending, setTrending] = useState<TrendingDestination[]>([])
  const [contributors, setContributors] = useState<Contributor[]>([])

  useEffect(() => {
    api.getCommunityFeed(token).then(setFeed).catch(() => setFeed([]))
    api.getTrendingDestinations().then(setTrending).catch(() => setTrending([]))
    api.getTopContributors().then(setContributors).catch(() => setContributors([]))
  }, [token])

  async function toggleLike(card: CommunityTripCard) {
    if (!token) return onRequireAuth()
    setFeed((prev) =>
      prev?.map((c) =>
        c.id === card.id
          ? { ...c, likedByMe: !c.likedByMe, likeCount: c.likeCount + (c.likedByMe ? -1 : 1) }
          : c,
      ) ?? prev,
    )
    if (card.likedByMe) await api.unlikeTrip(token, card.id)
    else await api.likeTrip(token, card.id)
  }

  async function toggleSave(card: CommunityTripCard) {
    if (!token) return onRequireAuth()
    setFeed((prev) => prev?.map((c) => (c.id === card.id ? { ...c, savedByMe: !c.savedByMe } : c)) ?? prev)
    if (card.savedByMe) await api.unbookmarkTrip(token, card.id)
    else await api.bookmarkTrip(token, card.id)
  }

  return (
    <div className="community-page">
      <div className="community-feed-col">
        <div className="community-feed-head">
          <h1>Live Trip Feed</h1>
          <button type="button" className="header-cta" onClick={onNewTrip}>
            + Plan a trip
          </button>
        </div>

        {feed && feed.length === 0 && (
          <p className="my-trips-empty">
            No shared trips yet. Plan one, then toggle "Share to Community" to be the first.
          </p>
        )}

        <div className="feed-grid">
          {feed?.map((card) => (
            <TripCard
              key={card.id}
              card={card}
              onOpen={() => onOpenTrip(card.id)}
              onToggleLike={() => toggleLike(card)}
              onToggleSave={() => toggleSave(card)}
            />
          ))}
        </div>
      </div>

      <aside className="community-sidebar">
        <section className="sidebar-block">
          <h2>Trending Destinations</h2>
          {trending.length === 0 && <p className="my-trips-empty">Nothing trending yet.</p>}
          <div className="trending-grid">
            {trending.map((t) => (
              <div className="trending-card" key={t.destination}>
                <SmartImage className="trending-card-img" src={t.image} alt={t.destination} icon="🌍" />
                <div className="trending-card-body">
                  <strong>{t.destination}</strong>
                  <span>
                    {t.tripCount} trip{t.tripCount === 1 ? '' : 's'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="sidebar-block">
          <h2>Top Contributors</h2>
          {contributors.length === 0 && <p className="my-trips-empty">No contributors yet.</p>}
          <ul className="contributors-list">
            {contributors.map((c) => (
              <li key={c.name} className="contributor-row">
                <span className="comment-avatar">{initials(c.name)}</span>
                <div>
                  <strong>{c.name}</strong>
                  <p>
                    {c.tripCount} trip{c.tripCount === 1 ? '' : 's'} shared
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </aside>
    </div>
  )
}
