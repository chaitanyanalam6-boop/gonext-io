import { useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '../AuthContext'
import { useTheme } from '../ThemeContext'

function splitName(fullName: string | null | undefined) {
  const parts = (fullName ?? '').trim().split(/\s+/).filter(Boolean)
  return { first: parts[0] ?? '', last: parts.slice(1).join(' ') }
}

export default function Settings() {
  const { user, updateProfile } = useAuth()
  const { theme, setTheme } = useTheme()

  const initialName = splitName(user?.name)
  const [firstName, setFirstName] = useState(initialName.first)
  const [lastName, setLastName] = useState(initialName.last)
  const [phone, setPhone] = useState(user?.phone ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [profileStatus, setProfileStatus] = useState<string | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [profileSaving, setProfileSaving] = useState(false)

  if (!user) return null

  async function submitProfile(e: FormEvent) {
    e.preventDefault()
    setProfileError(null)
    setProfileStatus(null)
    setProfileSaving(true)
    try {
      const name = `${firstName.trim()} ${lastName.trim()}`.trim()
      await updateProfile({ name, phone, email })
      setProfileStatus('Profile updated.')
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Could not update profile.')
    } finally {
      setProfileSaving(false)
    }
  }

  return (
    <div className="settings-page">
      <h1>Settings</h1>

      <section className="settings-section">
        <h2>Profile</h2>
        <form onSubmit={submitProfile} className="settings-form">
          <div className="trip-form-row">
            <div className="field">
              <label htmlFor="settings-first-name">First name</label>
              <input
                id="settings-first-name"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="First name"
              />
            </div>
            <div className="field">
              <label htmlFor="settings-last-name">Last name</label>
              <input
                id="settings-last-name"
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Last name"
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="settings-phone">Phone number</label>
            <input
              id="settings-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. +1 555 123 4567"
            />
          </div>
          <div className="field">
            <label htmlFor="settings-email">Email address</label>
            <input id="settings-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>

          {profileError && <p className="error-banner settings-inline-message">{profileError}</p>}
          {profileStatus && <p className="settings-success">{profileStatus}</p>}

          <button type="submit" className="header-cta settings-submit" disabled={profileSaving}>
            {profileSaving ? 'Saving…' : 'Save profile'}
          </button>
        </form>
      </section>

      <section className="settings-section">
        <h2>Appearance</h2>
        <div className="theme-toggle">
          <button
            type="button"
            className={`theme-option ${theme === 'light' ? 'active' : ''}`}
            onClick={() => setTheme('light')}
          >
            ☀️ Light
          </button>
          <button
            type="button"
            className={`theme-option ${theme === 'dark' ? 'active' : ''}`}
            onClick={() => setTheme('dark')}
          >
            🌙 Dark
          </button>
        </div>
      </section>
    </div>
  )
}
