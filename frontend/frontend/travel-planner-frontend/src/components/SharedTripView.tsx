import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '../AuthContext'
import { useCurrency } from '../CurrencyContext'
import * as api from '../api'
import type { CommunityComment, CommunityTripDetail } from '../types'
import TripMap from './TripMap'
import SmartImage from './SmartImage'

interface SharedTripViewProps {
  tripId: number
  onBack: () => void
  onRequireAuth: () => void
}

const TYPE_ICONS: Record<string, string> = {
  flight: '✈️',
  hotel: '🏨',
  food: '🍽️',
  restaurant: '🍽️',
  sightseeing: '📍',
  landmark: '📍',
  activity: '🎟️',
  adventure: '🎟️',
  transport: '🚌',
  shopping: '🛍️',
  relax: '🧘',
  spa: '💆',
}

function iconFor(type: string) {
  return TYPE_ICONS[type.toLowerCase()] ?? '📍'
}

function initials(name: string) {
  return name.slice(0, 2).toUpperCase()
}

export default function SharedTripView({ tripId, onBack, onRequireAuth }: SharedTripViewProps) {
  const { token } = useAuth()
  const { formatPrice } = useCurrency()
  const [detail, setDetail] = useState<CommunityTripDetail | null>(null)
  const [comments, setComments] = useState<CommunityComment[]>([])
  const [commentText, setCommentText] = useState('')
  const [activeDayId, setActiveDayId] = useState<string | undefined>()
  const [liked, setLiked] = useState(false)
  const [likeCount, setLikeCount] = useState(0)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    api.getCommunityTrip(token, tripId).then((d) => {
      setDetail(d)
      setLiked(d.likedByMe)
      setLikeCount(d.likeCount)
      setSaved(d.savedByMe)
      setActiveDayId(d.trip.days[0]?.id)
    })
    api.getComments(tripId).then(setComments)
  }, [tripId, token])

  async function toggleLike() {
    if (!token) return onRequireAuth()
    if (liked) {
      setLiked(false)
      setLikeCount((c) => c - 1)
      await api.unlikeTrip(token, tripId)
    } else {
      setLiked(true)
      setLikeCount((c) => c + 1)
      await api.likeTrip(token, tripId)
    }
  }

  async function toggleSave() {
    if (!token) return onRequireAuth()
    if (saved) {
      setSaved(false)
      await api.unbookmarkTrip(token, tripId)
    } else {
      setSaved(true)
      await api.bookmarkTrip(token, tripId)
    }
  }

  async function submitComment(e: FormEvent) {
    e.preventDefault()
    if (!token) return onRequireAuth()
    const body = commentText.trim()
    if (!body) return
    const created = await api.addComment(token, tripId, body)
    setComments((prev) => [...prev, created])
    setCommentText('')
  }

  if (!detail) {
    return <div className="shared-trip-loading">Loading trip…</div>
  }

  const activeDay = detail.trip.days.find((d) => d.id === activeDayId) ?? detail.trip.days[0]

  return (
    <div className="shared-trip-page">
      <button type="button" className="reset-button" onClick={onBack}>
        ← Back to Community
      </button>

      <div className="hero-card">
        <SmartImage className="hero-card-img" src={detail.trip.coverImage} alt={detail.destination} icon="🗺️" />
        <span className="hero-card-badge">
          {detail.daysCount} day{detail.daysCount === 1 ? '' : 's'}
        </span>
        <div className="hero-card-overlay">
          <h1>{detail.name}</h1>
          <p>
            {detail.destination} · by {detail.ownerName}
          </p>
        </div>
      </div>

      <div className="shared-trip-actions">
        <button type="button" className={`social-button ${liked ? 'active' : ''}`} onClick={toggleLike}>
          {liked ? '❤️' : '🤍'} {likeCount}
        </button>
        <span className="social-button-static">💬 {comments.length}</span>
        <button type="button" className={`social-button ${saved ? 'active' : ''}`} onClick={toggleSave}>
          {saved ? '🔖 Saved' : '🔖 Save'}
        </button>
      </div>

      <section className="itinerary">
        <h2>Itinerary</h2>
        <div className="shared-day-tabs">
          {detail.trip.days.map((day) => (
            <button
              key={day.id}
              type="button"
              className={`shared-day-tab ${day.id === activeDay?.id ? 'active' : ''}`}
              onClick={() => setActiveDayId(day.id)}
            >
              {day.label}
            </button>
          ))}
        </div>

        {activeDay && (
          <div className="shared-day-content">
            <div className="day-timeline">
              <div className="day-timeline-head">
                <p className="day-date">{activeDay.date}</p>
                <div className="day-timeline-tags">
                  {activeDay.theme && <span className="theme-badge">{activeDay.theme}</span>}
                  <span className="day-cost-badge">{formatPrice(activeDay.totalCost)}</span>
                </div>
              </div>
              {activeDay.activities.map((activity) => (
                <div key={activity.id} className="activity-card">
                  <div className="activity-icon">{iconFor(activity.type)}</div>
                  <div className="activity-body">
                    <div className="activity-card-top">
                      <h4>{activity.title}</h4>
                      <span className="activity-time">{activity.time}</span>
                    </div>
                    <p className="activity-meta">
                      {activity.location} · {activity.duration}
                      {activity.cost > 0 && ` · ${formatPrice(activity.cost)}`}
                    </p>
                    {activity.notes && <p className="activity-notes">{activity.notes}</p>}
                  </div>
                </div>
              ))}
            </div>

            <TripMap key={activeDay.id} activities={activeDay.activities} />
          </div>
        )}
      </section>

      <section className="comments-section">
        <h2>Comments ({comments.length})</h2>
        <form onSubmit={submitComment} className="comment-form">
          <input
            type="text"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder={token ? 'Add a comment…' : 'Sign in to comment'}
          />
          <button type="submit">Post</button>
        </form>
        <ul className="comment-list">
          {comments.map((c) => (
            <li key={c.id} className="comment-item">
              <span className="comment-avatar">{initials(c.authorName)}</span>
              <div>
                <strong>{c.authorName}</strong>
                <p>{c.body}</p>
              </div>
            </li>
          ))}
          {comments.length === 0 && <li className="comments-empty">Be the first to comment.</li>}
        </ul>
      </section>
    </div>
  )
}
