import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { DAY_THEME_OPTIONS, TRIP_TYPE_OPTIONS } from '../types'
import type { TripRequest } from '../types'
import * as api from '../api'
import DestinationsCarousel from './DestinationsCarousel'
import LogoMark from './LogoMark'
import HowItWorks from './HowItWorks'
import Reveal from './Reveal'
import SliderField from './SliderField'
import { SUPPORTED_CURRENCIES, useCurrency } from '../CurrencyContext'

interface TripFormProps {
  onSubmit: (request: TripRequest) => void
  loading: boolean
  presetDestination?: string
}

// The slider's scale is anchored in USD so it means the same real budget for every
// traveler regardless of which currency they're viewing it in — only the displayed
// min/max/value/ticks convert per currency.
const BUDGET_MIN_USD = 200
const BUDGET_MAX_USD = 10000
const DAYS_MIN = 1
const DAYS_MAX = 14
const HERO_IMAGE_CACHE_KEY = 'gonext-hero-image'

export default function TripForm({ onSubmit, loading, presetDestination }: TripFormProps) {
  const { currency, setCurrency, toDisplayAmount, toUsdAmount } = useCurrency()
  const [destination, setDestination] = useState('')
  const [budget, setBudget] = useState(1000)
  const [days, setDays] = useState(3)
  const [tripType, setTripType] = useState<string>(TRIP_TYPE_OPTIONS[0])
  const [travelers, setTravelers] = useState(1)
  const [customizeDays, setCustomizeDays] = useState(false)
  const [dayThemes, setDayThemes] = useState<string[]>(['No preference', 'No preference', 'No preference'])
  // Read any cached hero image synchronously on first render so the page paints with
  // a photo immediately instead of a blank background while the network call is
  // in flight — that wait was the "takes very long to load on refresh" complaint.
  const [heroImage, setHeroImage] = useState<string | null>(() => {
    try {
      const cached = JSON.parse(localStorage.getItem(HERO_IMAGE_CACHE_KEY) ?? 'null')
      return cached?.image ?? null
    } catch {
      return null
    }
  })
  const heroBgRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // React's StrictMode intentionally mounts effects twice in dev to catch exactly
    // this class of bug: without the `cancelled` guard, both fetches (each picking a
    // random destination) land, and the page visibly flips from the first pick to the
    // second right after load. Ignoring a stale in-flight request's result means only
    // one image ever gets applied — no flicker, in dev or production.
    let cancelled = false
    const hadCachedImage = heroImage !== null
    api
      .getHeroImage()
      .then((data) => {
        if (cancelled || !data.image) return
        // Always refresh the cache for next visit, but if we already painted a cached
        // image this load, leave it on screen rather than swapping it mid-session —
        // the rotation happens one page-load later instead of as a visible flip.
        localStorage.setItem(HERO_IMAGE_CACHE_KEY, JSON.stringify({ image: data.image }))
        if (!hadCachedImage) setHeroImage(data.image)
      })
      .catch(() => {
        if (!cancelled && !hadCachedImage) setHeroImage(null)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Subtle Apple-style parallax: the hero background drifts slower than the page
  // scrolls. Reads/writes a CSS var directly (no React state) to keep it smooth.
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let raf = 0
    function onScroll() {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        // Capped so the drift can never outrun the hero background's overscan buffer
        // (index.css `.trip-form-hero-bg` inset) — past that, translateY would pull
        // the image past its own edge and expose a hard gap at the bottom.
        const y = Math.min(window.scrollY * 0.25, 32)
        heroBgRef.current?.style.setProperty('--parallax-y', `${y}px`)
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(raf)
    }
  }, [])

  useEffect(() => {
    if (presetDestination) {
      setDestination(presetDestination)
      document.getElementById('destination')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [presetDestination])

  function handleDaysChange(value: number) {
    const clamped = Math.min(Math.max(value, 1), DAYS_MAX)
    setDays(clamped)
    setDayThemes((prev) => {
      const next = [...prev]
      while (next.length < clamped) next.push('No preference')
      return next.slice(0, clamped)
    })
  }

  const budgetSliderMin = Math.round(toDisplayAmount(BUDGET_MIN_USD))
  const budgetSliderMax = Math.round(toDisplayAmount(BUDGET_MAX_USD))
  const budgetSliderValue = Math.round(toDisplayAmount(budget))
  const budgetSliderStep = Math.max(1, Math.round((budgetSliderMax - budgetSliderMin) / 95))

  function handleThemeChange(index: number, value: string) {
    setDayThemes((prev) => prev.map((t, i) => (i === index ? value : t)))
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!destination.trim() || days < 1 || budget <= 0) return
    const themes = customizeDays ? dayThemes.map((t) => (t === 'No preference' ? '' : t)) : []
    onSubmit({
      destination: destination.trim(),
      days,
      budget,
      dayThemes: themes,
      tripType: tripType || undefined,
      travelers,
    })
  }

  return (
    <div className="trip-form-page">
      <div className="trip-form-hero">
        <div
          className="trip-form-hero-bg"
          ref={heroBgRef}
          style={heroImage ? { backgroundImage: `url(${heroImage})` } : undefined}
        />
        <div className="trip-form-page-overlay">
          <form className="trip-form" onSubmit={handleSubmit}>
            <div className="trip-form-card">
              <div className="trip-form-card-head">
                <h1>Where are we headed?</h1>
                <span className="trip-form-kicker">✈ Plan smarter</span>
              </div>

              <div className="field field-wide">
                <label htmlFor="destination">Destination</label>
                <div className="input-with-icon">
                  <input
                    id="destination"
                    type="text"
                    placeholder="e.g. Tokyo, Japan"
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    required
                  />
                  <span className="input-icon">🔍</span>
                </div>
              </div>

              <div className="trip-form-row">
                <SliderField
                  id="budget"
                  label={`Budget (${currency})`}
                  min={budgetSliderMin}
                  max={budgetSliderMax}
                  step={budgetSliderStep}
                  value={budgetSliderValue}
                  onChange={(v) => setBudget(toUsdAmount(v))}
                />
                <SliderField
                  id="days"
                  label="Days"
                  min={DAYS_MIN}
                  max={DAYS_MAX}
                  step={1}
                  value={days}
                  onChange={handleDaysChange}
                />
              </div>

              <div className="trip-form-row">
                <div className="field">
                  <label htmlFor="trip-type">Trip type</label>
                  <select id="trip-type" value={tripType} onChange={(e) => setTripType(e.target.value)}>
                    {TRIP_TYPE_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="travelers">Travelers</label>
                  <input
                    id="travelers"
                    type="number"
                    min={1}
                    max={20}
                    value={travelers}
                    onChange={(e) => setTravelers(Number(e.target.value))}
                  />
                </div>
              </div>

              <label className="customize-toggle">
                <input
                  type="checkbox"
                  checked={customizeDays}
                  onChange={(e) => setCustomizeDays(e.target.checked)}
                />
                Customize each day's vibe <span className="optional-tag">(optional)</span>
              </label>

              {customizeDays && (
                <div className="day-theme-list">
                  {Array.from({ length: days }).map((_, i) => (
                    <div className="day-theme-row" key={i}>
                      <span>Day {i + 1}</span>
                      <select
                        aria-label={`Theme for day ${i + 1}`}
                        value={dayThemes[i] ?? 'No preference'}
                        onChange={(e) => handleThemeChange(i, e.target.value)}
                      >
                        {DAY_THEME_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              )}

              <button type="submit" disabled={loading || !destination.trim() || budget <= 0 || days < 1}>
                {loading ? 'Planning…' : 'Plan my trip'}
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className="below-fold">
        <Reveal>
          <DestinationsCarousel
            onSelect={(dest) => {
              setDestination(dest)
              document.getElementById('destination')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
            }}
          />
        </Reveal>

        <HowItWorks />
      </div>

      <footer className="plan-footer">
        <span className="plan-footer-logo">
          <LogoMark size={26} showTagline />
        </span>
        <div className="plan-footer-selects">
          <select
            aria-label="Currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="plan-footer-select"
          >
            {SUPPORTED_CURRENCIES.map((code) => (
              <option key={code} value={code}>
                Currency: {code}
              </option>
            ))}
          </select>
        </div>
      </footer>
    </div>
  )
}
