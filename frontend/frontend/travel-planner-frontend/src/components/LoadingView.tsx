import { useEffect, useState } from 'react'

interface LoadingViewProps {
  destination: string
}

const MESSAGES = (destination: string) => [
  `Scouting the best spots in ${destination}...`,
  'Balancing your itinerary against your budget...',
  'Mapping out each day...',
  'Picking hidden gems worth the detour...',
  'Double-checking opening hours and travel times...',
  'Putting the final touches on your trip...',
]

export default function LoadingView({ destination }: LoadingViewProps) {
  const messages = MESSAGES(destination)
  const [step, setStep] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setStep((s) => (s + 1) % messages.length)
    }, 2200)
    return () => clearInterval(interval)
  }, [messages.length])

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

      <p className="loading-message" key={step}>
        {messages[step]}
      </p>
    </div>
  )
}
