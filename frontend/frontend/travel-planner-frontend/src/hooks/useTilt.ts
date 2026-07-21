import { useRef } from 'react'
import type { MouseEvent } from 'react'

const MAX_TILT_DEG = 7

// Cursor-follow 3D tilt for cards (the Apple product-tile effect). Reads/writes CSS
// custom properties rather than React state so movement never triggers a re-render.
export function useTilt<T extends HTMLElement>() {
  const ref = useRef<T>(null)

  function onMouseMove(e: MouseEvent<T>) {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const px = (e.clientX - rect.left) / rect.width - 0.5
    const py = (e.clientY - rect.top) / rect.height - 0.5
    el.style.setProperty('--tilt-x', `${(-py * MAX_TILT_DEG).toFixed(2)}deg`)
    el.style.setProperty('--tilt-y', `${(px * MAX_TILT_DEG).toFixed(2)}deg`)
    el.style.setProperty('--tilt-scale', '1.03')
  }

  function onMouseLeave() {
    const el = ref.current
    if (!el) return
    el.style.setProperty('--tilt-x', '0deg')
    el.style.setProperty('--tilt-y', '0deg')
    el.style.setProperty('--tilt-scale', '1')
  }

  return { ref, onMouseMove, onMouseLeave }
}
