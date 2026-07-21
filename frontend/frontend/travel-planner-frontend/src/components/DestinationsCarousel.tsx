import { useEffect, useRef, useState } from 'react'
import * as api from '../api'
import type { InspirationResponse } from '../api'
import SmartImage from './SmartImage'
import Tilt from './Tilt'

interface DestinationsCarouselProps {
  onSelect: (destination: string) => void
}

export default function DestinationsCarousel({ onSelect }: DestinationsCarouselProps) {
  const [data, setData] = useState<InspirationResponse | null>(null)
  const trackRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api.getInspiration().then(setData).catch(() => setData(null))
  }, [])

  function scroll(direction: 1 | -1) {
    trackRef.current?.scrollBy({ left: direction * 320, behavior: 'smooth' })
  }

  if (!data || data.destinations.length === 0) return null

  return (
    <section className="destinations-carousel">
      <h2>Popular Destinations</h2>
      <div className="carousel-row">
        <button type="button" className="carousel-arrow" onClick={() => scroll(-1)} aria-label="Scroll left">
          ‹
        </button>

        <div className="carousel-track" ref={trackRef}>
          {data.destinations.map((dest) => (
            <Tilt key={dest.name} className="carousel-card-tilt">
              <button type="button" className="carousel-card" onClick={() => onSelect(dest.name)}>
                <SmartImage className="carousel-card-img" src={dest.img} alt={dest.name} icon="🌍" />
                <div className="carousel-card-body">
                  <h3>{dest.name}</h3>
                  <p>{dest.blurb}</p>
                </div>
              </button>
            </Tilt>
          ))}
        </div>

        <button type="button" className="carousel-arrow" onClick={() => scroll(1)} aria-label="Scroll right">
          ›
        </button>
      </div>
    </section>
  )
}
