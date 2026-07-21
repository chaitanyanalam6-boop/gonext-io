interface LogoMarkProps {
  showTagline?: boolean
  size?: number
}

export default function LogoMark({ showTagline = false, size = 34 }: LogoMarkProps) {
  return (
    <span className="brand-mark">
      <svg width={size} height={size} viewBox="0 0 48 48" className="brand-mark-icon" aria-hidden="true">
        <rect x="2" y="2" width="44" height="44" rx="13" fill="none" stroke="#d4a72c" strokeWidth="2.5" />
        <path
          d="M15 13 L27 24 L15 35"
          fill="none"
          stroke="#8a7a2a"
          strokeWidth="7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M20 13 L32 24 L20 35"
          fill="none"
          stroke="#d4a72c"
          strokeWidth="7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="brand-mark-text">
        <span className="brand-mark-wordmark">
          <span className="brand-go">Go</span>
          <span className="brand-next">Next</span>
          <span className="brand-io">.io</span>
        </span>
        {showTagline && <span className="brand-tagline">Travel &amp; Mobility</span>}
      </span>
    </span>
  )
}
