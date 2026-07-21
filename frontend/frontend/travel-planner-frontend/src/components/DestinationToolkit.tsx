import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import * as api from '../api'
import type { TripPlanResponse, WeatherResponse } from '../types'
import VoiceTranslator from './VoiceTranslator'

interface DestinationToolkitProps {
  trip: TripPlanResponse
}

// QR codes get exponentially denser (more modules) as the encoded text grows, and
// past a certain density a screen-rendered code becomes unreliable for a phone
// camera to focus on and decode — worse, long enough text makes the qrcode library
// throw outright ("data too big"). Keep the encoded text compact (titles only, no
// times) and cap it at a safe length, truncating whole days rather than cutting off
// mid-line, with a note so it's clear the QR isn't the full itinerary.
const QR_TEXT_BUDGET = 1800

function buildItinerarySummary(trip: TripPlanResponse): string {
  let text = `${trip.name}\n${trip.destination}\n\n`
  let includedDays = 0
  for (const day of trip.days) {
    const line = `${day.label}: ${day.activities.map((a) => a.title).join(' · ')}\n`
    if (text.length + line.length > QR_TEXT_BUDGET && includedDays > 0) break
    text += line
    includedDays++
  }
  if (includedDays < trip.days.length) {
    text += `\n…+${trip.days.length - includedDays} more day(s) — open the app for the full itinerary.`
  }
  return text
}

function weekday(dateStr: string) {
  const d = new Date(dateStr)
  return Number.isNaN(d.getTime()) ? dateStr : d.toLocaleDateString('en-US', { weekday: 'short' })
}

export default function DestinationToolkit({ trip }: DestinationToolkitProps) {
  const [weather, setWeather] = useState<WeatherResponse | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [showQr, setShowQr] = useState(false)

  useEffect(() => {
    if (trip.destinationLat == null || trip.destinationLon == null) return
    api
      .getWeather(trip.destinationLat, trip.destinationLon)
      .then(setWeather)
      .catch(() => setWeather({ available: false }))
  }, [trip.destinationLat, trip.destinationLon])

  async function handleExportQr() {
    if (qrDataUrl) {
      setShowQr((v) => !v)
      return
    }
    try {
      // `scale` (pixels per module) instead of a fixed `width` — forcing a fixed
      // pixel width means the library resizes/interpolates the code to fit, and
      // that blur is exactly what breaks camera decoding for denser codes. `scale`
      // renders every module crisply at a fixed size instead, so longer itineraries
      // just produce a physically bigger (still crisp) image, never a blurrier one.
      const url = await QRCode.toDataURL(buildItinerarySummary(trip), {
        scale: 6,
        margin: 2,
        errorCorrectionLevel: 'L',
      })
      setQrDataUrl(url)
      setShowQr(true)
    } catch {
      // Generation failed silently — the button just won't reveal a code.
    }
  }

  if (!trip.toolkit && trip.destinationLat == null) return null

  return (
    <section className="toolkit-section">
      <h2 className="stats-heading">Destination toolkit &amp; insights</h2>

      {trip.toolkit?.advisory && (
        <div className="toolkit-advisory">
          <span className="toolkit-advisory-icon">💡</span>
          <p>{trip.toolkit.advisory}</p>
        </div>
      )}

      <div className="toolkit-grid">
        <div className="toolkit-card">
          <h3>Live forecast</h3>
          {weather === null && <p className="toolkit-empty">Loading…</p>}
          {weather && !weather.available && <p className="toolkit-empty">Forecast unavailable right now.</p>}
          {weather?.available && (
            <>
              <div className="toolkit-weather-now">
                <span className="toolkit-weather-icon">{weather.currentIcon}</span>
                <span className="toolkit-weather-temp">{Math.round(weather.currentTempC ?? 0)}°C</span>
                <span className="toolkit-weather-label">{weather.currentLabel}</span>
              </div>
              <div className="toolkit-weather-days">
                {weather.daily?.slice(0, 4).map((d) => (
                  <div key={d.date} className="toolkit-weather-day">
                    <span>{weekday(d.date)}</span>
                    <span>{d.icon}</span>
                    <span>
                      {d.high != null ? Math.round(d.high) : '–'}° / {d.low != null ? Math.round(d.low) : '–'}°
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="toolkit-card">
          <h3>Export itinerary</h3>
          <p className="toolkit-card-hint">Scan to get a text copy of this itinerary on your phone.</p>
          <button type="button" className="toolkit-qr-btn" onClick={handleExportQr}>
            {showQr ? 'Hide QR code' : 'Show QR code'}
          </button>
          {showQr && qrDataUrl && <img className="toolkit-qr-img" src={qrDataUrl} alt="QR code for this itinerary" />}
        </div>

        <VoiceTranslator />

        {trip.toolkit && (
          <>
            <div className="toolkit-card">
              <h3>Local payments</h3>
              <p className="toolkit-card-text">{trip.toolkit.localPayments}</p>
            </div>

            <div className="toolkit-card">
              <h3>Survival apps</h3>
              <div className="toolkit-app-chips">
                {trip.toolkit.survivalApps.map((app) => (
                  <span key={app} className="toolkit-app-chip">
                    {app}
                  </span>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
