import { useEffect, useState } from 'react'
import { useAuth } from '../AuthContext'
import { useCurrency } from '../CurrencyContext'
import * as api from '../api'
import type { TripSummary } from '../types'
import SmartImage from './SmartImage'
import Tilt from './Tilt'
import { TrashIcon } from './icons'

interface MyTripsProps {
  onOpenTrip: (id: number) => void
  onNewTrip: () => void
}

export default function MyTrips({ onOpenTrip, onNewTrip }: MyTripsProps) {
  const { token } = useAuth()
  const { formatPrice } = useCurrency()
  const [trips, setTrips] = useState<TripSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  useEffect(() => {
    if (!token) return
    api
      .listTrips(token)
      .then(setTrips)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load trips.'))
  }, [token])

  async function handleDelete(trip: TripSummary) {
    if (!token) return
    if (!window.confirm(`Remove "${trip.name}" from your saved trips?`)) return
    setDeletingId(trip.id)
    try {
      await api.deleteTrip(token, trip.id)
      setTrips((prev) => prev?.filter((t) => t.id !== trip.id) ?? prev)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove trip.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="my-trips-page">
      <div className="my-trips-header">
        <h1>My trips</h1>
        <button type="button" className="header-cta" onClick={onNewTrip}>
          + Plan a new trip
        </button>
      </div>

      {error && <p className="error-banner">{error}</p>}

      {trips && trips.length === 0 && (
        <p className="my-trips-empty">No saved trips yet — plan one and hit "Save trip".</p>
      )}

      <div className="my-trips-grid">
        {trips?.map((trip) => (
          <Tilt key={trip.id} className="my-trip-card-wrap">
            <button type="button" className="my-trip-card" onClick={() => onOpenTrip(trip.id)}>
              <SmartImage className="my-trip-card-img" src={trip.coverImage} alt={trip.destination} icon="🗺️" />
              <div className="my-trip-card-body">
                <h3>{trip.name}</h3>
                <p>
                  {trip.destination} · {trip.daysCount} day{trip.daysCount === 1 ? '' : 's'}
                </p>
                <p className="my-trip-card-cost">
                  {formatPrice(trip.totalCost)} of {formatPrice(trip.budget)}
                </p>
              </div>
            </button>
            <button
              type="button"
              className="my-trip-card-delete"
              aria-label={`Remove ${trip.name}`}
              disabled={deletingId === trip.id}
              onClick={() => handleDelete(trip)}
            >
              <TrashIcon size={16} />
            </button>
          </Tilt>
        ))}
      </div>
    </div>
  )
}
