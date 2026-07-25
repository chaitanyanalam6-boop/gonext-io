import { useEffect, useState } from 'react'
import TripForm from './components/TripForm'
import TripWorkspace from './components/TripWorkspace'
import LoadingView from './components/LoadingView'
import AppHeader from './components/AppHeader'
import AuthModal from './components/AuthModal'
import MyTrips from './components/MyTrips'
import Discover from './components/Discover'
import Community from './components/Community'
import SharedTripView from './components/SharedTripView'
import Settings from './components/Settings'
import { generateTrip, getTrip, saveTrip, updateTrip } from './api'
import { useAuth } from './AuthContext'
import type { TripPlanResponse, TripRequest } from './types'

type Screen = 'plan' | 'discover' | 'loading' | 'workspace' | 'myTrips' | 'community' | 'sharedTrip' | 'settings'

// Trip generation regularly takes 10-30+ seconds (AI call plus per-activity geocoding).
// Mobile browsers routinely reload or discard a backgrounded tab during that window —
// switching apps, taking a call, or even just the back gesture — which wipes all
// in-memory state. Stashing the in-flight request here lets a fresh mount detect
// "generation was interrupted" and resume it, instead of dropping the user back on
// an empty form. sessionStorage (not localStorage) is deliberate: it's scoped to this
// tab and survives exactly the reload/discard-and-restore cycle we're guarding against.
const PENDING_REQUEST_KEY = 'gonext-pending-trip-request'

export default function App() {
  const { token } = useAuth()
  const [screen, setScreen] = useState<Screen>('plan')
  const [trip, setTrip] = useState<TripPlanResponse | null>(null)
  const [notes, setNotes] = useState('')
  const [savedTripId, setSavedTripId] = useState<number | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingDestination, setPendingDestination] = useState('')
  const [presetDestination, setPresetDestination] = useState('')
  const [authMode, setAuthMode] = useState<'login' | 'signup' | null>(null)
  const [viewingSharedTripId, setViewingSharedTripId] = useState<number | null>(null)

  async function handleSubmit(request: TripRequest) {
    setScreen('loading')
    setError(null)
    setPendingDestination(request.destination)
    sessionStorage.setItem(PENDING_REQUEST_KEY, JSON.stringify(request))
    try {
      const result = await generateTrip(request)
      sessionStorage.removeItem(PENDING_REQUEST_KEY)
      setTrip(result)
      setNotes('')
      setSavedTripId(null)
      setDirty(false)
      setScreen('workspace')
    } catch (err) {
      sessionStorage.removeItem(PENDING_REQUEST_KEY)
      setError(err instanceof Error ? err.message : 'Something went wrong.')
      setScreen('plan')
    }
  }

  // Runs once on mount: if a generation request was left pending (see above), the
  // previous mount never got to see the result — resume it rather than showing the
  // "plan" screen's empty form.
  useEffect(() => {
    const raw = sessionStorage.getItem(PENDING_REQUEST_KEY)
    if (!raw) return
    sessionStorage.removeItem(PENDING_REQUEST_KEY)
    try {
      const request = JSON.parse(raw) as TripRequest
      handleSubmit(request)
    } catch {
      // Malformed leftover state — nothing to resume.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleReset() {
    setTrip(null)
    setError(null)
    setScreen('plan')
  }

  function handleNavigate(target: 'plan' | 'discover' | 'myTrips' | 'community' | 'settings') {
    if (target === 'settings' && !token) {
      setAuthMode('login')
      return
    }
    // "Plan" doubles as "back to my current trip" when one is open — only the
    // explicit "+ Plan a new trip" action (handleReset) should discard it.
    if (target === 'plan' && trip) {
      setScreen('workspace')
      return
    }
    setScreen(target)
  }

  // The logo is always "go home to the destination form" — unlike the "Plan" nav
  // tab, it doesn't resume an in-progress trip. The trip itself is left in memory
  // (not reset) so "Plan" can still get back to it if the user didn't mean to leave.
  function handleGoHome() {
    setScreen('plan')
  }

  function handleSelectFromDiscover(destination: string) {
    setPresetDestination(destination)
    setScreen('plan')
  }

  async function handleOpenTrip(id: number) {
    if (!token) return
    const detail = await getTrip(token, id)
    setTrip(detail.trip)
    setNotes(detail.notes)
    setSavedTripId(detail.id)
    setDirty(false)
    setScreen('workspace')
  }

  function handleNotesChange(next: string) {
    setNotes(next)
    if (savedTripId !== null) setDirty(true)
  }

  async function handleSave() {
    if (!token || !trip) {
      setAuthMode('login')
      return
    }
    setSaving(true)
    try {
      // Re-saving an already-saved trip should overwrite that row, not create another
      // copy in My Trips.
      const summary = savedTripId
        ? await updateTrip(token, savedTripId, trip, notes)
        : await saveTrip(token, trip, notes)
      setSavedTripId(summary.id)
      setDirty(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save trip.')
    } finally {
      setSaving(false)
    }
  }

  function openSharedTrip(id: number) {
    setViewingSharedTripId(id)
    setScreen('sharedTrip')
  }

  return (
    <div className="app">
      <AppHeader
        activeScreen={screen}
        onNavigate={handleNavigate}
        onGoHome={handleGoHome}
        onOpenAuth={(mode) => setAuthMode(mode)}
      />

      {screen === 'plan' && (
        <>
          <TripForm onSubmit={handleSubmit} loading={false} presetDestination={presetDestination} />
          {error && <p className="error-banner">{error}</p>}
        </>
      )}

      {screen === 'discover' && <Discover onSelectDestination={handleSelectFromDiscover} />}

      {screen === 'loading' && <LoadingView destination={pendingDestination} />}

      {screen === 'workspace' && trip && (
        <TripWorkspace
          trip={trip}
          tripId={savedTripId}
          notes={notes}
          onNotesChange={handleNotesChange}
          isLoggedIn={!!token}
          isSaved={savedTripId !== null && !dirty}
          saving={saving}
          onSave={handleSave}
          onRequireAuth={() => setAuthMode('login')}
        />
      )}

      {screen === 'myTrips' && <MyTrips onOpenTrip={handleOpenTrip} onNewTrip={handleReset} />}

      {screen === 'community' && (
        <Community
          onOpenTrip={openSharedTrip}
          onNewTrip={handleReset}
          onRequireAuth={() => setAuthMode('login')}
        />
      )}

      {screen === 'sharedTrip' && viewingSharedTripId !== null && (
        <SharedTripView
          tripId={viewingSharedTripId}
          onBack={() => setScreen('community')}
          onRequireAuth={() => setAuthMode('login')}
        />
      )}

      {screen === 'settings' && token && <Settings />}

      {authMode && <AuthModal initialMode={authMode} onClose={() => setAuthMode(null)} />}
    </div>
  )
}
