import { useEffect, useState } from 'react'

interface LoadingViewProps {
  destination: string
}

// Paced against the real backend timeline: the AI generation call alone commonly
// takes 40-55s, and geocoding every activity onto the map (rate-limited by the
// free geocoder) can add another 45-95s on top of that — a full trip regularly
// takes 60-140s. Messages are front-loaded (fast early progress feels responsive)
// and spaced further apart later, ending on a message that's fine to sit on for a
// while rather than cycling back to "scouting spots" and reading as stuck/restarted.
const SCHEDULE = (destination: string) => [
  { at: 0, text: 'Reading your trip preferences...' },
  { at: 3, text: `Asking our AI to plan ${destination}...` },
  { at: 9, text: `Scouting the best spots in ${destination}...` },
  { at: 18, text: 'Balancing your itinerary against your budget...' },
  { at: 27, text: 'Picking hidden gems worth the detour...' },
  { at: 37, text: 'Mapping out each day...' },
  { at: 48, text: 'Placing every stop on the map...' },
  { at: 62, text: 'Double-checking opening hours and travel times...' },
  { at: 78, text: 'Finding real photos for your itinerary...' },
  { at: 95, text: 'Putting the final touches on your trip...' },
  { at: 115, text: 'Almost there — longer trips just take a little extra care.' },
]

export default function LoadingView({ destination }: LoadingViewProps) {
  const schedule = SCHEDULE(destination)
  const [message, setMessage] = useState(schedule[0].text)

  useEffect(() => {
    const startedAt = Date.now()
    const interval = setInterval(() => {
      const elapsed = (Date.now() - startedAt) / 1000
      const current = [...schedule].reverse().find((step) => elapsed >= step.at)
      if (current) setMessage(current.text)
    }, 800)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destination])

  return (
    <div className="loading-view">
      <div className="loading-plane">
        <div className="loading-path" />
        <span className="loading-plane-icon">✈</span>
      </div>

      <div className="loading-skeleton">
        <div className="skeleton-block skeleton-hero" />
        <div className="skeleton-row">
          <div className="skeleton-block skeleton-card" />
          <div className="skeleton-block skeleton-card" />
          <div className="skeleton-block skeleton-card" />
        </div>
      </div>

      <p className="loading-message" key={message}>
        {message}
      </p>
    </div>
  )
}
