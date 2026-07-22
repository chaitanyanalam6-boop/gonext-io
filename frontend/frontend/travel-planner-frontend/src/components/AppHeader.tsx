import { useState } from 'react'
import { useAuth } from '../AuthContext'
import { SUPPORTED_CURRENCIES, useCurrency } from '../CurrencyContext'
import LogoMark from './LogoMark'
import type { User } from '../types'

export type Screen = 'plan' | 'discover' | 'loading' | 'workspace' | 'myTrips' | 'community' | 'sharedTrip' | 'settings'
type NavTarget = 'plan' | 'discover' | 'myTrips' | 'community' | 'settings'

interface AppHeaderProps {
  activeScreen: Screen
  onNavigate: (screen: NavTarget) => void
  onGoHome: () => void
  onOpenAuth: (mode: 'login' | 'signup') => void
}

const NAV_ITEMS: { label: string; screen: NavTarget }[] = [
  { label: 'Plan', screen: 'plan' },
  { label: 'Discover', screen: 'discover' },
  { label: 'My Trips', screen: 'myTrips' },
  { label: 'Settings', screen: 'settings' },
]

function initials(user: User) {
  const name = user.name?.trim()
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean)
    const firstInitial = parts[0]?.[0] ?? ''
    const lastInitial = parts.length > 1 ? parts[parts.length - 1][0] : ''
    return (firstInitial + lastInitial).toUpperCase()
  }
  return user.email[0]?.toUpperCase() ?? '?'
}

export default function AppHeader({ activeScreen, onNavigate, onGoHome, onOpenAuth }: AppHeaderProps) {
  const { user, logout } = useAuth()
  const { currency, setCurrency } = useCurrency()
  const [menuOpen, setMenuOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  function navigate(screen: NavTarget) {
    setMobileNavOpen(false)
    onNavigate(screen)
  }

  function goHome() {
    setMobileNavOpen(false)
    onGoHome()
  }

  // The trip workspace is reached via the "Plan" tab (it has no tab of its own), so
  // keep "Plan" highlighted while it's open.
  function isTabActive(screen: NavTarget) {
    return activeScreen === screen || (screen === 'plan' && activeScreen === 'workspace')
  }

  return (
    <header className="app-header">
      <button type="button" className="app-logo" aria-label="GoNext.io home" onClick={goHome}>
        <LogoMark size={30} />
      </button>

      <nav className="app-nav">
        {NAV_ITEMS.map(({ label, screen }) => (
          <button
            type="button"
            key={screen}
            className={`nav-tab ${isTabActive(screen) ? 'active' : ''}`}
            onClick={() => navigate(screen)}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="app-header-actions">
        <select
          aria-label="Currency"
          className="header-currency-select"
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
        >
          {SUPPORTED_CURRENCIES.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>

        {user ? (
          <div className="avatar-menu">
            <button type="button" className="avatar-button" onClick={() => setMenuOpen((v) => !v)}>
              {initials(user)}
            </button>
            {menuOpen && (
              <div className="avatar-dropdown" onMouseLeave={() => setMenuOpen(false)}>
                <span className="avatar-dropdown-email">{user.name || user.email}</span>
                <button
                  type="button"
                  className="avatar-dropdown-item"
                  onClick={() => {
                    setMenuOpen(false)
                    navigate('myTrips')
                  }}
                >
                  My trips
                </button>
                <button
                  type="button"
                  className="avatar-dropdown-item"
                  onClick={() => {
                    setMenuOpen(false)
                    navigate('settings')
                  }}
                >
                  Settings
                </button>
                <button
                  type="button"
                  className="avatar-dropdown-item"
                  onClick={() => {
                    setMenuOpen(false)
                    logout()
                  }}
                >
                  Log out
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            <button type="button" className="header-link" onClick={() => onOpenAuth('login')}>
              Log in
            </button>
            <button type="button" className="header-cta" onClick={() => onOpenAuth('signup')}>
              Create Account
            </button>
          </>
        )}

        <button
          type="button"
          className="mobile-menu-toggle"
          aria-label="Toggle navigation menu"
          onClick={() => setMobileNavOpen((v) => !v)}
        >
          {mobileNavOpen ? '✕' : '☰'}
        </button>
      </div>

      {mobileNavOpen && (
        <nav className="mobile-menu-panel">
          {NAV_ITEMS.map(({ label, screen }) => (
            <button
              type="button"
              key={screen}
              className={`nav-tab ${isTabActive(screen) ? 'active' : ''}`}
              onClick={() => navigate(screen)}
            >
              {label}
            </button>
          ))}

          <div className="mobile-menu-currency">
            <label htmlFor="mobile-currency-select">Currency</label>
            <select
              id="mobile-currency-select"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              {SUPPORTED_CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </div>

          {!user && (
            <div className="mobile-menu-auth">
              <button
                type="button"
                className="header-link"
                onClick={() => {
                  setMobileNavOpen(false)
                  onOpenAuth('login')
                }}
              >
                Log in
              </button>
              <button
                type="button"
                className="header-cta"
                onClick={() => {
                  setMobileNavOpen(false)
                  onOpenAuth('signup')
                }}
              >
                Create Account
              </button>
            </div>
          )}
        </nav>
      )}
    </header>
  )
}
