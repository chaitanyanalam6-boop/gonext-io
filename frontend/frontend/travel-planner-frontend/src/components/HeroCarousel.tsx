import { useEffect, useState } from 'react'
import SmartImage from './SmartImage'

interface HeroCarouselProps {
  images: string[]
  alt: string
}

const SLIDE_INTERVAL_MS = 4500

export default function HeroCarousel({ images, alt }: HeroCarouselProps) {
  const [index, setIndex] = useState(0)
  const slides = images.length > 0 ? images : ['']
  const slidesKey = slides.join('|')

  useEffect(() => {
    setIndex(0)
  }, [slidesKey])

  useEffect(() => {
    if (slides.length <= 1) return
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % slides.length)
    }, SLIDE_INTERVAL_MS)
    return () => clearInterval(id)
  }, [slides.length])

  return (
    <div className="hero-carousel">
      <div
        className="hero-carousel-track"
        style={{
          // The percentage in translateX() resolves against the track's OWN width
          // (slides.length * 100%), not one slide's width — so shifting by one slide
          // means moving (100 / slides.length)% per step, not a flat 100%.
          transform: `translateX(-${index * (100 / slides.length)}%)`,
          width: `${slides.length * 100}%`,
        }}
      >
        {slides.map((src, i) => (
          <div className="hero-carousel-slide" key={i} style={{ width: `${100 / slides.length}%` }}>
            <SmartImage className="hero-card-img" src={src} alt={alt} icon="🗺️" />
          </div>
        ))}
      </div>

      {slides.length > 1 && (
        <div className="hero-carousel-dots">
          {slides.map((_, i) => (
            <span key={i} className={`hero-carousel-dot ${i === index ? 'active' : ''}`} />
          ))}
        </div>
      )}
    </div>
  )
}
