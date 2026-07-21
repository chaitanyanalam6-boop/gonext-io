import { useEffect, useMemo, useRef, useState } from 'react'
import type { Activity, TripPlanResponse } from '../types'
import TripMap from './TripMap'
import SmartImage from './SmartImage'
import HeroCarousel from './HeroCarousel'
import TripAssistant from './TripAssistant'
import GroupExpenses from './GroupExpenses'
import DestinationToolkit from './DestinationToolkit'
import { reverseGeocode } from '../api'
import { useCurrency } from '../CurrencyContext'
import {
  BedIcon,
  CalendarIcon,
  CompassIcon,
  HomeIcon,
  NotesIcon,
  PinIcon,
  PlaneIcon,
  SparkleIcon,
  StarIcon,
  WalletIcon,
} from './icons'

interface TripWorkspaceProps {
  trip: TripPlanResponse
  tripId: number | null
  notes: string
  onNotesChange: (notes: string) => void
  isLoggedIn: boolean
  isSaved: boolean
  saving: boolean
  onSave: () => void
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

function isLodging(activity: Activity) {
  if (activity.type.toLowerCase() === 'transport') return false
  const haystack = `${activity.type} ${activity.title}`.toLowerCase()
  return haystack.includes('hotel') || haystack.includes('lodging') || haystack.includes('check-in') || haystack.includes('check in')
}

const EXCURSION_KM_THRESHOLD = 15

function isExcursion(activity: Activity) {
  return typeof activity.distanceFromBaseKm === 'number' && activity.distanceFromBaseKm > EXCURSION_KM_THRESHOLD
}

// Gemini sometimes sets a day's `label` to a plain "Day 1" and sometimes to a themed
// title ("Arrival & Riverside Charm") — the day number itself must never depend on
// that, since it's shown either way. Only show `label` as extra text when it's
// actually saying something beyond the day number we're already displaying.
function isPlainDayLabel(label: string, index: number) {
  const normalized = label.trim().toLowerCase()
  return normalized === `day ${index + 1}` || normalized === `day${index + 1}`
}

function addDays(dateStr: string, days: number) {
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return dateStr
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function mapSearchUrl(query: string) {
  return `https://www.google.com/maps/search/${encodeURIComponent(query)}`
}

function directionsUrl(activity: Activity) {
  return `https://www.google.com/maps/dir/?api=1&destination=${activity.lat},${activity.lon}`
}

function hotelSearchUrl(query: string) {
  return `https://www.booking.com/searchresults.html?${new URLSearchParams({ ss: query }).toString()}`
}

type Section = 'overview' | 'explore' | 'notes' | 'places' | string

export default function TripWorkspace({
  trip,
  tripId,
  notes,
  onNotesChange,
  isLoggedIn,
  isSaved,
  saving,
  onSave,
  onRequireAuth,
}: TripWorkspaceProps) {
  const { formatPrice } = useCurrency()
  const [section, setSection] = useState<Section>('overview')
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null)
  const [originCity, setOriginCity] = useState<string | null>(null)
  const activityRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const totalActivities = trip.days.reduce((sum, d) => sum + d.activities.length, 0)
  const budgetUsed = trip.budget > 0 ? Math.min((trip.totalCost / trip.budget) * 100, 100) : 0
  const overBudget = trip.totalCost > trip.budget

  const checkin = trip.days[0]?.date
  const checkout = trip.days.length > 0 ? addDays(trip.days[trip.days.length - 1].date, 1) : undefined

  // Best-effort: no live flight prices without a paid flights API, but we can at least
  // pre-fill "from <your city>" so the Google Flights link lands closer to a useful
  // result. Silently do nothing if geolocation is denied/unavailable.
  useEffect(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        reverseGeocode(pos.coords.latitude, pos.coords.longitude)
          .then(setOriginCity)
          .catch(() => {})
      },
      () => {},
      { timeout: 8000 },
    )
  }, [])

  const flightsQuery = originCity
    ? `Flights from ${originCity} to ${trip.destination}${checkin ? ` on ${checkin}` : ''}`
    : `Flights to ${trip.destination}`
  const flightsUrl = `https://www.google.com/travel/flights?q=${encodeURIComponent(flightsQuery)}`
  const hotelsUrl = hotelSearchUrl(trip.destination) + `&${new URLSearchParams({
    ...(checkin ? { checkin } : {}),
    ...(checkout ? { checkout } : {}),
  }).toString()}`

  const activeDayIndex = trip.days.findIndex((d) => d.id === section)
  const activeDay = activeDayIndex === -1 ? undefined : trip.days[activeDayIndex]

  const mapActivities: Activity[] = useMemo(() => {
    if (activeDay) return activeDay.activities
    return trip.days.flatMap((d) => d.activities)
  }, [activeDay, trip.days])

  // "Rajamahendravaram, Andhra Pradesh, India" -> "Rajamahendravaram" for compact badges.
  const destinationShortName = trip.destination.split(',')[0].trim()

  // Real photos already fetched for the destination + its top highlights — reuse them
  // as hero slides instead of a single static image, capped to keep the cycle short.
  const heroImages = useMemo(() => {
    const all = [trip.coverImage, ...trip.recommendations.map((r) => r.img)].filter(Boolean)
    return Array.from(new Set(all)).slice(0, 4)
  }, [trip.coverImage, trip.recommendations])

  useEffect(() => {
    if (selectedActivityId) {
      activityRefs.current[selectedActivityId]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [selectedActivityId])

  function goToSection(target: Section) {
    setSelectedActivityId(null)
    setSection(target)
  }

  function selectActivity(activity: Activity) {
    setSelectedActivityId((current) => (current === activity.id ? null : activity.id))
  }

  function renderActivityDetail(activity: Activity) {
    return (
      <div className="activity-card-detail">
        {activity.image && (
          <SmartImage className="activity-detail-img" src={activity.image} alt={activity.title} icon="🖼️" />
        )}
        {activity.details && <p className="activity-detail-text">{activity.details}</p>}
        <div className="activity-detail-actions">
          <a href={directionsUrl(activity)} target="_blank" rel="noopener noreferrer" className="booking-button">
            <PinIcon size={16} /> Get directions
          </a>
          {isLodging(activity) && (
            <a
              href={hotelSearchUrl(`${activity.location}, ${trip.destination}`)}
              target="_blank"
              rel="noopener noreferrer"
              className="booking-button"
            >
              <BedIcon size={16} /> Find hotels near here
            </a>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="workspace">
      <aside className="workspace-sidebar">
        <div className="sidebar-trip-name">
          <h2>{trip.name}</h2>
          <p>{trip.destination}</p>
        </div>

        <div className="sidebar-scroll-row">
          <nav className="sidebar-nav">
            <button
              type="button"
              className={`sidebar-nav-item ${section === 'overview' ? 'active' : ''}`}
              onClick={() => goToSection('overview')}
            >
              <HomeIcon /> Overview
            </button>
            <button
              type="button"
              className={`sidebar-nav-item ${section === 'explore' ? 'active' : ''}`}
              onClick={() => goToSection('explore')}
            >
              <CompassIcon /> Explore
            </button>
            <button
              type="button"
              className={`sidebar-nav-item ${section === 'notes' ? 'active' : ''}`}
              onClick={() => goToSection('notes')}
            >
              <NotesIcon /> Notes
            </button>
            <button
              type="button"
              className={`sidebar-nav-item ${section === 'places' ? 'active' : ''}`}
              onClick={() => goToSection('places')}
            >
              <PinIcon /> Places to visit
            </button>
            <button
              type="button"
              className={`sidebar-nav-item ${section === 'expenses' ? 'active' : ''}`}
              onClick={() => goToSection('expenses')}
            >
              <WalletIcon /> Group expenses
            </button>
          </nav>

          <p className="sidebar-section-label">Itinerary</p>
          <nav className="sidebar-nav">
            {trip.days.map((day, i) => (
              <button
                type="button"
                key={day.id}
                className={`sidebar-nav-item sidebar-day-item ${section === day.id ? 'active' : ''}`}
                onClick={() => goToSection(day.id)}
              >
                <span className="sidebar-day-number">Day {i + 1}</span>
                {!isPlainDayLabel(day.label, i) && <span className="sidebar-day-theme">{day.label}</span>}
              </button>
            ))}
          </nav>
        </div>

        <div className="sidebar-footer">
          {isLoggedIn ? (
            <button type="button" className="sidebar-save-button" onClick={onSave} disabled={saving}>
              {saving ? 'Saving…' : isSaved ? '✓ Saved' : 'Save trip'}
            </button>
          ) : (
            <button type="button" className="sidebar-save-button" onClick={onRequireAuth}>
              Sign up to save
            </button>
          )}
        </div>
      </aside>

      <main className="workspace-main">
        {section === 'overview' && (
          <div className="workspace-panel">
            <div className="hero-card">
              <HeroCarousel images={heroImages} alt={trip.destination} />
              <span className="hero-card-badge">
                {trip.days.length} day{trip.days.length === 1 ? '' : 's'}
              </span>
              <div className="hero-card-overlay">
                <h1>{trip.name}</h1>
                <p>{trip.destination}</p>
              </div>
            </div>

            <h2 className="stats-heading">Trip statistics</h2>
            <div className="stats-row">
              <button type="button" className="stat-chip" onClick={() => goToSection(trip.days[0]?.id ?? 'overview')}>
                <div className="stat-chip-top">
                  <span className="stat-chip-value">{trip.days.length}</span>
                  <span className="stat-chip-icon"><CalendarIcon /></span>
                </div>
                <span className="stat-chip-label">Days</span>
              </button>
              <button type="button" className="stat-chip" onClick={() => goToSection('places')}>
                <div className="stat-chip-top">
                  <span className="stat-chip-value">{totalActivities}</span>
                  <span className="stat-chip-icon"><SparkleIcon /></span>
                </div>
                <span className="stat-chip-label">Activities</span>
              </button>
              <button type="button" className="stat-chip" onClick={() => goToSection('explore')}>
                <div className="stat-chip-top">
                  <span className="stat-chip-value">{trip.recommendations.length}</span>
                  <span className="stat-chip-icon"><StarIcon /></span>
                </div>
                <span className="stat-chip-label">Highlights</span>
              </button>
            </div>

            <section className="budget-summary">
              <h2 className="stats-heading">Budget</h2>
              <div className="budget-bar">
                <div
                  className={`budget-bar-fill ${overBudget ? 'over' : ''}`}
                  style={{ width: `${budgetUsed}%` }}
                />
              </div>
              <div className="budget-summary-top">
                <span>
                  <strong>{formatPrice(trip.totalCost)}</strong> estimated of {formatPrice(trip.budget)} budget
                </span>
                {overBudget && <span className="budget-warning">Over budget</span>}
              </div>
            </section>

            <section className="booking-cta">
              <div className="booking-cta-text">
                <h3>Ready to lock it in?</h3>
                <p>
                  Optional — search real flights and hotels for these dates
                  {originCity ? ` from ${originCity}` : ''}.
                </p>
              </div>
              <div className="booking-cta-actions">
                <a href={flightsUrl} target="_blank" rel="noopener noreferrer" className="booking-button">
                  <PlaneIcon size={16} /> Search flights
                </a>
                <a href={hotelsUrl} target="_blank" rel="noopener noreferrer" className="booking-button">
                  <BedIcon size={16} /> Search hotels
                </a>
              </div>
            </section>

            <DestinationToolkit trip={trip} />
          </div>
        )}

        {section === 'explore' && (
          <div className="workspace-panel">
            <h2>Highlights</h2>
            <div className="recommendations-grid">
              {trip.recommendations.map((rec) => (
                <a
                  className="recommendation-card"
                  key={rec.name}
                  href={mapSearchUrl(`${rec.name}, ${trip.destination}`)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <SmartImage className="recommendation-card-img" src={rec.img} alt={rec.name} icon="📍" />
                  <div className="recommendation-card-body">
                    <h3>{rec.name}</h3>
                    <p>{rec.stat}</p>
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}

        {section === 'notes' && (
          <div className="workspace-panel">
            <h2>Notes</h2>
            <textarea
              className="notes-textarea"
              placeholder="Write or paste anything here: how to get around, tips and tricks…"
              value={notes}
              onChange={(e) => onNotesChange(e.target.value)}
            />
          </div>
        )}

        {section === 'places' && (
          <div className="workspace-panel">
            <h2>Places to visit</h2>
            {trip.days.map((day, i) => (
              <div key={day.id} className="places-day-group">
                <p className="places-day-label">
                  Day {i + 1}
                  {!isPlainDayLabel(day.label, i) && ` — ${day.label}`}
                </p>
                {day.activities.map((activity) => (
                  <div
                    key={activity.id}
                    ref={(el) => {
                      activityRefs.current[activity.id] = el
                    }}
                    className={`place-row-wrap ${selectedActivityId === activity.id ? 'active' : ''}`}
                  >
                    <button type="button" className="place-row" onClick={() => selectActivity(activity)}>
                      <span className="activity-icon">{iconFor(activity.type)}</span>
                      <div>
                        <h4>{activity.title}</h4>
                        <p className="activity-meta">{activity.location}</p>
                        {isExcursion(activity) && (
                          <span className="excursion-badge">
                            🚗 {Math.round(activity.distanceFromBaseKm!)} km from {destinationShortName}
                          </span>
                        )}
                      </div>
                    </button>
                    {selectedActivityId === activity.id && renderActivityDetail(activity)}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {section === 'expenses' && <GroupExpenses tripId={tripId} />}

        {activeDay && (
          <div className="workspace-panel">
            <div className="day-timeline-head">
              <div>
                <h2 className="day-number-heading">Day {activeDayIndex + 1}</h2>
                <p className="day-date">{activeDay.date}</p>
              </div>
              <div className="day-timeline-tags">
                {activeDay.theme && <span className="theme-badge">{activeDay.theme}</span>}
                <span className="day-cost-badge">{formatPrice(activeDay.totalCost)}</span>
              </div>
            </div>
            <div className="day-timeline">
              {activeDay.activities.map((activity) => (
                <div
                  key={activity.id}
                  ref={(el) => {
                    activityRefs.current[activity.id] = el
                  }}
                  className={`activity-card ${selectedActivityId === activity.id ? 'active' : ''}`}
                >
                  <button type="button" className="activity-card-summary" onClick={() => selectActivity(activity)}>
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
                      {isExcursion(activity) && (
                        <span className="excursion-badge">
                          🚗 {Math.round(activity.distanceFromBaseKm!)} km from {destinationShortName}
                        </span>
                      )}
                      {activity.notes && <p className="activity-notes">{activity.notes}</p>}
                    </div>
                  </button>
                  {selectedActivityId === activity.id && renderActivityDetail(activity)}
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      <div className="workspace-map-pane">
        <TripMap key={section} activities={mapActivities} selectedActivityId={selectedActivityId} />
      </div>

      <TripAssistant trip={trip} />
    </div>
  )
}
