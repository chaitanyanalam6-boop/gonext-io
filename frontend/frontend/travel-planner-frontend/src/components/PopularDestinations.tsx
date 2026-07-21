import { useEffect, useState } from 'react'
import * as api from '../api'
import type { InspirationResponse } from '../api'
import SmartImage from './SmartImage'
import Tilt from './Tilt'

interface PopularDestinationsProps {
  onSelect: (destination: string) => void
}

export default function PopularDestinations({ onSelect }: PopularDestinationsProps) {
  const [data, setData] = useState<InspirationResponse | null>(null)

  useEffect(() => {
    api.getInspiration().then(setData).catch(() => setData(null))
  }, [])

  if (!data || data.destinations.length === 0) return null

  return (
    <section className="popular-destinations">
      <h2>Popular {data.season} destinations</h2>
      <p className="popular-destinations-subtitle">Tap one to start planning</p>
      <div className="popular-destinations-grid">
        {data.destinations.map((dest) => (
          <Tilt key={dest.name}>
            <button type="button" className="popular-destination-card" onClick={() => onSelect(dest.name)}>
              <SmartImage className="popular-destination-img" src={dest.img} alt={dest.name} icon="🌍" />
              <div className="popular-destination-body">
                <h3>{dest.name}</h3>
                <p>{dest.blurb}</p>
              </div>
            </button>
          </Tilt>
        ))}
      </div>
    </section>
  )
}
