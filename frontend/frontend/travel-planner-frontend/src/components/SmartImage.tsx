import { useState } from 'react'

interface SmartImageProps {
  src: string
  alt: string
  className?: string
  icon?: string
}

export default function SmartImage({ src, alt, className, icon = '🖼️' }: SmartImageProps) {
  const [failed, setFailed] = useState(false)

  if (failed || !src) {
    return (
      <div className={`${className ?? ''} img-fallback`.trim()}>
        <span className="img-fallback-icon">{icon}</span>
        <span className="img-fallback-label">{alt}</span>
      </div>
    )
  }

  return <img className={className} src={src} alt={alt} onError={() => setFailed(true)} />
}
