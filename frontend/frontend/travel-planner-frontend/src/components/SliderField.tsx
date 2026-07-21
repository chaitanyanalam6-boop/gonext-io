import { useEffect, useState } from 'react'

interface SliderFieldProps {
  id: string
  label: string
  min: number
  max: number
  step: number
  value: number
  onChange: (value: number) => void
}

export default function SliderField({ id, label, min, max, step, value, onChange }: SliderFieldProps) {
  const [draft, setDraft] = useState(String(value))

  useEffect(() => {
    setDraft(String(value))
  }, [value])

  function commitDraft() {
    const n = Number(draft)
    if (draft.trim() === '' || Number.isNaN(n)) {
      setDraft(String(value))
      return
    }
    onChange(Math.min(Math.max(n, min), max))
  }

  return (
    <div className="field slider-field">
      <div className="slider-field-head">
        <label htmlFor={id}>{label}</label>
        <input
          id={`${id}-number`}
          type="number"
          className="slider-value-input"
          aria-label={label}
          min={min}
          max={max}
          // Deliberately "any", not the slider's step: manual entry should accept any
          // exact number the user types (e.g. precisely $1000). A step constraint here
          // doesn't just affect the spinner arrows — HTML also silently blocks the whole
          // form's submit when the value isn't step-aligned, which is exactly what broke
          // "Plan my trip" as soon as this field existed with a non-1 step.
          step="any"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitDraft}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commitDraft()
              ;(e.target as HTMLInputElement).blur()
            }
          }}
        />
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="range-slider"
      />
    </div>
  )
}
