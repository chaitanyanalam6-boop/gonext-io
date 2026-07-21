import type { ReactNode } from 'react'
import { useTilt } from '../hooks/useTilt'

interface TiltProps {
  children: ReactNode
  className?: string
}

export default function Tilt({ children, className = '' }: TiltProps) {
  const { ref, onMouseMove, onMouseLeave } = useTilt<HTMLDivElement>()

  return (
    <div
      ref={ref}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      className={`tilt-card ${className}`.trim()}
    >
      {children}
    </div>
  )
}
